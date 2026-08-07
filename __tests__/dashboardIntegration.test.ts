import { describe, it, expect, vi, beforeEach } from "vitest";

const mockNextStep = vi.fn();
vi.mock("@/lib/roadmap/nextStep", () => ({
  getRecommendedNextStep: (userId: string) => mockNextStep(userId),
}));

function chainableSelect(data: unknown) {
  const chain: Record<string, unknown> = {};
  // is/gte/lte/or added for lib/dashboard/aggregate.ts's upcoming-sessions
  // query (live_sessions) — any table not explicitly stubbed below falls
  // through to this generic empty-data chain, so it needs to support
  // whatever chain methods any current or future query might call.
  for (const m of ["select", "eq", "order", "limit", "is", "gte", "lte", "or"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: { data: unknown; error: null }) => void) =>
    resolve({ data, error: null });
  return chain;
}

let skillNodes: unknown[] = [];
let competencyScores: unknown[] = [];
let assessmentAttempts: unknown[] = [];

const mockFrom = vi.fn((table: string) => {
  if (table === "skill_nodes") return chainableSelect(skillNodes);
  if (table === "competency_scores") return chainableSelect(competencyScores);
  if (table === "assessment_attempts") return chainableSelect(assessmentAttempts);
  return chainableSelect([]);
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { getDashboardAggregateData } from "@/lib/dashboard/aggregate";

const DEFAULT_NEXT_STEP = {
  skill_node_id: "node-rag-design",
  node_name: "RAG Pipeline Design",
  category: "Embeddings & Retrieval",
  status: "in_progress",
  estimated_days: 4,
  learning_objective: "Master vector indexing and retrieval optimization.",
  action_type: "continue_exercise" as const,
  action_label: "Continue Exercise →",
  action_description: "Pick up where you left off in RAG Pipeline Design.",
  target_url: "/learn/node-rag-design",
};

function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

describe("lib/dashboard/aggregate.ts — streak, assessment-pending, and next-step wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNextStep.mockResolvedValue(DEFAULT_NEXT_STEP);
    skillNodes = [];
    competencyScores = [];
    assessmentAttempts = [];
  });

  it("real end-to-end payload: readiness percentage, next-step target URL, and streak all reflect the seeded data", async () => {
    skillNodes = [{ id: "node-1", name: "LLM Tokenization", category: "LLM Fundamentals", difficulty: 1, order_index: 1 }];
    competencyScores = [{ skill_node_id: "node-1", score: 88 }];
    assessmentAttempts = [
      { id: "sub-1", task_id: "node-1", ai_score: 90, created_at: daysAgoIso(0) },
      { id: "sub-2", task_id: "node-1", ai_score: 85, created_at: daysAgoIso(1) },
    ];

    const result = await getDashboardAggregateData("usr-1");

    expect(result.overallScore).toBe(88);
    expect(result.next_step.target_url).toBe("/learn/node-rag-design");
    expect(result.next_step.action_label).toBe("Continue Exercise →");
    expect(result.recent_submissions).toHaveLength(2);
    expect(mockNextStep).toHaveBeenCalledWith("usr-1");
  });

  it("streak counts consecutive active days ending today, breaking at the first gap", async () => {
    assessmentAttempts = [
      { id: "a1", task_id: "n1", ai_score: 80, created_at: daysAgoIso(0) },
      { id: "a2", task_id: "n1", ai_score: 80, created_at: daysAgoIso(1) },
      { id: "a3", task_id: "n1", ai_score: 80, created_at: daysAgoIso(2) },
      // gap at day 3
      { id: "a4", task_id: "n1", ai_score: 80, created_at: daysAgoIso(4) },
    ];

    const result = await getDashboardAggregateData("usr-1");
    expect(result.streak.current_streak_days).toBe(3);
    expect(result.streak.total_active_days).toBe(4);
  });

  it("streak stays alive if the most recent activity was yesterday, not just today", async () => {
    assessmentAttempts = [{ id: "a1", task_id: "n1", ai_score: 80, created_at: daysAgoIso(1) }];
    const result = await getDashboardAggregateData("usr-1");
    expect(result.streak.current_streak_days).toBe(1);
  });

  it("streak resets to 0 (but keeps total_active_days) once the most recent activity is more than 1 day old", async () => {
    assessmentAttempts = [{ id: "a1", task_id: "n1", ai_score: 80, created_at: daysAgoIso(4) }];
    const result = await getDashboardAggregateData("usr-1");
    expect(result.streak.current_streak_days).toBe(0);
    expect(result.streak.total_active_days).toBe(1);
    expect(result.streak.last_activity_at).not.toBeNull();
  });

  it("multiple attempts on the same calendar day count as one active day, not one per attempt", async () => {
    assessmentAttempts = [
      { id: "a1", task_id: "n1", ai_score: 80, created_at: daysAgoIso(0) },
      { id: "a2", task_id: "n1", ai_score: 70, created_at: daysAgoIso(0) },
      { id: "a3", task_id: "n1", ai_score: 60, created_at: daysAgoIso(0) },
    ];
    const result = await getDashboardAggregateData("usr-1");
    expect(result.streak.total_active_days).toBe(1);
    expect(result.streak.current_streak_days).toBe(1);
  });

  it("a brand-new user with zero nodes and zero attempts gets an all-zero streak, not an error", async () => {
    const result = await getDashboardAggregateData("usr-new");
    expect(result.streak).toEqual({
      current_streak_days: 0,
      total_active_days: 0,
      last_activity_at: null,
    });
  });

  it("isAssessmentPending is true only when there are zero attempts AND overall score is exactly 0", async () => {
    // Zero attempts, zero score -> pending
    const pending = await getDashboardAggregateData("usr-1");
    expect(pending.isAssessmentPending).toBe(true);

    // Zero attempts recorded, but a nonzero score exists (e.g. seeded via
    // tutor/lesson completion, not a diagnostic attempt) -> not pending.
    skillNodes = [{ id: "n1", name: "A", category: "LLM Fundamentals", difficulty: 1, order_index: 1 }];
    competencyScores = [{ skill_node_id: "n1", score: 10 }];
    const scoredButNoAttempts = await getDashboardAggregateData("usr-2");
    expect(scoredButNoAttempts.isAssessmentPending).toBe(false);

    // Attempts exist but score happens to be 0 -> not pending (they did attempt).
    competencyScores = [];
    assessmentAttempts = [{ id: "a1", task_id: "n1", ai_score: 0, created_at: daysAgoIso(0) }];
    const attemptedButZero = await getDashboardAggregateData("usr-3");
    expect(attemptedButZero.isAssessmentPending).toBe(false);
  });

  it("recent_submissions caps at the 5 most recent and falls back to a generic name for unmatched task IDs", async () => {
    assessmentAttempts = Array.from({ length: 8 }, (_, i) => ({
      id: `a${i}`,
      task_id: "no-matching-node",
      ai_score: 50,
      created_at: daysAgoIso(i),
    }));

    const result = await getDashboardAggregateData("usr-1");
    expect(result.recent_submissions).toHaveLength(5);
    expect(result.recent_submissions[0].task_name).toBe("Diagnostic Assessment Task");
    expect(result.recent_submissions[0].category).toBe("GenAI Engineering");
  });
});
