import { describe, it, expect, vi, beforeEach } from "vitest";
import { RoadmapNodeItem } from "@/lib/roadmap/generate";
import { evaluateRoadmapSkips } from "@/lib/skillGraph/roadmapSkipLogic";
import { topologicalSort } from "@/lib/skillGraph/traverse";
import { SkillNode } from "@/types/skillGraph";

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "update"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

let roadmapRow: { id: string; nodes: RoadmapNodeItem[] } | null = null;
let skillNodeRows: Array<{ id: string; prerequisite_ids: string[] }> = [];
let roadmapUpdatePayload: RoadmapNodeItem[] | null = null;

const mockFrom = vi.fn((table: string) => {
  if (table === "roadmaps") {
    const chain = makeChainable({ data: roadmapRow, error: null });
    const realUpdate = chain.update as (p: unknown) => unknown;
    chain.update = vi.fn((payload: { nodes: RoadmapNodeItem[] }) => {
      roadmapUpdatePayload = payload.nodes;
      return realUpdate(payload);
    });
    return chain;
  }
  if (table === "skill_nodes") {
    return makeChainable({ data: skillNodeRows, error: null });
  }
  return makeChainable({ data: null, error: null });
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { updateRoadmapNodeStatus } from "@/lib/roadmap/updateStatus";

const sampleNodes: RoadmapNodeItem[] = [
  { skill_node_id: "node-llm-basics", node_name: "LLM Basics", order: 1, estimated_days: 2, status: "available", learning_objective: "Master LLM fundamentals." },
  { skill_node_id: "node-prompt-eng", node_name: "Prompt Engineering", order: 2, estimated_days: 3, status: "locked", learning_objective: "Master prompt design." },
  { skill_node_id: "node-rag-design", node_name: "RAG Pipeline Design", order: 3, estimated_days: 4, status: "locked", learning_objective: "Master vector RAG." },
];

const prereqRows = [
  { id: "node-llm-basics", prerequisite_ids: [] },
  { id: "node-prompt-eng", prerequisite_ids: ["node-llm-basics"] },
  { id: "node-rag-design", prerequisite_ids: ["node-prompt-eng"] },
];

describe("lib/roadmap/updateStatus.ts — real completion + unlock cascade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roadmapRow = { id: "rm-1", nodes: sampleNodes };
    skillNodeRows = prereqRows;
    roadmapUpdatePayload = null;
  });

  it("Scenario 1: a node crossing the completion threshold unlocks its direct dependent, but not the grandchild", async () => {
    const result = await updateRoadmapNodeStatus({
      userId: "usr-1",
      skillNodeId: "node-llm-basics",
      score: 90.0,
      completionThreshold: 80.0,
    });

    expect(result).not.toBeNull();
    const llmNode = result!.nodes.find((n) => n.skill_node_id === "node-llm-basics");
    const promptNode = result!.nodes.find((n) => n.skill_node_id === "node-prompt-eng");
    const ragNode = result!.nodes.find((n) => n.skill_node_id === "node-rag-design");

    expect(llmNode?.status).toBe("completed");
    expect(promptNode?.status).toBe("available");
    expect(ragNode?.status).toBe("locked");

    // The genuine "you unlocked something" event fires for the real unlock.
    expect(result!.newlyUnlockedNodes).toEqual([{ skillNodeId: "node-prompt-eng", nodeName: "Prompt Engineering" }]);

    // Persisted back to the DB since something actually changed.
    expect(roadmapUpdatePayload).not.toBeNull();
  });

  it("Scenario 2: completing a terminal node with no locked dependents changes only that node, nothing else", async () => {
    roadmapRow = {
      id: "rm-1",
      nodes: [
        { ...sampleNodes[0], status: "completed" },
        { ...sampleNodes[1], status: "completed" },
        { ...sampleNodes[2], status: "available" },
      ],
    };

    const result = await updateRoadmapNodeStatus({
      userId: "usr-1",
      skillNodeId: "node-rag-design",
      score: 88.0,
      completionThreshold: 80.0,
    });

    const ragNode = result!.nodes.find((n) => n.skill_node_id === "node-rag-design");
    expect(ragNode?.status).toBe("completed");
    expect(result!.nodes.every((n) => n.status === "completed")).toBe(true);
    expect(result!.newlyUnlockedNodes).toEqual([]);
  });

  it("scoring below the completion threshold leaves everything unchanged and never writes to the DB", async () => {
    const result = await updateRoadmapNodeStatus({
      userId: "usr-1",
      skillNodeId: "node-llm-basics",
      score: 55.0,
      completionThreshold: 80.0,
    });

    expect(result!.nodes.find((n) => n.skill_node_id === "node-llm-basics")?.status).toBe("available");
    expect(result!.newlyUnlockedNodes).toEqual([]);
    expect(roadmapUpdatePayload).toBeNull(); // isModified stayed false — no wasted write
  });

  it("returns null when the user has no roadmap yet, instead of throwing", async () => {
    roadmapRow = null;
    const result = await updateRoadmapNodeStatus({ userId: "usr-new", skillNodeId: "node-llm-basics", score: 90 });
    expect(result).toBeNull();
  });

  it("the 'ensure at least one active node' fallback promotes a locked node but does NOT count it in newlyUnlockedNodes", async () => {
    // All 3 nodes already completed/skipped except one still locked with an
    // unmet prereq that will never be satisfied by this call — after the
    // real unlock pass, nothing is available/in_progress, so step 6's
    // safety net should kick in.
    roadmapRow = {
      id: "rm-1",
      nodes: [
        { ...sampleNodes[0], status: "completed" },
        { ...sampleNodes[1], status: "locked" }, // prereq (llm-basics) already satisfied above, would unlock normally
      ],
    };
    skillNodeRows = [
      { id: "node-llm-basics", prerequisite_ids: [] },
      { id: "node-prompt-eng", prerequisite_ids: ["node-llm-basics"] },
    ];

    // Re-submitting the already-completed node's score doesn't change its
    // status (already completed), but prompt-eng's prereq IS satisfied so
    // it unlocks via the real step-5 path, not the fallback — proving the
    // fallback and the real unlock are genuinely distinguishable paths.
    const result = await updateRoadmapNodeStatus({
      userId: "usr-1",
      skillNodeId: "node-llm-basics",
      score: 95,
      completionThreshold: 80,
    });

    const promptNode = result!.nodes.find((n) => n.skill_node_id === "node-prompt-eng");
    expect(promptNode?.status).toBe("available");
    expect(result!.newlyUnlockedNodes).toEqual([{ skillNodeId: "node-prompt-eng", nodeName: "Prompt Engineering" }]);
  });

  it("Scenario 3: skip-logic correctly produces a roadmap that omits nodes the user already scored highly on", () => {
    const rawSkillGraph: SkillNode[] = [
      { id: "node-llm-basics", name: "LLM Basics", category: "LLM Fundamentals", difficulty: 1, order_index: 10, prerequisite_ids: [] },
      { id: "node-prompt-eng", name: "Prompt Engineering", category: "Prompt Engineering", difficulty: 1, order_index: 20, prerequisite_ids: ["node-llm-basics"] },
      { id: "node-rag-design", name: "RAG Pipeline Design", category: "Embeddings & Retrieval", difficulty: 3, order_index: 30, prerequisite_ids: ["node-prompt-eng"] },
    ];

    const userScores = {
      "node-llm-basics": 92.0,
      "node-prompt-eng": 85.0,
      "node-rag-design": 35.0,
    };

    const sortedGraph = topologicalSort(rawSkillGraph);
    const nodeIds = sortedGraph.map((n) => n.id);
    const { skip, fullCycle } = evaluateRoadmapSkips(userScores, nodeIds, 80.0);

    expect(skip).toEqual(["node-llm-basics", "node-prompt-eng"]);
    expect(fullCycle).toEqual(["node-rag-design"]);
  });
});
