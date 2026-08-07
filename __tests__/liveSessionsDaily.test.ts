import { describe, it, expect, vi, beforeEach } from "vitest";
import { isDailyConfigured, createDailyRoom, createDailyMeetingToken } from "@/lib/liveSessions/daily";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}

describe("lib/liveSessions/daily.ts", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  describe("isDailyConfigured", () => {
    it("returns false when DAILY_API_KEY is unset", () => {
      delete process.env.DAILY_API_KEY;
      expect(isDailyConfigured()).toBe(false);
    });

    it("returns true when DAILY_API_KEY is set", () => {
      process.env.DAILY_API_KEY = "fake-key";
      expect(isDailyConfigured()).toBe(true);
    });
  });

  describe("createDailyRoom", () => {
    it("throws a clear error when DAILY_API_KEY is not configured", async () => {
      delete process.env.DAILY_API_KEY;
      await expect(createDailyRoom({ expiresAt: 123 })).rejects.toThrow(/DAILY_API_KEY is not configured/);
    });

    it("POSTs a private room request and returns {name, url}", async () => {
      process.env.DAILY_API_KEY = "fake-key";
      mockFetch.mockResolvedValue(jsonResponse({ name: "abc123", url: "https://kalpla.daily.co/abc123" }));

      const room = await createDailyRoom({ name: "my-room", expiresAt: 1999999999 });

      expect(room).toEqual({ name: "abc123", url: "https://kalpla.daily.co/abc123" });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.daily.co/v1/rooms",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer fake-key" }),
        }),
      );
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({ name: "my-room", privacy: "private", properties: { exp: 1999999999 } });
    });

    it("omits the 'name' field entirely when not provided, letting Daily auto-generate one", async () => {
      process.env.DAILY_API_KEY = "fake-key";
      mockFetch.mockResolvedValue(jsonResponse({ name: "auto-generated", url: "https://kalpla.daily.co/auto-generated" }));

      await createDailyRoom({ expiresAt: 1999999999 });

      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body).not.toHaveProperty("name");
    });

    it("includes max_participants in room properties when provided", async () => {
      process.env.DAILY_API_KEY = "fake-key";
      mockFetch.mockResolvedValue(jsonResponse({ name: "abc123", url: "https://kalpla.daily.co/abc123" }));

      await createDailyRoom({ name: "my-room", expiresAt: 1999999999, maxParticipants: 30 });

      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({
        name: "my-room",
        privacy: "private",
        properties: { exp: 1999999999, max_participants: 30 },
      });
    });

    it("omits max_participants entirely when not provided", async () => {
      process.env.DAILY_API_KEY = "fake-key";
      mockFetch.mockResolvedValue(jsonResponse({ name: "abc123", url: "https://kalpla.daily.co/abc123" }));

      await createDailyRoom({ name: "my-room", expiresAt: 1999999999 });

      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.properties).not.toHaveProperty("max_participants");
    });

    it("throws when the Daily API responds with a non-ok status", async () => {
      process.env.DAILY_API_KEY = "fake-key";
      mockFetch.mockResolvedValue(jsonResponse({ error: "bad request" }, false, 400));

      await expect(createDailyRoom({ expiresAt: 123 })).rejects.toThrow(/Daily API request to \/rooms failed \(400\)/);
    });
  });

  describe("createDailyMeetingToken", () => {
    it("POSTs the correct meeting-token properties and returns the token string", async () => {
      process.env.DAILY_API_KEY = "fake-key";
      mockFetch.mockResolvedValue(jsonResponse({ token: "signed-jwt-token" }));

      const token = await createDailyMeetingToken({
        roomName: "abc123",
        userId: "usr-1",
        userName: "Ada Lovelace",
        isOwner: true,
        expiresAt: 1999999999,
      });

      expect(token).toBe("signed-jwt-token");
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({
        properties: {
          room_name: "abc123",
          user_id: "usr-1",
          user_name: "Ada Lovelace",
          is_owner: true,
          exp: 1999999999,
        },
      });
    });

    it("sets is_owner: false for a non-owner (student) token", async () => {
      process.env.DAILY_API_KEY = "fake-key";
      mockFetch.mockResolvedValue(jsonResponse({ token: "student-token" }));

      await createDailyMeetingToken({
        roomName: "abc123",
        userId: "usr-2",
        userName: "Student",
        isOwner: false,
        expiresAt: 1999999999,
      });

      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.properties.is_owner).toBe(false);
    });

    it("throws when the Daily API responds with a non-ok status", async () => {
      process.env.DAILY_API_KEY = "fake-key";
      mockFetch.mockResolvedValue(jsonResponse({ error: "room not found" }, false, 404));

      await expect(
        createDailyMeetingToken({ roomName: "nope", userId: "u", userName: "U", isOwner: false, expiresAt: 1 }),
      ).rejects.toThrow(/Daily API request to \/meeting-tokens failed \(404\)/);
    });
  });
});
