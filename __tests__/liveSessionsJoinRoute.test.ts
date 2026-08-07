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

const mockIsVideoProviderConfigured = vi.fn();
const mockCreateJoinToken = vi.fn();
vi.mock("@/lib/liveSessions", () => ({
  isVideoProviderConfigured: () => mockIsVideoProviderConfigured(),
  createJoinToken: (...args: unknown[]) => mockCreateJoinToken(...args),
}));

const mockSessionSelect = vi.fn();
const mockAttendanceUpsert = vi.fn();

const mockFrom = vi.fn((table: string) => {
  if (table === "live_sessions") {
    return { select: () => ({ eq: () => ({ maybeSingle: () => mockSessionSelect() }) }) };
  }
  if (table === "live_session_attendance") {
    return { upsert: (...args: unknown[]) => mockAttendanceUpsert(...args) };
  }
  throw new Error(`Unexpected table access in test: "${table}"`);
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => mockFrom(table) }),
}));

import { POST } from "@/app/api/live-sessions/[id]/join/route";

function makeRequest() {
  return new Request("http://localhost/api/live-sessions/s1/join", { method: "POST" });
}
function makeParams(id = "s1") {
  return { params: Promise.resolve({ id }) };
}

const COHORT_SESSION = {
  id: "s1",
  session_type: "live_class",
  assigned_user_id: null,
  cancelled_at: null,
  daily_room_name: "room-abc",
  daily_room_url: "https://kalpla.daily.co/room-abc",
  starts_at: "2026-09-01T18:00:00.000Z",
  duration_minutes: 60,
};

describe("app/api/live-sessions/[id]/join/route.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockReturnValue(false);
    mockIsVideoProviderConfigured.mockReturnValue(true);
    mockAttendanceUpsert.mockResolvedValue({ error: null });
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(401);
    expect(mockCreateJoinToken).not.toHaveBeenCalled();
  });

  it("returns 503 when the video provider isn't configured", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: { role: "user" } });
    mockIsVideoProviderConfigured.mockReturnValue(false);
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(503);
  });

  it("returns 404 when the session doesn't exist or is cancelled", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: { role: "user" } });
    mockSessionSelect.mockResolvedValue({ data: null, error: null });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 404 for a cancelled session", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: { role: "user" } });
    mockSessionSelect.mockResolvedValue({ data: { ...COHORT_SESSION, cancelled_at: "2026-08-01T00:00:00.000Z" }, error: null });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("lets any authenticated user join a cohort-wide session with isOwner: false", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: { role: "user", name: "Student" } });
    mockSessionSelect.mockResolvedValue({ data: COHORT_SESSION, error: null });
    mockCreateJoinToken.mockResolvedValue("student-token");

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ roomUrl: COHORT_SESSION.daily_room_url, token: "student-token" });
    expect(mockCreateJoinToken).toHaveBeenCalledWith(expect.objectContaining({ isOwner: false, roomName: "room-abc" }));
  });

  it("grants isOwner: true when the caller is an admin", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin", name: "Admin" } });
    mockSessionSelect.mockResolvedValue({ data: COHORT_SESSION, error: null });
    mockCreateJoinToken.mockResolvedValue("admin-token");

    await POST(makeRequest(), makeParams());
    expect(mockCreateJoinToken).toHaveBeenCalledWith(expect.objectContaining({ isOwner: true }));
  });

  it("rejects a non-admin, non-assigned user from a mock_interview session with 403", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-2" }, profile: { role: "user" } });
    mockSessionSelect.mockResolvedValue({
      data: { ...COHORT_SESSION, session_type: "mock_interview", assigned_user_id: "usr-1" },
      error: null,
    });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(403);
    expect(mockCreateJoinToken).not.toHaveBeenCalled();
  });

  it("lets the assigned student join their own mock_interview session", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: { role: "user" } });
    mockSessionSelect.mockResolvedValue({
      data: { ...COHORT_SESSION, session_type: "mock_interview", assigned_user_id: "usr-1" },
      error: null,
    });
    mockCreateJoinToken.mockResolvedValue("assigned-token");

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
  });

  it("writes an attendance row with the correct role_at_join after a successful join", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: { role: "user" } });
    mockSessionSelect.mockResolvedValue({ data: COHORT_SESSION, error: null });
    mockCreateJoinToken.mockResolvedValue("student-token");

    await POST(makeRequest(), makeParams());
    expect(mockAttendanceUpsert).toHaveBeenCalledWith(
      { session_id: "s1", user_id: "usr-1", role_at_join: "student" },
      { onConflict: "session_id,user_id", ignoreDuplicates: true },
    );
  });

  it("still returns the join token even if the attendance write fails (non-fatal)", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: { role: "user" } });
    mockSessionSelect.mockResolvedValue({ data: COHORT_SESSION, error: null });
    mockCreateJoinToken.mockResolvedValue("student-token");
    mockAttendanceUpsert.mockResolvedValue({ error: { message: "constraint violation" } });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
  });

  it("returns 502 when token creation fails", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: { role: "user" } });
    mockSessionSelect.mockResolvedValue({ data: COHORT_SESSION, error: null });
    mockCreateJoinToken.mockRejectedValue(new Error("Daily API down"));

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(502);
  });
});
