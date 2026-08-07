import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetRecommendedNextStep = vi.fn();
vi.mock("@/lib/roadmap/nextStep", () => ({
  getRecommendedNextStep: (userId: string) => mockGetRecommendedNextStep(userId),
}));

const mockExecuteLLMCall = vi.fn();
vi.mock("@/lib/llm/providers", () => ({
  executeLLMCall: (opts: unknown) => mockExecuteLLMCall(opts),
}));

// Minimal chainable Supabase query-builder stub, table-aware via closures
// set per test.
function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

let mockUsersRow: { time_budget_minutes_per_day: number | null } | null;
let mockRoadmapRow: { id: string } | null;
let mockRecentAttempts: Array<{ created_at: string }>;

const mockFrom = vi.fn((table: string) => {
  if (table === "users") return makeChainable({ data: mockUsersRow, error: null });
  if (table === "roadmaps") return makeChainable({ data: mockRoadmapRow, error: null });
  if (table === "assessment_attempts") return makeChainable({ data: mockRecentAttempts, error: null });
  return makeChainable({ data: null, error: null });
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { generateDailyTasks } from "@/lib/coach/generateDailyTasks";

describe("lib/coach/generateDailyTasks.ts (Prompt 80)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersRow = { time_budget_minutes_per_day: 30 };
    mockRoadmapRow = null;
    mockRecentAttempts = [];
  });

  it("brand-new user with no roadmap yet returns an onboarding-nudge task, not an error", async () => {
    mockRoadmapRow = null; // no roadmap row exists

    const result = await generateDailyTasks("new-user-1");

    expect(result.user_state).toBe("new");
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].type).toBe("onboarding");
    expect(result.tasks[0].title.toLowerCase()).toContain("assessment");
    // Never touched the roadmap next-step or LLM call — there's no roadmap yet.
    expect(mockGetRecommendedNextStep).not.toHaveBeenCalled();
    expect(mockExecuteLLMCall).not.toHaveBeenCalled();
  });

  it("active user mid-roadmap returns roadmap-derived tasks from a real next-step", async () => {
    mockRoadmapRow = { id: "roadmap-1" };
    mockRecentAttempts = [{ created_at: new Date().toISOString() }]; // active today

    mockGetRecommendedNextStep.mockResolvedValue({
      skill_node_id: "node-rag",
      node_name: "RAG Pipeline Design",
      category: "Embeddings & Retrieval",
      status: "available",
      estimated_days: 3,
      learning_objective: "Master RAG pipelines.",
      action_type: "start_lesson",
      action_label: "Start →",
      action_description: "Begin the RAG Pipeline Design module.",
      target_url: "/learn/node-rag",
    });

    mockExecuteLLMCall.mockResolvedValue({
      content: JSON.stringify([
        { title: "Finish the RAG chunking exercise", description: "Implement chunk_text.", estimated_minutes: 25 },
        { title: "Review yesterday's tutor conversation", description: "Revisit retrieval Q&A.", estimated_minutes: 10 },
      ]),
      model: "claude-haiku-4-5",
      provider: "anthropic",
      feature: "daily_coach_tasks",
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    });

    const result = await generateDailyTasks("active-user-1");

    expect(result.user_state).toBe("active");
    expect(mockGetRecommendedNextStep).toHaveBeenCalledWith("active-user-1");
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].title).toContain("RAG chunking");
    expect(result.tasks.every((t) => t.type === "roadmap")).toBe(true);

    // Uses the cheap tier for this high-frequency call, not expensive.
    const callArgs = mockExecuteLLMCall.mock.calls[0][0];
    expect(callArgs.modelId).toBe("claude-haiku-4-5");
  });

  it("active user still gets a grounded fallback task if the LLM output fails to parse, rather than erroring", async () => {
    mockRoadmapRow = { id: "roadmap-1" };
    mockRecentAttempts = [{ created_at: new Date().toISOString() }];
    mockGetRecommendedNextStep.mockResolvedValue({
      skill_node_id: "node-x",
      node_name: "Vector Search Fundamentals",
      category: "Embeddings & Retrieval",
      status: "available",
      estimated_days: 2,
      learning_objective: "Master vector search.",
      action_type: "start_lesson",
      action_label: "Start →",
      action_description: "Begin Vector Search Fundamentals.",
      target_url: "/learn/node-x",
    });
    mockExecuteLLMCall.mockResolvedValue({
      content: "not valid json",
      model: "claude-haiku-4-5",
      provider: "anthropic",
      feature: "daily_coach_tasks",
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    });

    const result = await generateDailyTasks("active-user-2");
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toContain("Vector Search Fundamentals");
  });

  it("a stalled user with no activity in 5+ days gets a re-engagement task, not a verbatim repeat of a stale roadmap suggestion", async () => {
    mockRoadmapRow = { id: "roadmap-1" };
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    mockRecentAttempts = [{ created_at: sevenDaysAgo }];

    mockGetRecommendedNextStep.mockResolvedValue({
      skill_node_id: "node-y",
      node_name: "Agent Loops & ReAct Framework",
      category: "Agentic Systems",
      status: "available",
      estimated_days: 4,
      learning_objective: "Master agent loops.",
      action_type: "start_lesson",
      action_label: "Start →",
      action_description: "Begin Agent Loops & ReAct Framework.",
      target_url: "/learn/node-y",
    });

    const result = await generateDailyTasks("stalled-user-1");

    expect(result.user_state).toBe("stalled");
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].type).toBe("re_engagement");
    // Distinctly re-engagement framed, not the roadmap action_label/description verbatim.
    expect(result.tasks[0].title.toLowerCase()).toMatch(/ease back in|re-engage|welcome back/);
    expect(result.tasks[0].description).not.toBe("Begin Agent Loops & ReAct Framework.");
    // Never made the (costed) LLM call for a stalled user — a cheaper, deterministic nudge is enough.
    expect(mockExecuteLLMCall).not.toHaveBeenCalled();
  });

  it("exactly at the 5-day boundary still counts as stalled (>= threshold, not >)", async () => {
    mockRoadmapRow = { id: "roadmap-1" };
    const exactlyFiveDaysAgo = new Date(Date.now() - 5 * 86400000 - 1000).toISOString();
    mockRecentAttempts = [{ created_at: exactlyFiveDaysAgo }];
    mockGetRecommendedNextStep.mockResolvedValue({
      skill_node_id: "node-z",
      node_name: "Test Node",
      category: "Test",
      status: "available",
      estimated_days: 1,
      learning_objective: "N/A",
      action_type: "start_lesson",
      action_label: "Start →",
      action_description: "N/A",
      target_url: "/learn/node-z",
    });

    const result = await generateDailyTasks("boundary-user");
    expect(result.user_state).toBe("stalled");
  });
});
