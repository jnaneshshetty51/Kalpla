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

const mockReviewSubmission = vi.fn();
vi.mock("@/lib/grading/reviewSubmission", () => ({
  reviewSubmission: (params: unknown) => mockReviewSubmission(params),
}));

const mockFlagSubmissionForReview = vi.fn();
vi.mock("@/lib/grading/reviewQueue", () => ({
  flagSubmissionForReview: (params: unknown) => mockFlagSubmissionForReview(params),
}));

vi.mock("@/lib/llm/executeLLMCallWithCap", async (importOriginal) => {
  // Keep the REAL UsageCapExceededError class so `instanceof` checks in the
  // route still work against errors thrown from the mocked reviewSubmission.
  const actual = await importOriginal<typeof import("@/lib/llm/executeLLMCallWithCap")>();
  return { ...actual };
});

function makeChainable(result: { data: unknown; error: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const PROJECT_ROW = {
  id: "proj-1",
  name: "RAG Chunker",
  spec: { type: "rag", description: "Build a chunker.", requirements: ["chunk_text works"] },
};

let projectRow: unknown = PROJECT_ROW;
let projectError: unknown = null;
let hintsCount: number | null = 3;
let insertError: { message: string } | null = null;
let insertPayloadCaptured: Record<string, unknown> | null = null;
let updatePayloadCaptured: Record<string, unknown> | null = null;
let insertedSubmission: { id: string; [k: string]: unknown } | null = null;

function defaultMockFromImpl(table: string) {
  if (table === "projects") return makeChainable({ data: projectRow, error: projectError });
  if (table === "workspace_hints") return makeChainable({ data: null, error: null, count: hintsCount });
  if (table === "submissions") {
    const chain = makeChainable({ data: null, error: null });
    chain.insert = vi.fn((payload: Record<string, unknown>) => {
      insertPayloadCaptured = payload;
      insertedSubmission = insertError ? null : { id: "sub-1", ...payload };
      return {
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: insertedSubmission, error: insertError })),
        })),
      };
    });
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      updatePayloadCaptured = payload;
      return chain;
    });
    return chain;
  }
  return makeChainable({ data: null, error: null });
}

const mockFrom = vi.fn(defaultMockFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { POST } from "@/app/api/submissions/route";
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";

function req(body: unknown) {
  return new Request("http://localhost/api/submissions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID_REVIEW = {
  overall_score: 88,
  logic_correctness: { score: 90, summary: "Good." },
  readability: { score: 85, summary: "Clear." },
  optimization_opportunities: { score: 80, summary: "Fine." },
  edge_case_handling: { score: 85, summary: "Handled." },
  architecture_quality: { score: 90, summary: "Solid." },
  genai_specific_criteria: [],
  reflection_flag: null,
  confidence: "high" as const,
  is_ambiguous: false,
  failedValidationAfterRetry: false,
};

describe("app/api/submissions/route.ts — POST (create a project submission)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFromImpl);
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: { role: "user" } });
    mockCheckRateLimit.mockReturnValue(false);
    mockReviewSubmission.mockResolvedValue(VALID_REVIEW);
    mockFlagSubmissionForReview.mockResolvedValue(undefined);

    projectRow = PROJECT_ROW;
    projectError = null;
    hintsCount = 3;
    insertError = null;
    insertPayloadCaptured = null;
    updatePayloadCaptured = null;
    insertedSubmission = null;
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });
    const res = await POST(req({ project_id: "proj-1", code: "x", reflection: "hard part" }));
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(
      new Request("http://localhost/api/submissions", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when project_id is missing", async () => {
    const res = await POST(req({ code: "x", reflection: "hard part" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when code is missing or not a string", async () => {
    const res = await POST(req({ project_id: "proj-1", code: 123, reflection: "hard part" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when reflection is missing or blank", async () => {
    const res1 = await POST(req({ project_id: "proj-1", code: "x" }));
    expect(res1.status).toBe(400);

    const res2 = await POST(req({ project_id: "proj-1", code: "x", reflection: "   " }));
    expect(res2.status).toBe(400);
  });

  it("returns 404 when the project doesn't exist", async () => {
    projectRow = null;
    const res = await POST(req({ project_id: "missing", code: "x", reflection: "hard part" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the project lookup errors", async () => {
    projectRow = null;
    projectError = { message: "db down" };
    const res = await POST(req({ project_id: "proj-1", code: "x", reflection: "hard part" }));
    expect(res.status).toBe(404);
  });

  it("returns 500 when the submission insert fails", async () => {
    insertError = { message: "constraint violation" };
    const res = await POST(req({ project_id: "proj-1", code: "x", reflection: "hard part" }));
    expect(res.status).toBe(500);
    expect(mockReviewSubmission).not.toHaveBeenCalled();
  });

  it("writes a new submission row with the correct shape (trimmed reflection, pending status, hints_used, test_results)", async () => {
    hintsCount = 5;
    const res = await POST(
      req({
        project_id: "proj-1",
        code: "def chunk_text(): pass",
        reflection: "  the hardest part was overlap logic  ",
        test_results: [{ function: "chunk_text", passed: true }],
      }),
    );

    expect(res.status).toBe(200);
    expect(insertPayloadCaptured).toMatchObject({
      user_id: "usr-1",
      project_id: "proj-1",
      code: "def chunk_text(): pass",
      reflection: "the hardest part was overlap logic",
      status: "pending",
      metadata: {
        hints_used: 5,
        test_results: [{ function: "chunk_text", passed: true }],
      },
    });
  });

  it("defaults hints_used to 0 when the hints count query returns null", async () => {
    hintsCount = null;
    await POST(req({ project_id: "proj-1", code: "x", reflection: "hard part" }));
    expect((insertPayloadCaptured?.metadata as { hints_used: number }).hints_used).toBe(0);
  });

  it("marks the final status 'passed' when all supplied test_results passed, and updates the row accordingly", async () => {
    await POST(
      req({
        project_id: "proj-1",
        code: "x",
        reflection: "hard part",
        test_results: [
          { function: "a", passed: true },
          { function: "b", passed: true },
        ],
      }),
    );
    expect(updatePayloadCaptured).toMatchObject({ status: "passed", ai_review: VALID_REVIEW });
  });

  it("marks the final status 'failed' when any test fails, and 'failed' when there are no test results at all", async () => {
    const resWithFailure = await POST(
      req({
        project_id: "proj-1",
        code: "x",
        reflection: "hard part",
        test_results: [{ function: "a", passed: false, error: "mismatch" }],
      }),
    );
    const jsonWithFailure = await resWithFailure.json();
    expect(jsonWithFailure.submission.status).toBe("failed");

    const resNoTests = await POST(req({ project_id: "proj-1", code: "x", reflection: "hard part" }));
    const jsonNoTests = await resNoTests.json();
    expect(jsonNoTests.submission.status).toBe("failed");
  });

  it("calls reviewSubmission with the submitting user's id, project info, code, trimmed reflection, and test_results", async () => {
    await POST(
      req({
        project_id: "proj-1",
        code: "def f(): pass",
        reflection: "  reflect  ",
        test_results: [{ function: "f", passed: true }],
      }),
    );

    expect(mockReviewSubmission).toHaveBeenCalledWith({
      userId: "usr-1",
      project: { id: "proj-1", name: "RAG Chunker", spec: PROJECT_ROW.spec },
      code: "def f(): pass",
      reflection: "reflect",
      testResults: [{ function: "f", passed: true }],
    });
  });

  it("flags the submission with 'schema_validation_failed' when the review failed schema validation after retry, and does NOT also flag low_confidence", async () => {
    mockReviewSubmission.mockResolvedValue({
      ...VALID_REVIEW,
      confidence: "low",
      is_ambiguous: true,
      failedValidationAfterRetry: true,
    });

    await POST(req({ project_id: "proj-1", code: "x", reflection: "hard part" }));

    expect(mockFlagSubmissionForReview).toHaveBeenCalledTimes(1);
    expect(mockFlagSubmissionForReview).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "schema_validation_failed", submissionId: "sub-1" }),
    );
  });

  it("flags the submission with 'low_confidence' when confidence is low, even though validation succeeded", async () => {
    mockReviewSubmission.mockResolvedValue({ ...VALID_REVIEW, confidence: "low" });

    await POST(req({ project_id: "proj-1", code: "x", reflection: "hard part" }));

    expect(mockFlagSubmissionForReview).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "low_confidence", submissionId: "sub-1" }),
    );
  });

  it("flags the submission as low_confidence when is_ambiguous is true, even with high confidence", async () => {
    mockReviewSubmission.mockResolvedValue({ ...VALID_REVIEW, confidence: "high", is_ambiguous: true });

    await POST(req({ project_id: "proj-1", code: "x", reflection: "hard part" }));

    expect(mockFlagSubmissionForReview).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "low_confidence" }),
    );
  });

  it("does NOT flag the submission when confidence is high, not ambiguous, and validation succeeded", async () => {
    await POST(req({ project_id: "proj-1", code: "x", reflection: "hard part" }));
    expect(mockFlagSubmissionForReview).not.toHaveBeenCalled();
  });

  it("propagates a UsageCapExceededError from reviewSubmission as a 429 with the cap details as the body", async () => {
    const capError = new UsageCapExceededError({
      allowed: false,
      error: "usage_cap_exceeded",
      feature: "submission_review",
      resetDate: "2026-09-01T00:00:00.000Z",
      limit: 5,
      currentUsage: 5,
    });
    mockReviewSubmission.mockRejectedValue(capError);

    const res = await POST(req({ project_id: "proj-1", code: "x", reflection: "hard part" }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.feature).toBe("submission_review");
  });

  it("returns 500 (not swallowed) when reviewSubmission throws an unexpected error", async () => {
    mockReviewSubmission.mockRejectedValue(new Error("provider outage"));
    const res = await POST(req({ project_id: "proj-1", code: "x", reflection: "hard part" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal Server Error");
  });
});
