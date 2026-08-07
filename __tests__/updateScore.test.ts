import { describe, it, expect, vi, beforeEach } from "vitest";

function chainableFilter(data: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: { data: unknown; error: null }) => void) =>
    resolve({ data, error: null });
  return chain;
}

let tasksForNode: Array<{ id: string }> = [];
let attemptsForUser: Array<{ id: string; ai_score: number; confidence: number; created_at: string }> = [];
let allSkillNodes: Array<{ id: string; name: string; category: string; order_index: number; prerequisite_ids: string[] }> = [];
let allCompetencyScores: Array<{ skill_node_id: string; score: number }> = [];
let upsertPayload: Record<string, unknown> | null = null;
let upsertError: { message: string } | null = null;

function defaultMockFromImpl(table: string) {
  if (table === "assessment_tasks") return chainableFilter(tasksForNode);
  if (table === "assessment_attempts") return chainableFilter(attemptsForUser);
  if (table === "skill_nodes") return chainableFilter(allSkillNodes);
  if (table === "competency_scores") {
    const chain = chainableFilter(allCompetencyScores);
    chain.upsert = vi.fn((payload: Record<string, unknown>) => {
      upsertPayload = payload;
      return { error: upsertError };
    });
    return chain;
  }
  return chainableFilter([]);
}

const mockFrom = vi.fn(defaultMockFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { recomputeAndSaveNodeScore } from "@/lib/skillGraph/updateScore";

describe("lib/skillGraph/updateScore.ts — recomputeAndSaveNodeScore (THE single source of truth for competency scores)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks resets call history but NOT a prior mockImplementation
    // override — re-establish the default explicitly so a test that swaps
    // in a custom implementation (see "uses only assessment_tasks..."
    // below) can never leak into a later test.
    mockFrom.mockImplementation(defaultMockFromImpl);
    tasksForNode = [];
    attemptsForUser = [];
    allSkillNodes = [];
    allCompetencyScores = [];
    upsertPayload = null;
    upsertError = null;
  });

  it("computes the score from real attempt data via the real recency-weighted computeNodeScore, not a stub", async () => {
    tasksForNode = [{ id: "task-1" }];
    attemptsForUser = [{ id: "att-1", ai_score: 90, confidence: 1.0, created_at: "2026-08-01T00:00:00Z" }];
    allSkillNodes = [{ id: "node-1", name: "LLM Basics", category: "LLM Fundamentals", order_index: 1, prerequisite_ids: [] }];

    const result = await recomputeAndSaveNodeScore("usr-1", "node-1");

    expect(result.score).toBe(90); // single attempt -> exact score
    expect(result.attemptsUsed).toBe(1);
    expect(upsertPayload).toMatchObject({ user_id: "usr-1", skill_node_id: "node-1", score: 90 });
  });

  it("a skill node with no assessment_tasks rows at all never queries assessment_attempts, and scores 0", async () => {
    tasksForNode = [];
    allSkillNodes = [{ id: "node-1", name: "A", category: "LLM Fundamentals", order_index: 1, prerequisite_ids: [] }];

    const result = await recomputeAndSaveNodeScore("usr-1", "node-1");
    expect(result.score).toBe(0);
    expect(result.attemptsUsed).toBe(0);
  });

  it("status reflects the recomputed score against the real threshold: completed at >= 80", async () => {
    tasksForNode = [{ id: "task-1" }];
    attemptsForUser = [{ id: "att-1", ai_score: 85, confidence: 1.0, created_at: "2026-08-01T00:00:00Z" }];
    allSkillNodes = [{ id: "node-1", name: "A", category: "LLM Fundamentals", order_index: 1, prerequisite_ids: [] }];

    const result = await recomputeAndSaveNodeScore("usr-1", "node-1");
    expect(result.status).toBe("completed");
  });

  it("status is locked when the score is 0 and a prerequisite isn't completed yet", async () => {
    tasksForNode = [];
    allSkillNodes = [
      { id: "node-prereq", name: "Prereq", category: "LLM Fundamentals", order_index: 1, prerequisite_ids: [] },
      { id: "node-1", name: "A", category: "LLM Fundamentals", order_index: 2, prerequisite_ids: ["node-prereq"] },
    ];
    allCompetencyScores = [{ skill_node_id: "node-prereq", score: 20 }]; // not completed

    const result = await recomputeAndSaveNodeScore("usr-1", "node-1");
    expect(result.status).toBe("locked");
  });

  it("crossing the completion threshold reports genuinely newly-unlocked downstream nodes, using the real getUnlockableNodes", async () => {
    tasksForNode = [{ id: "task-1" }];
    attemptsForUser = [{ id: "att-1", ai_score: 95, confidence: 1.0, created_at: "2026-08-01T00:00:00Z" }];
    allSkillNodes = [
      { id: "node-1", name: "LLM Basics", category: "LLM Fundamentals", order_index: 1, prerequisite_ids: [] },
      { id: "node-2", name: "Prompt Engineering", category: "Prompt Engineering", order_index: 2, prerequisite_ids: ["node-1"] },
    ];
    allCompetencyScores = []; // node-1 not yet scored -> this call is what completes it

    const result = await recomputeAndSaveNodeScore("usr-1", "node-1");
    expect(result.unlockedNodes).toEqual([{ id: "node-2", name: "Prompt Engineering", category: "Prompt Engineering" }]);
  });

  it("does NOT report a node as newly unlocked if it was already unlockable before this recompute", async () => {
    tasksForNode = [{ id: "task-1" }];
    attemptsForUser = [{ id: "att-1", ai_score: 95, confidence: 1.0, created_at: "2026-08-01T00:00:00Z" }];
    allSkillNodes = [
      { id: "node-1", name: "LLM Basics", category: "LLM Fundamentals", order_index: 1, prerequisite_ids: [] },
      { id: "node-other", name: "Unrelated", category: "LLM Fundamentals", order_index: 2, prerequisite_ids: [] }, // no prereqs -> always unlockable
    ];
    allCompetencyScores = [{ skill_node_id: "node-1", score: 82 }]; // already completed before this call

    const result = await recomputeAndSaveNodeScore("usr-1", "node-1");
    expect(result.unlockedNodes).toEqual([]); // node-other was unlockable both before and after
  });

  it("uses only assessment_tasks belonging to the target skill node, scoped via .in() on the fetched task IDs", async () => {
    tasksForNode = [{ id: "task-a" }, { id: "task-b" }];
    allSkillNodes = [{ id: "node-1", name: "A", category: "LLM Fundamentals", order_index: 1, prerequisite_ids: [] }];

    let capturedTaskIds: string[] | null = null;
    mockFrom.mockImplementation((table: string) => {
      if (table === "assessment_tasks") return chainableFilter(tasksForNode);
      if (table === "assessment_attempts") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.in = vi.fn((_col: string, ids: string[]) => {
          capturedTaskIds = ids;
          return chain;
        });
        chain.then = (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: [], error: null });
        return chain;
      }
      if (table === "skill_nodes") return chainableFilter(allSkillNodes);
      if (table === "competency_scores") {
        const chain = chainableFilter([]);
        chain.upsert = vi.fn(() => ({ error: null }));
        return chain;
      }
      return chainableFilter([]);
    });

    await recomputeAndSaveNodeScore("usr-1", "node-1");
    expect(capturedTaskIds).toEqual(["task-a", "task-b"]);
  });

  it("propagates a DB error from the upsert instead of silently succeeding", async () => {
    tasksForNode = [];
    allSkillNodes = [{ id: "node-1", name: "A", category: "LLM Fundamentals", order_index: 1, prerequisite_ids: [] }];
    upsertError = { message: "unique constraint violation" };

    await expect(recomputeAndSaveNodeScore("usr-1", "node-1")).rejects.toThrow(/unique constraint violation/);
  });
});
