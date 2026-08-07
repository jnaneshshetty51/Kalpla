import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DailyTask } from "@/lib/coach/generateDailyTasks";

// generateUnsubscribeToken is real/unmocked — pure HMAC (already covered by
// unsubscribeToken.test.ts), needs SUPABASE_SERVICE_ROLE_KEY set.

import { sendDailyCoachEmail } from "@/lib/email/sendDailyCoachEmail";

const TASKS: DailyTask[] = [
  { title: "Finish tokenization lesson", description: "Read through BPE section", estimated_minutes: 15, type: "roadmap" },
  { title: "Review flashcards", description: "Spaced repetition set", estimated_minutes: 5, type: "review" },
];

describe("lib/email/sendDailyCoachEmail.ts", () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-signing-secret-do-not-use-in-prod";
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalApiKey;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSecret;
    vi.unstubAllGlobals();
  });

  it("skips sending and returns false when RESEND_API_KEY is not configured (dev mode), without calling fetch", async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendDailyCoachEmail({
      userId: "usr-1",
      email: "student@example.com",
      userName: "Jane",
      tasks: TASKS,
      baseUrl: "https://kalpla.app",
    });

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("on success, posts to Resend with correctly formatted subject/from/to and both text+html bodies containing every task", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    fetchSpy.mockResolvedValue({ ok: true });

    const result = await sendDailyCoachEmail({
      userId: "usr-1",
      email: "student@example.com",
      userName: "Jane",
      tasks: TASKS,
      baseUrl: "https://kalpla.app",
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.headers.Authorization).toBe("Bearer test-resend-key");

    const payload = JSON.parse(options.body);
    expect(payload.to).toBe("student@example.com");
    expect(payload.subject).toBe("Your Kalpla tasks for today");
    expect(payload.text).toContain("Finish tokenization lesson");
    expect(payload.text).toContain("Review flashcards");
    expect(payload.html).toContain("Finish tokenization lesson");
    expect(payload.text).toContain("https://kalpla.app/dashboard");
  });

  it("builds a signed, user-scoped unsubscribe link into both the text and html bodies", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    fetchSpy.mockResolvedValue({ ok: true });

    await sendDailyCoachEmail({
      userId: "usr-42",
      email: "student@example.com",
      userName: "Jane",
      tasks: TASKS,
      baseUrl: "https://kalpla.app",
    });

    const payload = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(payload.text).toMatch(/https:\/\/kalpla\.app\/api\/email\/unsubscribe\?user_id=usr-42&token=[0-9a-f]+/);
    expect(payload.html).toContain("user_id=usr-42&token=");
  });

  it("returns false without throwing when Resend responds with a non-ok status", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    fetchSpy.mockResolvedValue({ ok: false, status: 422, text: () => Promise.resolve("Invalid `to` field") });

    const result = await sendDailyCoachEmail({
      userId: "usr-1",
      email: "bad-email",
      userName: "Jane",
      tasks: TASKS,
      baseUrl: "https://kalpla.app",
    });

    expect(result).toBe(false);
  });

  it("still returns false (not throw) even if reading the error body itself fails", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    fetchSpy.mockResolvedValue({ ok: false, status: 500, text: () => Promise.reject(new Error("body already read")) });

    const result = await sendDailyCoachEmail({
      userId: "usr-1",
      email: "student@example.com",
      userName: "Jane",
      tasks: TASKS,
      baseUrl: "https://kalpla.app",
    });

    expect(result).toBe(false);
  });
});
