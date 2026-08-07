import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockGenerateUserRoadmap = vi.fn();
vi.mock("@/lib/roadmap/generate", () => ({
  generateUserRoadmap: (params: unknown) => mockGenerateUserRoadmap(params),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (userId: string, endpoint: string, max: number, windowMs: number) =>
    mockCheckRateLimit(userId, endpoint, max, windowMs),
  rateLimitedResponse: () => ({ error: "Too many requests — please wait before trying again.", code: "RATE_LIMITED" }),
}));

import { POST } from "@/app/api/roadmap/generate/route";

function req(body?: unknown) {
  return new Request("http://localhost/api/roadmap/generate", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("app/api/roadmap/generate/route.ts — auth gate + rate limit + delegation wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: null });
    mockCheckRateLimit.mockReturnValue(false); // not rate limited by default
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(mockGenerateUserRoadmap).not.toHaveBeenCalled();
  });

  it("returns 429 when the caller is rate limited, without calling generateUserRoadmap", async () => {
    mockCheckRateLimit.mockReturnValue(true);
    const res = await POST(req({}));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.code).toBe("RATE_LIMITED");
    expect(mockGenerateUserRoadmap).not.toHaveBeenCalled();
  });

  it("applies the rate limit per user id under the 'roadmap_generate' bucket", async () => {
    await POST(req({}));
    expect(mockCheckRateLimit).toHaveBeenCalledWith("usr-1", "roadmap_generate", 3, 60_000);
  });

  it("passes optional body params through to generateUserRoadmap and wraps the result", async () => {
    const fakeRoadmap = { id: "roadmap-1", nodes: [] };
    mockGenerateUserRoadmap.mockResolvedValue(fakeRoadmap);

    const res = await POST(req({ goal: "become a GenAI engineer", timeBudgetHoursPerWeek: 5, skipThreshold: 90 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ roadmap: fakeRoadmap });
    expect(mockGenerateUserRoadmap).toHaveBeenCalledWith({
      userId: "usr-1",
      goal: "become a GenAI engineer",
      timeBudgetHoursPerWeek: 5,
      skipThreshold: 90,
    });
  });

  it("tolerates a missing/empty request body, calling generateUserRoadmap with just the userId", async () => {
    const fakeRoadmap = { id: "roadmap-1", nodes: [] };
    mockGenerateUserRoadmap.mockResolvedValue(fakeRoadmap);

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockGenerateUserRoadmap).toHaveBeenCalledWith({
      userId: "usr-1",
      goal: undefined,
      timeBudgetHoursPerWeek: undefined,
      skipThreshold: undefined,
    });
  });

  it("returns 500 with the thrown error's message when generateUserRoadmap fails", async () => {
    mockGenerateUserRoadmap.mockRejectedValue(new Error("Failed to fetch skill nodes"));

    const res = await POST(req({}));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to fetch skill nodes");
  });
});
