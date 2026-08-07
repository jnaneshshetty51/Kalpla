import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockDueSessionsQuery = vi.fn();
const mockClaimUpdate = vi.fn();
const mockOptedInUsersQuery = vi.fn();
const mockProfileNameQuery = vi.fn();
const mockGetUserById = vi.fn();

const mockFrom = vi.fn((table: string) => {
  if (table === "live_sessions") {
    return {
      select: () => ({
        is: () => ({ is: () => ({ gte: () => ({ lte: () => mockDueSessionsQuery() }) }) }),
      }),
      update: (payload: unknown) => ({
        eq: () => ({ is: () => ({ select: () => ({ maybeSingle: () => mockClaimUpdate(payload) }) }) }),
      }),
    };
  }
  if (table === "users") {
    return {
      select: (cols: string) => {
        if (cols === "name") return { eq: () => ({ maybeSingle: () => mockProfileNameQuery() }) };
        return { eq: () => mockOptedInUsersQuery() };
      },
    };
  }
  throw new Error(`Unexpected table access in test: "${table}"`);
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => mockFrom(table),
    auth: { admin: { getUserById: (...args: unknown[]) => mockGetUserById(...args) } },
  }),
}));

const mockSendSessionReminderEmail = vi.fn();
vi.mock("@/lib/email/sendSessionReminderEmail", () => ({
  sendSessionReminderEmail: (...args: unknown[]) => mockSendSessionReminderEmail(...args),
}));

import { GET } from "@/app/api/cron/session-reminders/route";

function makeRequest(authHeader?: string) {
  return new Request("http://localhost/api/cron/session-reminders", {
    headers: authHeader ? { authorization: authHeader } : undefined,
  });
}

const LIVE_CLASS_SESSION = {
  id: "s1",
  title: "Week 5 — Agent Loops",
  session_type: "live_class",
  starts_at: "2026-09-01T18:15:00.000Z",
  assigned_user_id: null,
};

describe("app/api/cron/session-reminders/route.ts", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    mockDueSessionsQuery.mockResolvedValue({ data: [], error: null });
    mockClaimUpdate.mockResolvedValue({ data: { id: "s1" } });
    mockOptedInUsersQuery.mockResolvedValue({ data: [], error: null });
    mockProfileNameQuery.mockResolvedValue({ data: { name: "Student" } });
    mockGetUserById.mockResolvedValue({ data: { user: { email: "student@example.com" } } });
    mockSendSessionReminderEmail.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when CRON_SECRET is set but the auth header doesn't match", async () => {
    process.env.CRON_SECRET = "real-secret";
    const res = await GET(makeRequest("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(mockDueSessionsQuery).not.toHaveBeenCalled();
  });

  it("hard-fails with 500 when CRON_SECRET is unset in production", async () => {
    delete process.env.CRON_SECRET;
    vi.stubEnv("NODE_ENV", "production");
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect(mockDueSessionsQuery).not.toHaveBeenCalled();
  });

  it("runs unauthenticated outside production when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    vi.stubEnv("NODE_ENV", "test");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it("returns a zeroed summary when no sessions are due", async () => {
    process.env.CRON_SECRET = "real-secret";
    const res = await GET(makeRequest("Bearer real-secret"));
    const json = await res.json();
    expect(json).toEqual({ sessions_processed: 0, emailed: 0, failed: 0 });
  });

  it("emails every opted-in user for a cohort-wide session", async () => {
    process.env.CRON_SECRET = "real-secret";
    mockDueSessionsQuery.mockResolvedValue({ data: [LIVE_CLASS_SESSION], error: null });
    mockOptedInUsersQuery.mockResolvedValue({ data: [{ id: "usr-1" }, { id: "usr-2" }], error: null });

    const res = await GET(makeRequest("Bearer real-secret"));
    const json = await res.json();
    expect(json).toEqual({ sessions_processed: 1, emailed: 2, failed: 0 });
    expect(mockSendSessionReminderEmail).toHaveBeenCalledTimes(2);
  });

  it("emails only the assigned student for a mock_interview session, not a broadcast to all opted-in users", async () => {
    process.env.CRON_SECRET = "real-secret";
    mockDueSessionsQuery.mockResolvedValue({
      data: [{ ...LIVE_CLASS_SESSION, session_type: "mock_interview", assigned_user_id: "usr-assigned" }],
      error: null,
    });

    const res = await GET(makeRequest("Bearer real-secret"));
    const json = await res.json();
    expect(json.emailed).toBe(1);
    expect(mockOptedInUsersQuery).not.toHaveBeenCalled();
    expect(mockSendSessionReminderEmail).toHaveBeenCalledWith(expect.objectContaining({ userId: "usr-assigned" }));
  });

  it("skips a session that a concurrent invocation already claimed (idempotency)", async () => {
    process.env.CRON_SECRET = "real-secret";
    mockDueSessionsQuery.mockResolvedValue({ data: [LIVE_CLASS_SESSION], error: null });
    mockClaimUpdate.mockResolvedValue({ data: null }); // reminder_sent_at was already non-null — no row matched
    mockOptedInUsersQuery.mockResolvedValue({ data: [{ id: "usr-1" }], error: null });

    const res = await GET(makeRequest("Bearer real-secret"));
    const json = await res.json();
    expect(json).toEqual({ sessions_processed: 0, emailed: 0, failed: 0 });
    expect(mockSendSessionReminderEmail).not.toHaveBeenCalled();
  });

  it("counts a per-recipient email failure without aborting the rest of the batch", async () => {
    process.env.CRON_SECRET = "real-secret";
    mockDueSessionsQuery.mockResolvedValue({ data: [LIVE_CLASS_SESSION], error: null });
    mockOptedInUsersQuery.mockResolvedValue({ data: [{ id: "usr-1" }, { id: "usr-2" }], error: null });
    mockGetUserById
      .mockRejectedValueOnce(new Error("lookup failed"))
      .mockResolvedValueOnce({ data: { user: { email: "student2@example.com" } } });

    const res = await GET(makeRequest("Bearer real-secret"));
    const json = await res.json();
    expect(json).toEqual({ sessions_processed: 1, emailed: 1, failed: 1 });
  });
});
