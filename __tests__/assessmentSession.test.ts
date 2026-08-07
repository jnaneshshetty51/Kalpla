import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

let selectResult: { data: unknown; error: { message: string } | null };
let upsertResult: { data: unknown; error: { message: string } | null };
let capturedUpsertPayload: Record<string, unknown> | null;
let capturedUpsertOptions: unknown;
let capturedEqArgs: [string, string] | null;

function defaultMockFromImpl(table: string) {
  if (table !== "assessment_sessions") {
    throw new Error(`Unexpected table in test: ${table}`);
  }
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((col: string, val: string) => {
    capturedEqArgs = [col, val];
    return chain;
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(selectResult));
  chain.upsert = vi.fn((payload: Record<string, unknown>, options: unknown) => {
    capturedUpsertPayload = payload;
    capturedUpsertOptions = options;
    return {
      select: () => ({
        single: () => Promise.resolve(upsertResult),
      }),
    };
  });
  return chain;
}

const mockFrom = vi.fn(defaultMockFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { GET, POST } from "@/app/api/assessment/session/route";

function postReq(body: unknown): Request;
function postReq(body: string, raw: true): Request;
function postReq(body: unknown, raw?: true): Request {
  return new Request("http://localhost/api/assessment/session", {
    method: "POST",
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

describe("app/api/assessment/session/route.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFromImpl);
    mockGetServerUser.mockResolvedValue({ user: { id: "user-1" }, profile: null });
    selectResult = { data: null, error: null };
    upsertResult = { data: null, error: null };
    capturedUpsertPayload = null;
    capturedUpsertOptions = null;
    capturedEqArgs = null;
  });

  describe("GET", () => {
    it("returns 401 when there is no authenticated user", async () => {
      mockGetServerUser.mockResolvedValue({ user: null, profile: null });

      const res = await GET();
      expect(res.status).toBe(401);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns the user's session row scoped by user_id", async () => {
      selectResult = {
        data: { user_id: "user-1", current_index: 3, answers: { "task-1": "A" }, completed: false, updated_at: "2026-08-01T00:00:00Z" },
        error: null,
      };

      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.session).toMatchObject({ current_index: 3, completed: false });
      expect(capturedEqArgs).toEqual(["user_id", "user-1"]);
    });

    it("returns { session: null } when the user has no saved session (no attempts yet)", async () => {
      selectResult = { data: null, error: null };

      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.session).toBeNull();
    });

    it("propagates a DB error as 500 with the error message, not a fake empty session", async () => {
      selectResult = { data: null, error: { message: "connection reset" } };

      const res = await GET();
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("connection reset");
    });

    it("propagates an unexpected thrown error as 500", async () => {
      mockFrom.mockImplementation(() => {
        throw new Error("boom");
      });

      const res = await GET();
      expect(res.status).toBe(500);
    });
  });

  describe("POST", () => {
    it("returns 401 when there is no authenticated user", async () => {
      mockGetServerUser.mockResolvedValue({ user: null, profile: null });

      const res = await POST(postReq({ current_index: 1 }));
      expect(res.status).toBe(401);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid JSON body", async () => {
      const res = await POST(postReq("not json", true));
      expect(res.status).toBe(400);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("upserts the real supplied current_index/answers/completed, scoped by user_id via onConflict", async () => {
      upsertResult = {
        data: { user_id: "user-1", current_index: 4, answers: { "task-1": "A" }, completed: false },
        error: null,
      };

      const res = await POST(
        postReq({ current_index: 4, answers: { "task-1": "A" }, completed: false }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.session).toMatchObject({ current_index: 4 });

      expect(capturedUpsertPayload).toMatchObject({
        user_id: "user-1",
        current_index: 4,
        answers: { "task-1": "A" },
        completed: false,
      });
      expect(capturedUpsertOptions).toEqual({ onConflict: "user_id" });
    });

    it("defaults current_index to 0, answers to {}, and completed to false when the body omits them", async () => {
      upsertResult = { data: { user_id: "user-1", current_index: 0, answers: {}, completed: false }, error: null };

      await POST(postReq({}));

      expect(capturedUpsertPayload).toMatchObject({
        user_id: "user-1",
        current_index: 0,
        answers: {},
        completed: false,
      });
    });

    it("ignores a non-numeric current_index and falls back to 0", async () => {
      upsertResult = { data: { user_id: "user-1" }, error: null };

      await POST(postReq({ current_index: "not-a-number" }));

      expect(capturedUpsertPayload!.current_index).toBe(0);
    });

    it("coerces a truthy non-boolean completed value to true", async () => {
      upsertResult = { data: { user_id: "user-1" }, error: null };

      await POST(postReq({ completed: "yes" }));

      expect(capturedUpsertPayload!.completed).toBe(true);
    });

    it("marks the session completed:true on the final task submission", async () => {
      upsertResult = {
        data: { user_id: "user-1", current_index: 8, answers: {}, completed: true },
        error: null,
      };

      const res = await POST(postReq({ current_index: 8, completed: true }));
      const json = await res.json();
      expect(json.session.completed).toBe(true);
    });

    it("propagates a DB upsert error as 500 with the error message", async () => {
      upsertResult = { data: null, error: { message: "unique constraint violation" } };

      const res = await POST(postReq({ current_index: 1 }));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("unique constraint violation");
    });

    it("propagates an unexpected thrown error as 500", async () => {
      mockFrom.mockImplementation(() => {
        throw new Error("boom");
      });

      const res = await POST(postReq({ current_index: 1 }));
      expect(res.status).toBe(500);
    });
  });
});
