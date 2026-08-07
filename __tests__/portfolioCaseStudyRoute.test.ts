import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

const mockGenerateCaseStudy = vi.fn();
vi.mock("@/lib/portfolio/generateCaseStudy", () => ({
  generateCaseStudy: (params: unknown) => mockGenerateCaseStudy(params),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  rateLimitedResponse: () => ({ error: "Too many requests", code: "RATE_LIMITED" }),
}));

// Deliberately NOT mocked — the route does `err instanceof UsageCapExceededError`,
// so the class thrown here and the class checked by the route must be the exact
// same constructor reference.
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";

import { POST } from "@/app/api/portfolio/case-study/route";

function req(body: unknown) {
  return new Request("http://localhost/api/portfolio/case-study", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/portfolio/case-study — ownership-checked, usage-capped case-study generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockCheckRateLimit.mockReturnValue(false);
    mockFrom.mockImplementation(() => makeChainable({ data: { user_id: "usr-1" }, error: null }));
  });

  it("returns 401 when unauthenticated, without touching rate-limit or generation", async () => {
    mockGetServerUser.mockResolvedValue({ user: null });
    const res = await POST(req({ submission_id: "sub-1" }));
    expect(res.status).toBe(401);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockGenerateCaseStudy).not.toHaveBeenCalled();
  });

  it("returns 429 when rate-limited, without calling generateCaseStudy", async () => {
    mockCheckRateLimit.mockReturnValue(true);
    const res = await POST(req({ submission_id: "sub-1" }));
    expect(res.status).toBe(429);
    expect(mockGenerateCaseStudy).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await POST(new Request("http://localhost/api/portfolio/case-study", { method: "POST", body: "{not json" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when submission_id is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(mockGenerateCaseStudy).not.toHaveBeenCalled();
  });

  it("returns 403 when the submission doesn't exist", async () => {
    mockFrom.mockImplementation(() => makeChainable({ data: null, error: null }));
    const res = await POST(req({ submission_id: "sub-missing" }));
    expect(res.status).toBe(403);
    expect(mockGenerateCaseStudy).not.toHaveBeenCalled();
  });

  it("returns 403 when the submission belongs to a DIFFERENT user (ownership check)", async () => {
    mockFrom.mockImplementation(() => makeChainable({ data: { user_id: "someone-else" }, error: null }));
    const res = await POST(req({ submission_id: "sub-1" }));
    expect(res.status).toBe(403);
    expect(mockGenerateCaseStudy).not.toHaveBeenCalled();
  });

  it("on success, calls generateCaseStudy with the submission id and force flag, returning { case_study }", async () => {
    mockGenerateCaseStudy.mockResolvedValue({ summary: "A great project.", cached: false, generated_at: "2026-08-06T00:00:00Z" });

    const res = await POST(req({ submission_id: "sub-1", force: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.case_study).toEqual({ summary: "A great project.", cached: false, generated_at: "2026-08-06T00:00:00Z" });
    expect(mockGenerateCaseStudy).toHaveBeenCalledWith({ submissionId: "sub-1", force: true });
  });

  it("defaults force to false when omitted", async () => {
    mockGenerateCaseStudy.mockResolvedValue({ summary: "x", cached: true, generated_at: "2026-08-06T00:00:00Z" });
    await POST(req({ submission_id: "sub-1" }));
    expect(mockGenerateCaseStudy).toHaveBeenCalledWith({ submissionId: "sub-1", force: false });
  });

  it("translates a UsageCapExceededError from generateCaseStudy into a 429 carrying the cap details, not a fallback fake success", async () => {
    mockGenerateCaseStudy.mockRejectedValue(
      new UsageCapExceededError({
        allowed: false,
        error: "usage_cap_exceeded",
        feature: "portfolio_case_study",
        resetDate: "2026-09-01T00:00:00.000Z",
        limit: 5,
        currentUsage: 5,
      }),
    );

    const res = await POST(req({ submission_id: "sub-1" }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.feature).toBe("portfolio_case_study");
    expect(json.limit).toBe(5);
  });

  it("propagates a generic thrown error from generateCaseStudy as a 500, not a swallowed success", async () => {
    mockGenerateCaseStudy.mockRejectedValue(new Error("LLM provider unreachable"));
    const res = await POST(req({ submission_id: "sub-1" }));
    expect(res.status).toBe(500);
  });
});
