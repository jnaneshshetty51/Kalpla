import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockGetDashboardAggregateData = vi.fn();
vi.mock("@/lib/dashboard/aggregate", () => ({
  getDashboardAggregateData: (userId: string) => mockGetDashboardAggregateData(userId),
}));

import { GET } from "@/app/api/dashboard/route";

describe("app/api/dashboard/route.ts — thin auth gate + delegation wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockGetDashboardAggregateData).not.toHaveBeenCalled();
  });

  it("delegates to getDashboardAggregateData with the caller's user id and wraps the result under 'dashboard'", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: null });
    const fakeDashboard = { readiness: 42, categories: [] };
    mockGetDashboardAggregateData.mockResolvedValue(fakeDashboard);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ dashboard: fakeDashboard });
    expect(mockGetDashboardAggregateData).toHaveBeenCalledWith("usr-1");
  });

  it("returns 500 when getDashboardAggregateData throws, rather than crashing uncaught", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: null });
    mockGetDashboardAggregateData.mockRejectedValue(new Error("db exploded"));

    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal Server Error");
  });
});
