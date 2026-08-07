import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockResolveModelConfig = vi.fn();
vi.mock("@/lib/llm/models", () => ({
  resolveModelConfig: (...args: unknown[]) => mockResolveModelConfig(...args),
}));

const mockExecuteLLMCallWithCap = vi.fn();
vi.mock("@/lib/llm/executeLLMCallWithCap", () => ({
  executeLLMCallWithCap: (params: unknown) => mockExecuteLLMCallWithCap(params),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "order", "eq"]) {
    chain[m] = vi.fn(() => chain);
  }
  // Neither query has a terminal .single()/.maybeSingle() in the route —
  // awaiting the chain itself resolves it, so make the chain thenable.
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

let skillNodeRows: Array<{ id: string; name: string; category: string; difficulty: number; order_index: number }> | null;
let skillNodeError: { message: string } | null;
let competencyScoreRows: Array<{ skill_node_id: string; score: number }> | null;

function defaultMockFromImpl(table: string) {
  if (table === "skill_nodes") return makeChainable({ data: skillNodeRows, error: skillNodeError });
  if (table === "competency_scores") return makeChainable({ data: competencyScoreRows, error: null });
  return makeChainable({ data: null, error: null });
}

const mockFrom = vi.fn(defaultMockFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { GET } from "@/app/api/assessment/results/route";

const NODE_FIXTURE = [
  { id: "node-1", name: "Tokenization", category: "LLM Fundamentals", difficulty: 1, order_index: 1 },
  { id: "node-2", name: "Zero/Few-Shot", category: "Prompt Engineering", difficulty: 1, order_index: 2 },
];

describe("GET /api/assessment/results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFromImpl);
    mockGetServerUser.mockResolvedValue({ user: { id: "user-1" }, profile: null });
    mockResolveModelConfig.mockReturnValue({ provider: "anthropic", modelId: "claude-haiku-4-5" });
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: "You show strong foundations." });

    skillNodeRows = NODE_FIXTURE;
    skillNodeError = null;
    competencyScoreRows = [];
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("propagates a skill_nodes DB error as 500 rather than silently returning zeroed results", async () => {
    skillNodeRows = null;
    skillNodeError = { message: "connection refused" };

    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("connection refused");
  });

  it("treats a user with no attempts yet as all-zero scores, every node 'needs_focus'", async () => {
    competencyScoreRows = [];

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.overallScore).toBe(0);
    for (const cat of json.categories) {
      expect(cat.averageScore).toBe(0);
      for (const node of cat.nodes) {
        expect(node.score).toBe(0);
        expect(node.status).toBe("needs_focus");
      }
    }
  });

  it("groups nodes by category, computes per-node status thresholds, and rounds scores to 1 decimal", async () => {
    competencyScoreRows = [
      { skill_node_id: "node-1", score: 82.34 }, // >=80 -> mastered
      { skill_node_id: "node-2", score: 55.55 }, // >=40 -> in_progress
    ];

    const res = await GET();
    const json = await res.json();

    const llmCat = json.categories.find((c: { category: string }) => c.category === "LLM Fundamentals");
    const node1 = llmCat.nodes.find((n: { id: string }) => n.id === "node-1");
    expect(node1.score).toBe(82.3);
    expect(node1.status).toBe("mastered");

    const promptCat = json.categories.find((c: { category: string }) => c.category === "Prompt Engineering");
    const node2 = promptCat.nodes.find((n: { id: string }) => n.id === "node-2");
    expect(node2.score).toBe(55.6);
    expect(node2.status).toBe("in_progress");

    // overall average across both nodes: (82.3 + 55.6) / 2 = 68.95 -> rounds to 69
    expect(json.overallScore).toBe(69);
  });

  it("marks a node below the in_progress floor as needs_focus", async () => {
    competencyScoreRows = [{ skill_node_id: "node-1", score: 39.9 }];

    const res = await GET();
    const json = await res.json();
    const llmCat = json.categories.find((c: { category: string }) => c.category === "LLM Fundamentals");
    const node1 = llmCat.nodes.find((n: { id: string }) => n.id === "node-1");
    expect(node1.status).toBe("needs_focus");
  });

  it("calls resolveModelConfig('cheap') and passes the category summary + overall score to executeLLMCallWithCap, using its content as the AI summary", async () => {
    competencyScoreRows = [{ skill_node_id: "node-1", score: 90 }];
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: "  You excel at LLM fundamentals.  " });

    const res = await GET();
    const json = await res.json();

    expect(mockResolveModelConfig).toHaveBeenCalledWith("cheap");
    const callArgs = mockExecuteLLMCallWithCap.mock.calls[0][0];
    expect(callArgs.userId).toBe("user-1");
    expect(callArgs.feature).toBe("assessment_summary");
    const userMsg = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMsg.content).toContain("LLM Fundamentals");

    // Content is trimmed before use.
    expect(json.aiSummary).toBe("You excel at LLM fundamentals.");
  });

  it("falls back to the default summary text (still 200) when the LLM call throws", async () => {
    mockExecuteLLMCallWithCap.mockRejectedValue(new Error("LLM provider down"));

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.aiSummary).toMatch(/solid foundational potential/);
  });

  it("falls back to the default summary text when the LLM returns empty/whitespace-only content", async () => {
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: "   " });

    const res = await GET();
    const json = await res.json();
    expect(json.aiSummary).toMatch(/solid foundational potential/);
  });

  it("propagates an unexpected thrown error as 500", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("boom");
    });

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
