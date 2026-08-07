import { describe, it, expect, vi, beforeEach } from "vitest";
import { RoadmapNodeItem } from "@/lib/roadmap/generate";

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.single = vi.fn(() => Promise.resolve(result));
  return chain;
}

let roadmapNodes: RoadmapNodeItem[] | null = null;
let skillNodeCategory: string | null = null;

const mockFrom = vi.fn((table: string) => {
  if (table === "roadmaps") {
    return makeChainable({ data: roadmapNodes ? { nodes: roadmapNodes } : null, error: null });
  }
  if (table === "skill_nodes") {
    return makeChainable({ data: skillNodeCategory ? { category: skillNodeCategory } : null, error: null });
  }
  return makeChainable({ data: null, error: null });
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

const mockGenerateUserRoadmap = vi.fn();
vi.mock("@/lib/roadmap/generate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/roadmap/generate")>();
  return { ...actual, generateUserRoadmap: (params: unknown) => mockGenerateUserRoadmap(params) };
});

import { getRecommendedNextStep } from "@/lib/roadmap/nextStep";

describe("lib/roadmap/nextStep.ts — getRecommendedNextStep target selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roadmapNodes = null;
    skillNodeCategory = "LLM Fundamentals";
  });

  it("prioritizes an in_progress node over an available one, action_type continue_exercise", async () => {
    roadmapNodes = [
      { skill_node_id: "node-1", node_name: "LLM Basics", order: 1, estimated_days: 2, status: "completed" },
      { skill_node_id: "node-2", node_name: "Prompt Engineering", order: 2, estimated_days: 3, status: "in_progress" },
      { skill_node_id: "node-3", node_name: "Vector Search", order: 3, estimated_days: 3, status: "available" },
    ];

    const rec = await getRecommendedNextStep("usr-1");
    expect(rec.skill_node_id).toBe("node-2");
    expect(rec.action_type).toBe("continue_exercise");
    expect(rec.action_label).toBe("Continue Exercise →");
    expect(rec.target_url).toBe("/learn/node-2");
  });

  it("falls back to the first available node when none is in_progress", async () => {
    roadmapNodes = [
      { skill_node_id: "node-1", node_name: "LLM Basics", order: 1, estimated_days: 2, status: "skipped" },
      { skill_node_id: "node-2", node_name: "Prompt Engineering", order: 2, estimated_days: 3, status: "available" },
      { skill_node_id: "node-3", node_name: "Vector Search", order: 3, estimated_days: 3, status: "locked" },
    ];

    const rec = await getRecommendedNextStep("usr-1");
    expect(rec.skill_node_id).toBe("node-2");
    expect(rec.action_type).toBe("start_lesson");
  });

  it("recommends action_type submit_project when the target node name contains 'project'", async () => {
    roadmapNodes = [{ skill_node_id: "node-cap", node_name: "Capstone Project: Agent Router", order: 1, estimated_days: 5, status: "available" }];

    const rec = await getRecommendedNextStep("usr-1");
    expect(rec.action_type).toBe("submit_project");
    expect(rec.action_label).toBe("Build Project Challenge →");
  });

  it("recommends action_type submit_project when the target node name contains 'rag pipeline' (case-insensitive), even without the word 'project'", async () => {
    roadmapNodes = [{ skill_node_id: "node-rag", node_name: "RAG Pipeline Design", order: 1, estimated_days: 4, status: "available" }];

    const rec = await getRecommendedNextStep("usr-1");
    expect(rec.action_type).toBe("submit_project");
  });

  it("returns roadmap_completed with target_url /roadmap when every node is completed or skipped", async () => {
    roadmapNodes = [
      { skill_node_id: "node-1", node_name: "LLM Basics", order: 1, estimated_days: 2, status: "completed" },
      { skill_node_id: "node-2", node_name: "Prompt Engineering", order: 2, estimated_days: 3, status: "skipped" },
    ];

    const rec = await getRecommendedNextStep("usr-1");
    expect(rec.action_type).toBe("roadmap_completed");
    expect(rec.target_url).toBe("/roadmap");
  });

  it("fetches and attaches the real category from skill_nodes, not a hardcoded default", async () => {
    roadmapNodes = [{ skill_node_id: "node-1", node_name: "Vector Indexing", order: 1, estimated_days: 3, status: "available" }];
    skillNodeCategory = "Embeddings & Retrieval";

    const rec = await getRecommendedNextStep("usr-1");
    expect(rec.category).toBe("Embeddings & Retrieval");
  });

  it("auto-generates a roadmap when the user has none yet, rather than erroring", async () => {
    roadmapNodes = null;
    mockGenerateUserRoadmap.mockResolvedValue({
      nodes: [{ skill_node_id: "node-1", node_name: "LLM Basics", order: 1, estimated_days: 2, status: "available" }],
    });

    const rec = await getRecommendedNextStep("usr-brand-new");
    expect(mockGenerateUserRoadmap).toHaveBeenCalledWith({ userId: "usr-brand-new" });
    expect(rec.skill_node_id).toBe("node-1");
  });

  it("falls back to a default estimated_days and a generated learning_objective when the node data omits them", async () => {
    roadmapNodes = [{ skill_node_id: "node-1", node_name: "LLM Basics", order: 1, estimated_days: 0, status: "available" } as RoadmapNodeItem];

    const rec = await getRecommendedNextStep("usr-1");
    expect(rec.estimated_days).toBe(2); // real fallback default
    expect(rec.learning_objective).toContain("LLM Basics");
  });
});
