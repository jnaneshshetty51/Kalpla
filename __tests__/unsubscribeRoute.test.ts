import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateUnsubscribeToken } from "@/lib/email/unsubscribeToken";

// verifyUnsubscribeToken is real/unmocked (pure HMAC check, already covered
// by unsubscribeToken.test.ts) — this route's own job is the param
// handling and DB update around it.

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => Promise.resolve(result));
  return chain;
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { GET } from "@/app/api/email/unsubscribe/route";

describe("app/api/email/unsubscribe/route.ts — unauthenticated one-click unsubscribe", () => {
  const originalSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-signing-secret-do-not-use-in-prod";
    mockFrom.mockReturnValue(makeChainable({ data: null, error: null }));
  });

  afterEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSecret;
  });

  function reqFor(userId: string | null, token: string | null) {
    const url = new URL("http://localhost/api/email/unsubscribe");
    if (userId) url.searchParams.set("user_id", userId);
    if (token) url.searchParams.set("token", token);
    return new Request(url);
  }

  it("400s when user_id is missing", async () => {
    const res = await GET(reqFor(null, "some-token"));
    expect(res.status).toBe(400);
  });

  it("400s when token is missing", async () => {
    const res = await GET(reqFor("usr-1", null));
    expect(res.status).toBe(400);
  });

  it("400s on a token that doesn't verify for the given user_id", async () => {
    const validTokenForOtherUser = generateUnsubscribeToken("usr-someone-else");
    const res = await GET(reqFor("usr-1", validTokenForOtherUser));
    expect(res.status).toBe(400);
  });

  it("on a valid token, flips email_notifications_enabled to false for that exact user and returns a 200 HTML confirmation", async () => {
    let updatePayload: unknown = null;
    let eqCalledWith: unknown = null;
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.update = vi.fn((payload: unknown) => {
        updatePayload = payload;
        return chain;
      });
      chain.eq = vi.fn((_col: string, val: unknown) => {
        eqCalledWith = val;
        return Promise.resolve({ data: null, error: null });
      });
      return chain;
    });

    const token = generateUnsubscribeToken("usr-1");
    const res = await GET(reqFor("usr-1", token));

    expect(res.status).toBe(200);
    expect(updatePayload).toEqual({ email_notifications_enabled: false });
    expect(eqCalledWith).toBe("usr-1");
    const body = await res.text();
    expect(body).toContain("unsubscribed");
  });

  it("returns 500 when the DB update fails", async () => {
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.update = vi.fn(() => chain);
      chain.eq = vi.fn(() => Promise.resolve({ data: null, error: { message: "db down" } }));
      return chain;
    });

    const token = generateUnsubscribeToken("usr-1");
    const res = await GET(reqFor("usr-1", token));
    expect(res.status).toBe(500);
  });
});
