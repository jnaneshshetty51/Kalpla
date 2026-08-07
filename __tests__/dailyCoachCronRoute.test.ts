import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockUsersSelect = vi.fn();
const mockUpsert = vi.fn();
const mockGetUserById = vi.fn();

const mockFrom = vi.fn((table: string) => {
  if (table === "users") return { select: () => mockUsersSelect() };
  if (table === "daily_coach_logs") return { upsert: (...args: unknown[]) => mockUpsert(...args) };
  throw new Error(`Unexpected table access in cron test: "${table}"`);
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => mockFrom(table),
    auth: { admin: { getUserById: (...args: unknown[]) => mockGetUserById(...args) } },
  }),
}));

const mockGenerateDailyTasks = vi.fn();
vi.mock("@/lib/coach/generateDailyTasks", () => ({
  generateDailyTasks: (userId: string) => mockGenerateDailyTasks(userId),
}));

const mockSendDailyCoachEmail = vi.fn();
vi.mock("@/lib/email/sendDailyCoachEmail", () => ({
  sendDailyCoachEmail: (...args: unknown[]) => mockSendDailyCoachEmail(...args),
}));

import { GET } from "@/app/api/cron/daily-coach/route";

function makeRequest(authHeader?: string) {
  return new Request("http://localhost/api/cron/daily-coach", {
    headers: authHeader ? { authorization: authHeader } : undefined,
  });
}

describe("app/api/cron/daily-coach/route.ts — CRON_SECRET auth gate + per-user generate/email counters", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    mockUsersSelect.mockResolvedValue({ data: [], error: null });
    mockUpsert.mockResolvedValue({ data: null, error: null });
    mockGenerateDailyTasks.mockResolvedValue({ tasks: [], user_state: {} });
    mockSendDailyCoachEmail.mockResolvedValue(true);
    mockGetUserById.mockResolvedValue({ data: { user: { email: "student@example.com" } } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when CRON_SECRET is set but the request's auth header doesn't match", async () => {
    process.env.CRON_SECRET = "real-secret";
    const res = await GET(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
    expect(mockUsersSelect).not.toHaveBeenCalled();
  });

  it("proceeds when CRON_SECRET is set and the auth header matches", async () => {
    process.env.CRON_SECRET = "real-secret";
    const res = await GET(makeRequest("Bearer real-secret"));
    expect(res.status).toBe(200);
  });

  it("hard-fails with 500 when CRON_SECRET is unset in production, rather than running unauthenticated", async () => {
    delete process.env.CRON_SECRET;
    vi.stubEnv("NODE_ENV", "production");
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect(mockUsersSelect).not.toHaveBeenCalled();
  });

  it("runs unauthenticated (dev-only fallback) when CRON_SECRET is unset outside production", async () => {
    delete process.env.CRON_SECRET;
    vi.stubEnv("NODE_ENV", "test");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it("returns 500 when the users query itself errors", async () => {
    process.env.CRON_SECRET = "real-secret";
    mockUsersSelect.mockResolvedValue({ data: null, error: { message: "db down" } });

    const res = await GET(makeRequest("Bearer real-secret"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("db down");
  });

  it("generates tasks for every user and emails only those opted into notifications", async () => {
    process.env.CRON_SECRET = "real-secret";
    mockUsersSelect.mockResolvedValue({
      data: [
        { id: "u1", name: "Opted In", email_notifications_enabled: true },
        { id: "u2", name: "Opted Out", email_notifications_enabled: false },
      ],
      error: null,
    });

    const res = await GET(makeRequest("Bearer real-secret"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(mockGenerateDailyTasks).toHaveBeenCalledWith("u1");
    expect(mockGenerateDailyTasks).toHaveBeenCalledWith("u2");
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockSendDailyCoachEmail).toHaveBeenCalledTimes(1); // only the opted-in user
    expect(json).toMatchObject({ users_processed: 2, generated: 2, emailed: 1, failed: 0 });
  });

  it("counts a per-user failure without aborting the rest of the batch", async () => {
    process.env.CRON_SECRET = "real-secret";
    mockUsersSelect.mockResolvedValue({
      data: [
        { id: "u1", name: "Will Fail", email_notifications_enabled: false },
        { id: "u2", name: "Will Succeed", email_notifications_enabled: false },
      ],
      error: null,
    });
    mockGenerateDailyTasks
      .mockRejectedValueOnce(new Error("roadmap missing"))
      .mockResolvedValueOnce({ tasks: [], user_state: {} });

    const res = await GET(makeRequest("Bearer real-secret"));
    const json = await res.json();
    expect(json).toMatchObject({ users_processed: 2, generated: 1, failed: 1 });
  });
});
