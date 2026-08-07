import { describe, it, expect, vi, beforeEach } from "vitest";

// A minimal chainable query-builder stub. Every method returns `this` so
// call chains of arbitrary shape/order resolve, and the object is also
// awaitable (thenable) so `await adminSupabase.from(...).insert(...)`
// resolves without a terminal .single()/.maybeSingle() call, matching how
// the real supabase-js client behaves.
function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select",
    "insert",
    "upsert",
    "update",
    "eq",
    "contains",
    "limit",
    "order",
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (value: typeof result) => void) => resolve(result);
  return chain;
}

const mockFrom = vi.fn();
const mockAdminSupabase = { from: mockFrom };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminSupabase,
}));

const mockRecomputeAndSaveNodeScore = vi.fn();
vi.mock("@/lib/skillGraph/updateScore", () => ({
  recomputeAndSaveNodeScore: (userId: string, skillNodeId: string) =>
    mockRecomputeAndSaveNodeScore(userId, skillNodeId),
}));

const mockUpdateRoadmapNodeStatus = vi.fn();
vi.mock("@/lib/roadmap/updateStatus", () => ({
  updateRoadmapNodeStatus: (params: Record<string, unknown>) => mockUpdateRoadmapNodeStatus(params),
}));

import { markLessonComplete } from "@/lib/lessons/markComplete";

describe("lib/lessons/markComplete.ts Integration Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === "assessment_tasks") {
        // Existing lesson-check task found -> no create-branch needed.
        return makeChainable({ data: { id: "task-lesson-check-1" }, error: null });
      }
      if (table === "assessment_attempts") {
        return makeChainable({ data: null, error: null });
      }
      if (table === "competency_scores") {
        return makeChainable({ data: null, error: null });
      }
      return makeChainable({ data: null, error: null });
    });
  });

  it("check_understanding: records a real graded attempt and recomputes the score via the shared Prompt 13 pipeline, rather than trusting the raw grading score directly", async () => {
    mockRecomputeAndSaveNodeScore.mockResolvedValue({
      skillNodeId: "node-llm-tokenization",
      score: 91.5, // recomputed rollup can differ from the single grading input
      attemptsUsed: 2,
      status: "completed",
      unlockedNodes: [],
    });

    const mockUpdatedNodes = [
      { skill_node_id: "node-llm-tokenization", node_name: "LLM Tokenization", status: "completed", score: 91.5 },
      { skill_node_id: "node-prompt-engineering", node_name: "Prompt Engineering", status: "available", prerequisites: ["node-llm-tokenization"] },
    ];
    mockUpdateRoadmapNodeStatus.mockResolvedValue({ nodes: mockUpdatedNodes, newlyUnlockedNodes: [] });

    const result = await markLessonComplete({
      userId: "usr-test-123",
      skillNodeId: "node-llm-tokenization",
      score: 88.0, // the raw check-understanding grading score
      source: "check_understanding",
    });

    // A real assessment_attempts row is recorded for this grading event.
    expect(mockFrom).toHaveBeenCalledWith("assessment_attempts");

    // The score-update logic from Prompt 13 is genuinely reused, not
    // reimplemented — called with the user/node, not the raw input score.
    expect(mockRecomputeAndSaveNodeScore).toHaveBeenCalledWith(
      "usr-test-123",
      "node-llm-tokenization",
    );

    // Roadmap status update uses the RECOMPUTED score (91.5), not the raw
    // grading input (88.0) — proving the recompute step is load-bearing,
    // not bypassed.
    expect(mockUpdateRoadmapNodeStatus).toHaveBeenCalledWith({
      userId: "usr-test-123",
      skillNodeId: "node-llm-tokenization",
      score: 91.5,
      completionThreshold: 80.0,
    });

    expect(result.success).toBe(true);
    expect(result.score).toBe(91.5);
    expect(result.source).toBe("check_understanding");
    expect(result.updatedNodes).toEqual(mockUpdatedNodes);
  });

  it("manual_button: self-reported completion upserts the given score directly without touching the recompute pipeline", async () => {
    mockUpdateRoadmapNodeStatus.mockResolvedValue({ nodes: [], newlyUnlockedNodes: [] });

    const result = await markLessonComplete({
      userId: "usr-test-456",
      skillNodeId: "node-vector-db",
    });

    expect(mockFrom).toHaveBeenCalledWith("competency_scores");
    expect(mockRecomputeAndSaveNodeScore).not.toHaveBeenCalled();

    expect(mockUpdateRoadmapNodeStatus).toHaveBeenCalledWith({
      userId: "usr-test-456",
      skillNodeId: "node-vector-db",
      score: 85.0,
      completionThreshold: 80.0,
    });

    expect(result.success).toBe(true);
    expect(result.score).toBe(85.0);
    expect(result.source).toBe("manual_button");
  });

  it("tutor_interaction: also uses the direct self-report path, not the graded recompute pipeline", async () => {
    const mockUnlockedNodes = [
      { skill_node_id: "node-prereq", status: "completed" },
      { skill_node_id: "node-downstream-1", status: "available" },
      { skill_node_id: "node-downstream-2", status: "available" },
    ];
    const mockNewlyUnlocked = [
      { skillNodeId: "node-downstream-1", nodeName: "Downstream One" },
      { skillNodeId: "node-downstream-2", nodeName: "Downstream Two" },
    ];
    mockUpdateRoadmapNodeStatus.mockResolvedValue({
      nodes: mockUnlockedNodes,
      newlyUnlockedNodes: mockNewlyUnlocked,
    });

    const result = await markLessonComplete({
      userId: "usr-test-789",
      skillNodeId: "node-prereq",
      score: 95.0,
      source: "tutor_interaction",
    });

    expect(mockRecomputeAndSaveNodeScore).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.updatedNodes).toHaveLength(3);
    expect(result.updatedNodes?.[1].status).toBe("available");

    // The unlock-moment data (Motion & micro-interactions pass) genuinely
    // flows through markLessonComplete's response, not just updateStatus's
    // internal return — this is what the frontend reveal reads.
    expect(result.newlyUnlockedNodes).toEqual(mockNewlyUnlocked);
  });

  it("returns success: false if the roadmap status update throws", async () => {
    mockRecomputeAndSaveNodeScore.mockResolvedValue({
      skillNodeId: "node-x",
      score: 90,
      attemptsUsed: 1,
      status: "completed",
      unlockedNodes: [],
    });
    mockUpdateRoadmapNodeStatus.mockRejectedValue(new Error("roadmap row not found"));

    const result = await markLessonComplete({
      userId: "usr-test-err",
      skillNodeId: "node-x",
      source: "check_understanding",
    });

    expect(result.success).toBe(false);
    expect(result.updatedNodes).toBeNull();
  });
});
