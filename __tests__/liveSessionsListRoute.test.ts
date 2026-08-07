import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
  createClient: () =>
    Promise.resolve({
      from: (table: string) => {
        if (table !== "live_sessions") throw new Error(`Unexpected table: ${table}`);
        return { select: () => ({ is: () => ({ order: () => mockSelect() }) }) };
      },
    }),
}));

import { GET } from "@/app/api/live-sessions/route";

describe("app/api/live-sessions/route.ts — request-scoped client, RLS does the filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetServerUser.mockResolvedValue({ user: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns whatever RLS-filtered sessions the request-scoped client returns", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    const fakeSessions = [{ id: "s1", title: "Week 5", session_type: "live_class" }];
    mockSelect.mockResolvedValue({ data: fakeSessions, error: null });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessions).toEqual(fakeSessions);
  });

  it("returns 500 when the query errors", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockSelect.mockResolvedValue({ data: null, error: { message: "db down" } });

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
