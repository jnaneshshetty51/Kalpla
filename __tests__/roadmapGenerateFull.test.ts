import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecuteLLMCallWithCap = vi.fn();
vi.mock("@/lib/llm/executeLLMCallWithCap", () => ({
  executeLLMCallWithCap: (params: unknown) => mockExecuteLLMCallWithCap(params),
}));

vi.mock("@/lib/llm/models", () => ({
  resolveModelConfig: () => ({ provider: "anthropic", modelId: "claude-sonnet-5" }),
}));

function chainableSelect(data: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data, error: null }));
  chain.then = (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data, error: null });
  return chain;
}

let skillNodeRows: Array<{ id: string; name: string; category: string; difficulty: number; prerequisite_ids: string[]; order_index: number }> = [];
let priorRoadmapNodes: unknown = null;
let competencyScoreRows: Array<{ skill_node_id: string; score: number }> = [];
let insertedRoadmap: { id: string; user_id: string; generated_at: string; nodes: unknown } | null = null;
let insertError: { message: string } | null = null;
let insertPayloadCaptured: { user_id: string; nodes: unknown } | null = null;

function defaultMockFromImpl(table: string) {
  if (table === "skill_nodes") return chainableSelect(skillNodeRows);
  if (table === "roadmaps") {
    const chain = chainableSelect(priorRoadmapNodes ? { nodes: priorRoadmapNodes } : null);
    chain.insert = vi.fn((payload: { user_id: string; nodes: unknown }) => {
      insertPayloadCaptured = payload;
      insertedRoadmap = { id: "roadmap-new-1", user_id: payload.user_id, generated_at: "2026-08-06T00:00:00Z", nodes: payload.nodes };
      return {
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: insertError ? null : insertedRoadmap, error: insertError })),
        })),
      };
    });
    return chain;
  }
  if (table === "competency_scores") return chainableSelect(competencyScoreRows);
  return chainableSelect([]);
}

const mockFrom = vi.fn(defaultMockFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { generateUserRoadmap } from "@/lib/roadmap/generate";

const THREE_NODES = [
  { id: "node-1", name: "LLM Basics", category: "LLM Fundamentals", difficulty: 1, prerequisite_ids: [], order_index: 1 },
  { id: "node-2", name: "Prompt Engineering", category: "Prompt Engineering", difficulty: 2, prerequisite_ids: ["node-1"], order_index: 2 },
  { id: "node-3", name: "RAG Pipeline Design", category: "Embeddings & Retrieval", difficulty: 3, prerequisite_ids: ["node-2"], order_index: 3 },
];

function validLLMRoadmapJson(nodes: typeof THREE_NODES) {
  return JSON.stringify({
    nodes: nodes.map((n, idx) => ({
      skill_node_id: n.id,
      node_name: n.name,
      order: idx + 1,
      estimated_days: 5,
      status: "available",
      learning_objective: `Master ${n.name}.`,
    })),
  });
}

describe("lib/roadmap/generate.ts — generateUserRoadmap (core roadmap generation, LLM + deterministic fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFromImpl);
    skillNodeRows = THREE_NODES;
    priorRoadmapNodes = null;
    competencyScoreRows = [];
    insertedRoadmap = null;
    insertError = null;
    insertPayloadCaptured = null;
  });

  it("on a valid LLM response, produces nodes in strict topological order with the first available and rest locked", async () => {
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: validLLMRoadmapJson(THREE_NODES) });

    const result = await generateUserRoadmap({ userId: "usr-1" });

    expect(result.nodes.map((n) => n.skill_node_id)).toEqual(["node-1", "node-2", "node-3"]);
    expect(result.nodes[0].status).toBe("available");
    expect(result.nodes[1].status).toBe("locked");
    expect(result.nodes[2].status).toBe("locked");
  });

  it("falls back to deterministic node generation when the LLM call fails outright (e.g. usage cap exceeded)", async () => {
    mockExecuteLLMCallWithCap.mockRejectedValue(new Error("usage cap exceeded"));

    const result = await generateUserRoadmap({ userId: "usr-1" });

    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[0].status).toBe("available");
    expect(result.nodes.every((n) => n.estimated_days >= 1)).toBe(true);
  });

  it("falls back to deterministic generation when the LLM returns unparseable/invalid JSON, rather than throwing", async () => {
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: "not valid json" });

    const result = await generateUserRoadmap({ userId: "usr-1" });
    expect(result.nodes).toHaveLength(3);
  });

  it("nodes scoring above the skip threshold are marked 'skipped' and excluded from the LLM prompt's active sequence", async () => {
    competencyScoreRows = [{ skill_node_id: "node-1", score: 92 }]; // above 80 default threshold
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: validLLMRoadmapJson([THREE_NODES[1], THREE_NODES[2]]) });

    const result = await generateUserRoadmap({ userId: "usr-1" });

    const node1 = result.nodes.find((n) => n.skill_node_id === "node-1");
    expect(node1?.status).toBe("skipped");

    // The LLM prompt itself should never have been asked about the skipped node.
    const callArgs = mockExecuteLLMCallWithCap.mock.calls[0][0] as { messages: Array<{ content: string }> };
    const userMsg = callArgs.messages.find((m) => m.content.includes("MANDATORY TOPOLOGICAL"));
    expect(userMsg!.content).not.toContain('"id": "node-1"');
  });

  it("a node genuinely completed in the PRIOR roadmap stays 'completed' on regeneration, overriding both fresh skip-logic and the default locked/available assignment", async () => {
    priorRoadmapNodes = [
      { skill_node_id: "node-1", node_name: "LLM Basics", order: 1, estimated_days: 3, status: "completed" },
    ];
    // Diagnostic re-scoring happens to now be low, which alone would NOT mark it skipped —
    // the real regression this guards: prior completion must survive regardless.
    competencyScoreRows = [{ skill_node_id: "node-1", score: 30 }];
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: validLLMRoadmapJson(THREE_NODES) });

    const result = await generateUserRoadmap({ userId: "usr-1" });
    const node1 = result.nodes.find((n) => n.skill_node_id === "node-1");
    expect(node1?.status).toBe("completed");
  });

  it("a node completed in the prior roadmap AND now above the skip threshold is preserved as 'completed', not downgraded to 'skipped'", async () => {
    priorRoadmapNodes = [
      { skill_node_id: "node-1", node_name: "LLM Basics", order: 1, estimated_days: 3, status: "completed" },
    ];
    competencyScoreRows = [{ skill_node_id: "node-1", score: 95 }]; // also above skip threshold
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: validLLMRoadmapJson([THREE_NODES[1], THREE_NODES[2]]) });

    const result = await generateUserRoadmap({ userId: "usr-1" });
    const node1 = result.nodes.find((n) => n.skill_node_id === "node-1");
    expect(node1?.status).toBe("completed"); // not "skipped"
  });

  it("if every node ends up completed/locked with nothing active, the safety net promotes the first locked node to available", async () => {
    priorRoadmapNodes = [
      { skill_node_id: "node-1", node_name: "LLM Basics", order: 1, estimated_days: 3, status: "completed" },
    ];
    competencyScoreRows = [{ skill_node_id: "node-1", score: 95 }];
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: validLLMRoadmapJson([THREE_NODES[1], THREE_NODES[2]]) });

    const result = await generateUserRoadmap({ userId: "usr-1" });
    const hasActive = result.nodes.some((n) => n.status === "available" || n.status === "in_progress" || n.status === "completed");
    expect(hasActive).toBe(true);
    // node-2 (first non-completed node) should be promoted to available since node-1 is completed already.
    const node2 = result.nodes.find((n) => n.skill_node_id === "node-2");
    expect(node2?.status).toBe("available");
  });

  it("persists the final node array to the roadmaps table under the correct user_id", async () => {
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: validLLMRoadmapJson(THREE_NODES) });
    await generateUserRoadmap({ userId: "usr-specific-1" });

    expect(insertPayloadCaptured).not.toBeNull();
    expect(insertPayloadCaptured!.user_id).toBe("usr-specific-1");
    expect(Array.isArray(insertPayloadCaptured!.nodes)).toBe(true);
  });

  it("throws clearly when skill_nodes can't be fetched, rather than generating an empty/broken roadmap", async () => {
    skillNodeRows = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") return chainableSelect(null); // empty data -> triggers the error path
      return defaultMockFromImpl(table);
    });

    await expect(generateUserRoadmap({ userId: "usr-1" })).rejects.toThrow(/Failed to fetch skill nodes/);
  });

  it("throws clearly when the roadmap insert fails, rather than returning a fabricated success", async () => {
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: validLLMRoadmapJson(THREE_NODES) });
    insertError = { message: "unique constraint violation" };

    await expect(generateUserRoadmap({ userId: "usr-1" })).rejects.toThrow(/Failed to persist roadmap/);
  });
});
