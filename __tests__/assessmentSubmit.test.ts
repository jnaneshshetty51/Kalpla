import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  rateLimitedResponse: () => ({
    error: "Too many requests — please wait before trying again.",
    code: "RATE_LIMITED",
  }),
}));

const mockGradeAssessmentAttempt = vi.fn();
vi.mock("@/lib/assessment/grader", () => ({
  gradeAssessmentAttempt: (input: unknown) => mockGradeAssessmentAttempt(input),
}));

const mockRecomputeAndSaveNodeScore = vi.fn();
vi.mock("@/lib/skillGraph/updateScore", () => ({
  recomputeAndSaveNodeScore: (userId: string, skillNodeId: string) =>
    mockRecomputeAndSaveNodeScore(userId, skillNodeId),
}));

const mockUpdateRoadmapNodeStatus = vi.fn();
vi.mock("@/lib/roadmap/updateStatus", () => ({
  updateRoadmapNodeStatus: (params: unknown) => mockUpdateRoadmapNodeStatus(params),
}));

const mockFlagAttemptForReview = vi.fn();
vi.mock("@/lib/grading/reviewQueue", () => ({
  flagAttemptForReview: (params: unknown) => mockFlagAttemptForReview(params),
}));

// Deliberately NOT mocked — the route does `err instanceof UsageCapExceededError`,
// so the class thrown by the mock and the class checked by the route must be the
// exact same constructor reference.
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

let dbTaskRow: Record<string, unknown> | null;
let insertResultData: { id: string } | null;
let insertResultError: { message: string } | null;
let updateResultError: { message: string } | null;
let insertedPayload: Record<string, unknown> | null;
let updatedPayload: Record<string, unknown> | null;

function defaultMockFromImpl(table: string) {
  if (table === "assessment_tasks") {
    return makeChainable({ data: dbTaskRow, error: null });
  }
  if (table === "assessment_attempts") {
    const chain: Record<string, unknown> = {};
    chain.insert = vi.fn((payload: Record<string, unknown>) => {
      insertedPayload = payload;
      return {
        select: () => ({
          single: () =>
            Promise.resolve(
              insertResultError
                ? { data: null, error: insertResultError }
                : { data: insertResultData, error: null },
            ),
        }),
      };
    });
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      updatedPayload = payload;
      return {
        eq: () => Promise.resolve({ error: updateResultError }),
      };
    });
    return chain;
  }
  return makeChainable({ data: null, error: null });
}

const mockFrom = vi.fn(defaultMockFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { POST } from "@/app/api/assessment/submit/route";

function req(body: unknown): Request;
function req(body: string, raw: true): Request;
function req(body: unknown, raw?: true): Request {
  return new Request("http://localhost/api/assessment/submit", {
    method: "POST",
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

const validBody = { task_id: "task-1", response: "Option B" };

describe("POST /api/assessment/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFromImpl);

    mockGetServerUser.mockResolvedValue({ user: { id: "user-1" }, profile: null });
    mockCheckRateLimit.mockReturnValue(false);

    dbTaskRow = { id: "task-1", skill_node_id: "node-1", type: "short_answer", prompt: "Prompt", rubric: {} };
    insertResultData = { id: "attempt-1" };
    insertResultError = null;
    updateResultError = null;
    insertedPayload = null;
    updatedPayload = null;

    mockGradeAssessmentAttempt.mockResolvedValue({
      ai_score: 85,
      ai_feedback: { summary: "Great job" },
      confidence: 0.9,
      confidence_level: "high",
      failed_validation: false,
    });
    mockRecomputeAndSaveNodeScore.mockResolvedValue({ score: 88 });
    mockUpdateRoadmapNodeStatus.mockResolvedValue({
      nodes: [],
      newlyUnlockedNodes: [{ skillNodeId: "node-2", nodeName: "Node 2" }],
    });
  });

  describe("auth + rate limit + validation gates", () => {
    it("returns 401 when there is no authenticated user, before touching the DB or rate limiter", async () => {
      mockGetServerUser.mockResolvedValue({ user: null, profile: null });

      const res = await POST(req(validBody));
      expect(res.status).toBe(401);
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns 429 when rate-limited, before any DB access or grading", async () => {
      mockCheckRateLimit.mockReturnValue(true);

      const res = await POST(req(validBody));
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.code).toBe("RATE_LIMITED");
      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockGradeAssessmentAttempt).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid JSON body", async () => {
      const res = await POST(req("not json", true));
      expect(res.status).toBe(400);
    });

    it("returns 400 when task_id is missing", async () => {
      const res = await POST(req({ response: "x" }));
      expect(res.status).toBe(400);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns 400 when task_id is not a string", async () => {
      const res = await POST(req({ task_id: 123, response: "x" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when response is missing (undefined)", async () => {
      const res = await POST(req({ task_id: "task-1" }));
      expect(res.status).toBe(400);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns 400 when response is explicitly null", async () => {
      const res = await POST(req({ task_id: "task-1", response: null }));
      expect(res.status).toBe(400);
    });

    it("accepts a falsy-but-defined response like 0", async () => {
      const res = await POST(req({ task_id: "task-1", response: 0 }));
      expect(res.status).toBe(200);
      expect(mockGradeAssessmentAttempt).toHaveBeenCalledTimes(1);
    });
  });

  describe("task lookup + attempt recording", () => {
    it("uses the real DB task when found", async () => {
      await POST(req(validBody));
      const call = mockGradeAssessmentAttempt.mock.calls[0][0];
      expect(call.task).toMatchObject({ id: "task-1", skill_node_id: "node-1" });
    });

    it("falls back to a synthetic task with the hardcoded default skill node when no DB row matches task_id", async () => {
      dbTaskRow = null;

      await POST(req(validBody));
      const call = mockGradeAssessmentAttempt.mock.calls[0][0];
      expect(call.task).toMatchObject({
        id: "task-1",
        skill_node_id: "a0000000-0000-4000-a000-000000000101",
        type: "short_answer",
      });
    });

    it("wraps a non-object response into { answer: String(response) } for the recorded attempt, but grades using the raw response", async () => {
      await POST(req({ task_id: "task-1", response: "Option B" }));

      expect(insertedPayload).toMatchObject({
        user_id: "user-1",
        task_id: "task-1",
        response: { answer: "Option B" },
      });

      const gradingCall = mockGradeAssessmentAttempt.mock.calls[0][0];
      expect(gradingCall.response).toBe("Option B");
    });

    it("passes an object response through to the recorded attempt unwrapped", async () => {
      const objResponse = { code: "print('hi')" };
      await POST(req({ task_id: "task-1", response: objResponse }));

      expect(insertedPayload!.response).toEqual(objResponse);
    });

    it("returns 500 with the DB error message when inserting the initial attempt fails", async () => {
      insertResultError = { message: "insert constraint violated" };

      const res = await POST(req(validBody));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("insert constraint violated");
      expect(mockGradeAssessmentAttempt).not.toHaveBeenCalled();
    });

    it("returns a generic 500 when the insert returns no error but also no row", async () => {
      insertResultData = null;
      insertResultError = null;

      const res = await POST(req(validBody));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Failed to record attempt");
    });
  });

  describe("grading -> record -> recompute -> roadmap sequencing", () => {
    it("on success, sequences grade -> update attempt row -> recompute score -> update roadmap status, and returns the recomputed competency score", async () => {
      const res = await POST(req(validBody));
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json).toMatchObject({
        attempt_id: "attempt-1",
        ai_score: 85,
        ai_feedback: { summary: "Great job" },
        confidence: 0.9,
        competency_score: 88, // from recomputeAndSaveNodeScore, NOT the raw grading.ai_score
      });

      expect(updatedPayload).toMatchObject({ ai_score: 85, ai_feedback: { summary: "Great job" }, confidence: 0.9 });
      expect(mockRecomputeAndSaveNodeScore).toHaveBeenCalledWith("user-1", "node-1");
      expect(mockUpdateRoadmapNodeStatus).toHaveBeenCalledWith({
        userId: "user-1",
        skillNodeId: "node-1",
        score: 88,
      });
    });

    it("includes newly_unlocked_nodes in the response when updateRoadmapNodeStatus computes some, matching lib/lessons/markComplete.ts's equivalent path", async () => {
      const res = await POST(req(validBody));
      const json = await res.json();
      expect(json.newly_unlocked_nodes).toEqual([{ skillNodeId: "node-2", nodeName: "Node 2" }]);
      expect(Object.keys(json).sort()).toEqual(
        ["ai_feedback", "ai_score", "attempt_id", "competency_score", "confidence", "newly_unlocked_nodes"].sort(),
      );
    });

    it("newly_unlocked_nodes is an empty array (not missing) when nothing unlocked", async () => {
      mockUpdateRoadmapNodeStatus.mockResolvedValue({ nodes: [], newlyUnlockedNodes: [] });
      const res = await POST(req(validBody));
      const json = await res.json();
      expect(json.newly_unlocked_nodes).toEqual([]);
    });

    it("swallows an attempt-update DB error and still returns the grading result", async () => {
      updateResultError = { message: "update failed" };

      const res = await POST(req(validBody));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ai_score).toBe(85);
    });

    it("when recompute throws, falls back to the raw grading score, skips the roadmap update, and still returns 200", async () => {
      mockRecomputeAndSaveNodeScore.mockRejectedValue(new Error("recompute boom"));

      const res = await POST(req(validBody));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.competency_score).toBe(85); // grading.ai_score fallback
      expect(mockUpdateRoadmapNodeStatus).not.toHaveBeenCalled();
    });

    it("when updateRoadmapNodeStatus throws, still returns 200 with the recomputed score", async () => {
      mockUpdateRoadmapNodeStatus.mockRejectedValue(new Error("roadmap boom"));

      const res = await POST(req(validBody));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.competency_score).toBe(88);
    });
  });

  describe("review-queue flagging", () => {
    it("flags for review with reason schema_validation_failed when grading.failed_validation is true, and does NOT also flag low_confidence", async () => {
      mockGradeAssessmentAttempt.mockResolvedValue({
        ai_score: 70,
        ai_feedback: {},
        confidence: 0.5,
        confidence_level: "low",
        failed_validation: true,
      });

      await POST(req(validBody));

      expect(mockFlagAttemptForReview).toHaveBeenCalledTimes(1);
      expect(mockFlagAttemptForReview).toHaveBeenCalledWith(
        expect.objectContaining({ attemptId: "attempt-1", reason: "schema_validation_failed" }),
      );
    });

    it("flags for review with reason low_confidence when confidence_level is low", async () => {
      mockGradeAssessmentAttempt.mockResolvedValue({
        ai_score: 60,
        ai_feedback: {},
        confidence: 0.75,
        confidence_level: "low",
        failed_validation: false,
      });

      await POST(req(validBody));

      expect(mockFlagAttemptForReview).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "low_confidence" }),
      );
    });

    it("flags for review with reason low_confidence when confidence <= 0.70 even if confidence_level itself isn't 'low'", async () => {
      mockGradeAssessmentAttempt.mockResolvedValue({
        ai_score: 60,
        ai_feedback: {},
        confidence: 0.7,
        confidence_level: "medium",
        failed_validation: false,
      });

      await POST(req(validBody));

      expect(mockFlagAttemptForReview).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "low_confidence" }),
      );
    });

    it("does not flag for review on a confident, valid grading result", async () => {
      await POST(req(validBody)); // default mock: confidence 0.9, high, not failed

      expect(mockFlagAttemptForReview).not.toHaveBeenCalled();
    });
  });

  describe("error propagation", () => {
    it("propagates UsageCapExceededError from grading as 429 with the error's details, after the attempt row was already recorded", async () => {
      const details = {
        allowed: false as const,
        error: "usage_cap_exceeded" as const,
        feature: "assessment_grading",
        resetDate: "2026-09-01T00:00:00Z",
        limit: 10,
        currentUsage: 10,
      };
      mockGradeAssessmentAttempt.mockRejectedValue(new UsageCapExceededError(details));

      const res = await POST(req(validBody));
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json).toEqual(details);
      expect(insertedPayload).not.toBeNull(); // the attempt insert already happened
      expect(mockRecomputeAndSaveNodeScore).not.toHaveBeenCalled();
    });

    it("does not surface UsageCapExceededError as a generic 500", async () => {
      mockGradeAssessmentAttempt.mockRejectedValue(
        new UsageCapExceededError({
          allowed: false,
          error: "usage_cap_exceeded",
          feature: "assessment_grading",
          resetDate: "2026-09-01T00:00:00Z",
          limit: 5,
          currentUsage: 5,
        }),
      );

      const res = await POST(req(validBody));
      expect(res.status).not.toBe(500);
    });

    it("propagates a generic grading error as a 500, not a silently faked success", async () => {
      mockGradeAssessmentAttempt.mockRejectedValue(new Error("LLM provider down"));

      const res = await POST(req(validBody));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Internal Server Error");
    });
  });
});
