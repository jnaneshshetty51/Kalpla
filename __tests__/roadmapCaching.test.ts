import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockGetDashboardAggregateData = vi.fn();
vi.mock("@/lib/dashboard/aggregate", () => ({
  getDashboardAggregateData: (userId: string) => mockGetDashboardAggregateData(userId),
}));

const mockGenerateUserRoadmap = vi.fn();
vi.mock("@/lib/roadmap/generate", () => ({
  generateUserRoadmap: (params: unknown) => mockGenerateUserRoadmap(params),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  return chain;
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { GET } from "@/app/api/roadmap/route";

describe("GET /api/roadmap — cache-or-generate behavior, no LLM call on a cache hit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockGetDashboardAggregateData.mockResolvedValue({ overallScore: 42.5 });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockGenerateUserRoadmap).not.toHaveBeenCalled();
  });

  it("a cached roadmap row is returned as-is with cached: true and never triggers generation", async () => {
    const cachedRecord = {
      id: "roadmap-123",
      user_id: "usr-1",
      generated_at: "2026-08-05T12:00:00Z",
      nodes: [{ skill_node_id: "node-1", node_name: "LLM Basics", order: 1, estimated_days: 2, status: "available" }],
    };
    mockFrom.mockReturnValue(makeChainable({ data: cachedRecord, error: null }));

    const res = await GET();
    const json = await res.json();

    expect(json.cached).toBe(true);
    expect(json.roadmap.id).toBe("roadmap-123");
    expect(mockGenerateUserRoadmap).not.toHaveBeenCalled();
  });

  it("no cached row -> generates a fresh roadmap and reports cached: false", async () => {
    mockFrom.mockReturnValue(makeChainable({ data: null, error: null }));
    mockGenerateUserRoadmap.mockResolvedValue({
      id: "roadmap-new",
      user_id: "usr-1",
      generated_at: "2026-08-05T14:00:00Z",
      nodes: [],
    });

    const res = await GET();
    const json = await res.json();

    expect(json.cached).toBe(false);
    expect(mockGenerateUserRoadmap).toHaveBeenCalledTimes(1);
    expect(mockGenerateUserRoadmap).toHaveBeenCalledWith({ userId: "usr-1" });
    expect(json.roadmap.id).toBe("roadmap-new");
  });

  it("a query error on the cache lookup is logged but still falls through to generation rather than 500ing", async () => {
    mockFrom.mockReturnValue(makeChainable({ data: null, error: { message: "connection reset" } }));
    mockGenerateUserRoadmap.mockResolvedValue({ id: "roadmap-fallback", user_id: "usr-1", generated_at: "now", nodes: [] });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cached).toBe(false);
    expect(json.roadmap.id).toBe("roadmap-fallback");
  });

  it("overallScore comes from the SAME getDashboardAggregateData computation the dashboard uses, on both the cached and freshly-generated paths", async () => {
    mockGetDashboardAggregateData.mockResolvedValue({ overallScore: 77.7 });

    mockFrom.mockReturnValue(makeChainable({ data: { id: "r1", nodes: [] }, error: null }));
    const cachedRes = await GET();
    const cachedJson = await cachedRes.json();
    expect(cachedJson.overallScore).toBe(77.7);
    expect(mockGetDashboardAggregateData).toHaveBeenCalledWith("usr-1");

    mockFrom.mockReturnValue(makeChainable({ data: null, error: null }));
    mockGenerateUserRoadmap.mockResolvedValue({ id: "r2", nodes: [] });
    const freshRes = await GET();
    const freshJson = await freshRes.json();
    expect(freshJson.overallScore).toBe(77.7);
  });
});
