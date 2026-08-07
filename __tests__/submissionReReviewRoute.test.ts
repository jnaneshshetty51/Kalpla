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
  const actual = await importOriginal<typeof import("@/lib/llm/executeLLMCallWithCap")>();
  return { ...actual };
});

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const SUBMISSION_ROW = {
  id: "sub-1",
  user_id: "usr-owner",
  project_id: "proj-1",
  code: "def f(): pass",
  reflection: "it was hard",
  ai_review: { overall_score: 60, logic_correctness: { summary: "meh" } },
  metadata: {},
};

const PROJECT_ROW = { id: "proj-1", name: "RAG Chunker", spec: { type: "rag" } };

let submissionRow: Record<string, unknown> | null = { ...SUBMISSION_ROW };
let submissionError: unknown = null;
let projectRow: unknown = PROJECT_ROW;
let projectError: unknown = null;
let updatePayloadCaptured: Record<string, unknown> | null = null;

function defaultMockFromImpl(table: string) {
  if (table === "submissions") {
    const chain = makeChainable({ data: submissionRow, error: submissionError });
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      updatePayloadCaptured = payload;
      return chain;
    });
    return chain;
  }
  if (table === "projects") return makeChainable({ data: projectRow, error: projectError });
  return makeChainable({ data: null, error: null });
}

const mockFrom = vi.fn(defaultMockFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { POST } from "@/app/api/submissions/[id]/re-review/route";
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";

function reqWithParams(id: string, body: unknown) {
  const request = new Request(`http://localhost/api/submissions/${id}/re-review`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { request, params: Promise.resolve({ id }) };
}

const NEW_REVIEW = {
  overall_score: 85,
  logic_correctness: { score: 90, summary: "Now correct." },
  readability: { score: 85, summary: "Clear." },
  optimization_opportunities: { score: 80, summary: "Fine." },
  edge_case_handling: { score: 85, summary: "Handled." },
  architecture_quality: null,
  genai_specific_criteria: [],
  reflection_flag: null,
  confidence: "high" as const,
  is_ambiguous: false,
  failedValidationAfterRetry: false,
};

describe("app/api/submissions/[id]/re-review/route.ts — POST (re-review with clarification, self-triggered)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFromImpl);
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-owner" }, profile: { role: "user" } });
    mockCheckRateLimit.mockReturnValue(false);
    mockReviewSubmission.mockResolvedValue(NEW_REVIEW);
    mockFlagSubmissionForReview.mockResolvedValue(undefined);

    submissionRow = { ...SUBMISSION_ROW, metadata: {} };
    submissionError = null;
    projectRow = PROJECT_ROW;
    projectError = null;
    updatePayloadCaptured = null;
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });
    const { request, params } = reqWithParams("sub-1", { clarification: "actually I did handle it" });
    const res = await POST(request, { params });
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON body", async () => {
    const { params } = reqWithParams("sub-1", {});
    const badRequest = new Request("http://localhost/api/submissions/sub-1/re-review", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(badRequest, { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when clarification is missing or blank", async () => {
    const { request, params } = reqWithParams("sub-1", { clarification: "   " });
    const res = await POST(request, { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the submission does not exist", async () => {
    submissionRow = null;
    const { request, params } = reqWithParams("missing", { clarification: "please recheck" });
    const res = await POST(request, { params });
    expect(res.status).toBe(404);
  });

  it("SECURITY: returns 403, not a review, when a non-owning user tries to re-review someone else's submission", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-attacker" }, profile: { role: "user" } });
    const { request, params } = reqWithParams("sub-1", { clarification: "please recheck" });
    const res = await POST(request, { params });
    expect(res.status).toBe(403);
    expect(mockReviewSubmission).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.review).toBeUndefined();
  });

  it("returns 429 once the per-submission re-review limit (2) has been reached", async () => {
    submissionRow = {
      ...SUBMISSION_ROW,
      metadata: {
        re_review_requests: [
          { clarification: "first", created_at: "2026-08-01T00:00:00Z" },
          { clarification: "second", created_at: "2026-08-02T00:00:00Z" },
        ],
      },
    };
    const { request, params } = reqWithParams("sub-1", { clarification: "third try" });
    const res = await POST(request, { params });
    expect(res.status).toBe(429);
    expect(mockReviewSubmission).not.toHaveBeenCalled();
  });

  it("returns 404 when the parent project can no longer be found", async () => {
    projectRow = null;
    const { request, params } = reqWithParams("sub-1", { clarification: "please recheck" });
    const res = await POST(request, { params });
    expect(res.status).toBe(404);
  });

  it("calls reviewSubmission with the prior review, trimmed clarification, and the stored code/reflection", async () => {
    const { request, params } = reqWithParams("sub-1", { clarification: "  I did add validation  " });
    await POST(request, { params });

    expect(mockReviewSubmission).toHaveBeenCalledWith({
      userId: "usr-owner",
      project: { id: "proj-1", name: "RAG Chunker", spec: PROJECT_ROW.spec },
      code: "def f(): pass",
      reflection: "it was hard",
      clarification: "I did add validation",
      priorReview: SUBMISSION_ROW.ai_review,
    });
  });

  it("persists the new review and appends to re_review_requests, returning correct used/remaining counts", async () => {
    const { request, params } = reqWithParams("sub-1", { clarification: "please recheck" });
    const res = await POST(request, { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.review).toEqual(NEW_REVIEW);
    expect(json.re_reviews_used).toBe(1);
    expect(json.re_reviews_remaining).toBe(1);

    expect(updatePayloadCaptured).toMatchObject({ ai_review: NEW_REVIEW });
    const metadata = updatePayloadCaptured?.metadata as { re_review_requests: Array<{ clarification: string }> };
    expect(metadata.re_review_requests).toHaveLength(1);
    expect(metadata.re_review_requests[0].clarification).toBe("please recheck");
  });

  it("preserves prior re_review_requests when appending a new one", async () => {
    submissionRow = {
      ...SUBMISSION_ROW,
      metadata: { re_review_requests: [{ clarification: "first", created_at: "2026-08-01T00:00:00Z" }] },
    };
    const { request, params } = reqWithParams("sub-1", { clarification: "second try" });
    const res = await POST(request, { params });
    const json = await res.json();

    expect(json.re_reviews_used).toBe(2);
    expect(json.re_reviews_remaining).toBe(0);
    const metadata = updatePayloadCaptured?.metadata as { re_review_requests: Array<{ clarification: string }> };
    expect(metadata.re_review_requests.map((r) => r.clarification)).toEqual(["first", "second try"]);
  });

  it("flags the submission for review when the new review comes back low confidence, ambiguous, or schema-invalid", async () => {
    mockReviewSubmission.mockResolvedValue({ ...NEW_REVIEW, confidence: "low" });
    const { request, params } = reqWithParams("sub-1", { clarification: "please recheck" });
    await POST(request, { params });

    expect(mockFlagSubmissionForReview).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: "sub-1", reason: "low_confidence" }),
    );
  });

  it("flags with 'schema_validation_failed' (not low_confidence) when the retry itself failed validation", async () => {
    mockReviewSubmission.mockResolvedValue({ ...NEW_REVIEW, failedValidationAfterRetry: true });
    const { request, params } = reqWithParams("sub-1", { clarification: "please recheck" });
    await POST(request, { params });

    expect(mockFlagSubmissionForReview).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "schema_validation_failed" }),
    );
  });

  it("does not flag when the new review is high confidence, unambiguous, and validated", async () => {
    const { request, params } = reqWithParams("sub-1", { clarification: "please recheck" });
    await POST(request, { params });
    expect(mockFlagSubmissionForReview).not.toHaveBeenCalled();
  });

  it("propagates a UsageCapExceededError as 429 with the cap details as the body", async () => {
    const capError = new UsageCapExceededError({
      allowed: false,
      error: "usage_cap_exceeded",
      feature: "submission_review",
      resetDate: "2026-09-01T00:00:00.000Z",
      limit: 5,
      currentUsage: 5,
    });
    mockReviewSubmission.mockRejectedValue(capError);

    const { request, params } = reqWithParams("sub-1", { clarification: "please recheck" });
    const res = await POST(request, { params });
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.feature).toBe("submission_review");
  });

  it("returns 500 (not swallowed) when reviewSubmission throws an unexpected error", async () => {
    mockReviewSubmission.mockRejectedValue(new Error("provider outage"));
    const { request, params } = reqWithParams("sub-1", { clarification: "please recheck" });
    const res = await POST(request, { params });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal Server Error");
  });
});
