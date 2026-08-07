import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthResult = { authorized: true as const, user: { id: "admin-1" }, profile: { role: "admin" } };
let currentAuthResult: unknown = mockAuthResult;
vi.mock("@/lib/admin/verifyAdminAuth", () => ({
  verifyAdminAuth: () => Promise.resolve(currentAuthResult),
}));

const mockIsVideoProviderConfigured = vi.fn();
const mockCreateRoom = vi.fn();
vi.mock("@/lib/liveSessions", () => ({
  isVideoProviderConfigured: () => mockIsVideoProviderConfigured(),
  createRoom: (...args: unknown[]) => mockCreateRoom(...args),
}));

const mockSessionsSelect = vi.fn();
const mockUsersSelect = vi.fn();
const mockInsert = vi.fn();

const mockFrom = vi.fn((table: string) => {
  if (table === "live_sessions") {
    return {
      select: () => ({ order: () => mockSessionsSelect() }),
      insert: (payload: unknown) => ({
        select: () => ({ single: () => mockInsert(payload) }),
      }),
    };
  }
  if (table === "users") {
    return { select: () => ({ in: () => mockUsersSelect() }) };
  }
  throw new Error(`Unexpected table access in test: "${table}"`);
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => mockFrom(table) }),
}));

import { GET, POST } from "@/app/api/admin/live-sessions/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/live-sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID_LIVE_CLASS = {
  title: "Week 5 — Agent Loops",
  session_type: "live_class",
  starts_at: "2026-09-01T18:00:00.000Z",
  duration_minutes: 60,
};

describe("app/api/admin/live-sessions/route.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAuthResult = mockAuthResult;
    mockIsVideoProviderConfigured.mockReturnValue(true);
    mockSessionsSelect.mockResolvedValue({ data: [], error: null });
    mockUsersSelect.mockResolvedValue({ data: [], error: null });
  });

  describe("GET", () => {
    it("returns 401/403 via verifyAdminAuth when not authorized", async () => {
      const response = { status: 403, json: async () => ({ error: "Forbidden" }) };
      currentAuthResult = { authorized: false, response };
      const res = await GET();
      expect(res).toBe(response);
    });

    it("returns sessions with assigned_user resolved for mock_interview rows", async () => {
      mockSessionsSelect.mockResolvedValue({
        data: [
          { id: "s1", session_type: "live_class", assigned_user_id: null },
          { id: "s2", session_type: "mock_interview", assigned_user_id: "usr-1" },
        ],
        error: null,
      });
      mockUsersSelect.mockResolvedValue({ data: [{ id: "usr-1", name: "Ada" }], error: null });

      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.sessions).toEqual([
        { id: "s1", session_type: "live_class", assigned_user_id: null, assigned_user: null },
        { id: "s2", session_type: "mock_interview", assigned_user_id: "usr-1", assigned_user: { name: "Ada" } },
      ]);
    });

    it("returns 500 when the sessions query errors", async () => {
      mockSessionsSelect.mockResolvedValue({ data: null, error: { message: "db down" } });
      const res = await GET();
      expect(res.status).toBe(500);
    });
  });

  describe("POST", () => {
    it("returns 401/403 via verifyAdminAuth when not authorized", async () => {
      const response = { status: 401, json: async () => ({ error: "Unauthorized" }) };
      currentAuthResult = { authorized: false, response };
      const res = await POST(makeRequest(VALID_LIVE_CLASS));
      expect(res).toBe(response);
    });

    it("returns 503 when the video provider isn't configured", async () => {
      mockIsVideoProviderConfigured.mockReturnValue(false);
      const res = await POST(makeRequest(VALID_LIVE_CLASS));
      expect(res.status).toBe(503);
      expect(mockCreateRoom).not.toHaveBeenCalled();
    });

    it("returns 400 when 'title' is missing", async () => {
      const res = await POST(makeRequest({ ...VALID_LIVE_CLASS, title: "" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for an invalid session_type", async () => {
      const res = await POST(makeRequest({ ...VALID_LIVE_CLASS, session_type: "webinar" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when mock_interview has no assigned_user_id", async () => {
      const res = await POST(
        makeRequest({ ...VALID_LIVE_CLASS, session_type: "mock_interview", assigned_user_id: undefined }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when a cohort-wide type includes assigned_user_id", async () => {
      const res = await POST(makeRequest({ ...VALID_LIVE_CLASS, assigned_user_id: "usr-1" }));
      expect(res.status).toBe(400);
    });

    it("creates a room, then inserts the session with the room fields populated", async () => {
      mockCreateRoom.mockResolvedValue({ name: "room-abc", url: "https://kalpla.daily.co/room-abc" });
      mockInsert.mockResolvedValue({
        data: { id: "new-session", ...VALID_LIVE_CLASS, daily_room_name: "room-abc", daily_room_url: "https://kalpla.daily.co/room-abc" },
        error: null,
      });

      const res = await POST(makeRequest(VALID_LIVE_CLASS));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.session.daily_room_name).toBe("room-abc");

      expect(mockCreateRoom).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt: expect.any(Number), maxParticipants: 30 }),
      );
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: VALID_LIVE_CLASS.title,
          daily_room_name: "room-abc",
          daily_room_url: "https://kalpla.daily.co/room-abc",
          created_by: "admin-1",
          assigned_user_id: null,
        }),
      );
    });

    it("caps mock_interview rooms tighter than cohort-wide session types", async () => {
      mockCreateRoom.mockResolvedValue({ name: "room-mi", url: "https://kalpla.daily.co/room-mi" });
      mockInsert.mockResolvedValue({
        data: { id: "new-session", daily_room_name: "room-mi", daily_room_url: "https://kalpla.daily.co/room-mi" },
        error: null,
      });

      const res = await POST(
        makeRequest({ ...VALID_LIVE_CLASS, session_type: "mock_interview", assigned_user_id: "usr-1" }),
      );

      expect(res.status).toBe(200);
      expect(mockCreateRoom).toHaveBeenCalledWith(expect.objectContaining({ maxParticipants: 4 }));
    });

    it("returns 502 when room creation fails, and never attempts the insert", async () => {
      mockCreateRoom.mockRejectedValue(new Error("Daily API down"));
      const res = await POST(makeRequest(VALID_LIVE_CLASS));
      expect(res.status).toBe(502);
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });
});
