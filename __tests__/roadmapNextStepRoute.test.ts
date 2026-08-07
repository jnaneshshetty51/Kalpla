import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockGetRecommendedNextStep = vi.fn();
vi.mock("@/lib/roadmap/nextStep", () => ({
  getRecommendedNextStep: (userId: string) => mockGetRecommendedNextStep(userId),
}));

import { GET } from "@/app/api/roadmap/next-step/route";

describe("app/api/roadmap/next-step/route.ts — session-only auth gate + delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetServerUser.mockResolvedValue({ user: null });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockGetRecommendedNextStep).not.toHaveBeenCalled();
  });

  it("delegates to getRecommendedNextStep using only the session's own user id, and wraps the result under 'next_step'", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    const fakeNextStep = { skill_node_id: "a0000000-0000-4000-a000-000000000101", reason: "prerequisite gap" };
    mockGetRecommendedNextStep.mockResolvedValue(fakeNextStep);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ next_step: fakeNextStep });
    expect(mockGetRecommendedNextStep).toHaveBeenCalledWith("usr-1");
    expect(mockGetRecommendedNextStep).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when getRecommendedNextStep throws, rather than crashing uncaught", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockGetRecommendedNextStep.mockRejectedValue(new Error("skill graph query failed"));

    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal Server Error");
  });
});
