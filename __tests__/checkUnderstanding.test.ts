import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  rateLimitedResponse: () => ({ error: "Too many requests — please wait before trying again.", code: "RATE_LIMITED" }),
}));

const mockGradeAssessmentAttempt = vi.fn();
vi.mock("@/lib/assessment/grader", () => ({
  gradeAssessmentAttempt: (input: unknown) => mockGradeAssessmentAttempt(input),
}));

const mockMarkLessonComplete = vi.fn();
vi.mock("@/lib/lessons/markComplete", () => ({
  markLessonComplete: (input: unknown) => mockMarkLessonComplete(input),
}));

// Deliberately NOT mocked — the route does `err instanceof UsageCapExceededError`,
// so the class thrown by the mock and the class checked by the route must be the
// exact same constructor reference.
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";

import { POST } from "@/app/api/learn/check-understanding/route";

function req(body: unknown) {
  return new Request("http://localhost/api/learn/check-understanding", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  skill_node_id: "node-1",
  question: "Why do embeddings matter?",
  response: "Because they capture semantic similarity.",
};

describe("POST /api/learn/check-understanding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "user-1" }, profile: null });
    mockCheckRateLimit.mockReturnValue(false);
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });

    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
    expect(mockGradeAssessmentAttempt).not.toHaveBeenCalled();
  });

  it("returns 400 when skill_node_id is missing", async () => {
    const { skill_node_id, ...rest } = validBody;
    void skill_node_id;
    const res = await POST(req(rest));
    expect(res.status).toBe(400);
    expect(mockGradeAssessmentAttempt).not.toHaveBeenCalled();
  });

  it("returns 400 when question is missing", async () => {
    const { question, ...rest } = validBody;
    void question;
    const res = await POST(req(rest));
    expect(res.status).toBe(400);
    expect(mockGradeAssessmentAttempt).not.toHaveBeenCalled();
  });

  it("returns 400 when response is missing or blank", async () => {
    const res1 = await POST(req({ ...validBody, response: undefined }));
    expect(res1.status).toBe(400);

    const res2 = await POST(req({ ...validBody, response: "   " }));
    expect(res2.status).toBe(400);
    expect(mockGradeAssessmentAttempt).not.toHaveBeenCalled();
  });

  it("builds the mock short_answer task with a 2-criterion rubric and grades it", async () => {
    mockGradeAssessmentAttempt.mockResolvedValue({
      ai_score: 80,
      ai_feedback: { summary: "solid" },
      confidence: 0.9,
    });
    mockMarkLessonComplete.mockResolvedValue({ success: true });

    await POST(req(validBody));

    expect(mockGradeAssessmentAttempt).toHaveBeenCalledTimes(1);
    const call = mockGradeAssessmentAttempt.mock.calls[0][0];
    expect(call.userId).toBe("user-1");
    expect(call.response).toEqual({ answer: validBody.response });
    expect(call.task).toMatchObject({
      id: `check-${validBody.skill_node_id}`,
      skill_node_id: validBody.skill_node_id,
      type: "short_answer",
      prompt: validBody.question,
    });
    expect(call.task.rubric.criteria).toHaveLength(2);
  });

  it("scores exactly 69.99 as NOT passed, and does not mark the lesson complete", async () => {
    mockGradeAssessmentAttempt.mockResolvedValue({
      ai_score: 69.99,
      ai_feedback: { summary: "close" },
      confidence: 0.6,
    });

    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.grading.passed).toBe(false);
    expect(json.grading.score).toBe(69.99);
    expect(mockMarkLessonComplete).not.toHaveBeenCalled();
  });

  it("scores exactly 70 as passed, and marks the lesson complete with the real score and correct source", async () => {
    mockGradeAssessmentAttempt.mockResolvedValue({
      ai_score: 70,
      ai_feedback: { summary: "good" },
      confidence: 0.8,
    });
    mockMarkLessonComplete.mockResolvedValue({ success: true });

    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.grading.passed).toBe(true);
    expect(json.grading.score).toBe(70);

    expect(mockMarkLessonComplete).toHaveBeenCalledTimes(1);
    expect(mockMarkLessonComplete).toHaveBeenCalledWith({
      userId: "user-1",
      skillNodeId: validBody.skill_node_id,
      score: 70,
      source: "check_understanding",
    });
  });

  it("passes through the real ai_score (not a hardcoded value) into markLessonComplete", async () => {
    mockGradeAssessmentAttempt.mockResolvedValue({
      ai_score: 93.5,
      ai_feedback: {},
      confidence: 1,
    });
    mockMarkLessonComplete.mockResolvedValue({ success: true });

    await POST(req(validBody));

    expect(mockMarkLessonComplete).toHaveBeenCalledWith(
      expect.objectContaining({ score: 93.5 }),
    );
  });

  it("returns 429 with the error's .details as the body when grading throws UsageCapExceededError", async () => {
    const details = {
      allowed: false as const,
      error: "usage_cap_exceeded" as const,
      feature: "check_understanding",
      resetDate: "2026-09-01T00:00:00Z",
      limit: 10,
      currentUsage: 10,
    };
    mockGradeAssessmentAttempt.mockRejectedValue(new UsageCapExceededError(details));

    const res = await POST(req(validBody));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json).toEqual(details);
    expect(mockMarkLessonComplete).not.toHaveBeenCalled();
  });

  it("does not surface UsageCapExceededError as a generic 500", async () => {
    mockGradeAssessmentAttempt.mockRejectedValue(
      new UsageCapExceededError({
        allowed: false,
        error: "usage_cap_exceeded",
        feature: "check_understanding",
        resetDate: "2026-09-01T00:00:00Z",
        limit: 5,
        currentUsage: 5,
      }),
    );

    const res = await POST(req(validBody));
    expect(res.status).not.toBe(500);
  });

  it("swallows a markLessonComplete failure — still returns 200 with the passed grading result", async () => {
    mockGradeAssessmentAttempt.mockResolvedValue({
      ai_score: 85,
      ai_feedback: { summary: "great job" },
      confidence: 0.95,
    });
    mockMarkLessonComplete.mockRejectedValue(new Error("db write failed"));

    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.grading.passed).toBe(true);
    expect(json.grading.score).toBe(85);
    expect(json.grading.feedback).toEqual({ summary: "great job" });
  });
});
