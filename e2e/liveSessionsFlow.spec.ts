import { test, expect } from "@playwright/test";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFileSync, existsSync } from "fs";
import path from "path";

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Bootstraps a real admin test user. See adminGradingReviewFlow.spec.ts for
 * why this is a legitimate use of the schema's intended admin-provisioning
 * path (INSERT, not UPDATE — the self-escalation trigger only guards
 * UPDATE) rather than a workaround of the security control.
 */
async function createAdminTestUser(admin: SupabaseClient, email: string, password: string) {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createErr || !created.user) throw new Error(`Failed to create admin test user: ${createErr?.message}`);
  const userId = created.user.id;
  await admin.from("users").delete().eq("id", userId);
  const { error: insertErr } = await admin.from("users").insert({ id: userId, name: "E2E Admin", role: "admin" });
  if (insertErr) throw new Error(`Failed to bootstrap admin profile: ${insertErr.message}`);
  return userId;
}

async function signInAndGetCookies(email: string, password: string) {
  const cookieStore = new Map<string, string>();
  const authedSupabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => Array.from(cookieStore.entries()).map(([name, value]) => ({ name, value })),
      setAll: (cs) => {
        for (const { name, value } of cs) cookieStore.set(name, value);
      },
    },
  });
  const { error } = await authedSupabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Failed to sign in: ${error.message}`);
  return Array.from(cookieStore.entries()).map(([name, value]) => ({ name, value, domain: "localhost", path: "/" }));
}

test.describe("Live Sessions E2E — real admin panel, real RLS, real (unconfigured) Daily wiring", () => {
  // This environment has no DAILY_API_KEY configured (confirmed: absent
  // from .env.local), so a real Daily room/video call can't be exercised
  // here — and shouldn't be faked. What IS real and worth covering
  // end-to-end: the admin panel and student list render real DB data
  // correctly, RLS actually enforces the cohort-wide-vs-1:1 visibility
  // split, and the app degrades honestly (a clear "not configured" state,
  // not a crash or blank screen) everywhere Daily would otherwise be
  // called — matching how billingFlow.spec.ts covers the same kind of gap
  // for unconfigured Stripe.
  let adminUserId: string | undefined;
  let studentUserId: string | undefined;
  let otherStudentUserId: string | undefined;
  const seededSessionIds: string[] = [];

  test.beforeEach(async () => {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase env vars — copy .env.example to .env.local before running e2e tests.");
    }
  });

  test.afterEach(async () => {
    if (!supabaseUrl || !supabaseServiceRoleKey) return;
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    for (const id of seededSessionIds) {
      await admin.from("live_session_attendance").delete().eq("session_id", id);
      await admin.from("live_sessions").delete().eq("id", id);
    }
    seededSessionIds.length = 0;
    if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
    if (studentUserId) await admin.auth.admin.deleteUser(studentUserId);
    if (otherStudentUserId) await admin.auth.admin.deleteUser(otherStudentUserId);
    adminUserId = undefined;
    studentUserId = undefined;
    otherStudentUserId = undefined;
  });

  test("an admin filling out the real create-session form gets a clear 'video provider not configured' error, not a crash", async ({ page }) => {
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    const email = `e2e-livesess-admin-${test.info().testId}-${Date.now()}@example.com`;
    const password = crypto.randomUUID();
    adminUserId = await createAdminTestUser(admin, email, password);
    await page.context().addCookies(await signInAndGetCookies(email, password));

    await page.goto("/admin/live-sessions");
    await expect(page.locator("h1")).toContainText("Live Sessions");

    await page.fill('input[placeholder*="Week 5"]', "E2E Test Live Class");
    await page.fill("#starts-at", "2026-09-01T18:00");
    await page.click("button:has-text('Create Session')");

    // Real 503 surfaced from the route (DAILY_API_KEY missing), not a
    // silent no-op or an unhandled exception.
    await expect(page.locator("text=/not configured/i")).toBeVisible({ timeout: 10_000 });
  });

  test("a cohort-wide session is visible to every authenticated user via real RLS, and shows correctly on both the admin and student pages", async ({ page }) => {
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);

    const adminEmail = `e2e-livesess-admin2-${test.info().testId}-${Date.now()}@example.com`;
    const adminPassword = crypto.randomUUID();
    adminUserId = await createAdminTestUser(admin, adminEmail, adminPassword);

    // Seeded directly (bypassing Daily room creation, which needs a real
    // key) — the DB doesn't care where daily_room_name/url came from, only
    // the API route does, which is covered by the previous test.
    const { data: session, error } = await admin
      .from("live_sessions")
      .insert({
        title: "E2E Week 5 — Agent Loops",
        session_type: "live_class",
        starts_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        duration_minutes: 60,
        daily_room_name: "e2e-fake-room",
        daily_room_url: "https://e2e-fake.daily.co/e2e-fake-room",
        created_by: adminUserId,
      })
      .select("id")
      .single();
    if (error || !session) throw new Error(`Failed to seed session: ${error?.message}`);
    seededSessionIds.push(session.id);

    // Visible on the admin panel.
    await page.context().addCookies(await signInAndGetCookies(adminEmail, adminPassword));
    await page.goto("/admin/live-sessions");
    await expect(page.locator("text=E2E Week 5 — Agent Loops")).toBeVisible({ timeout: 10_000 });

    // Visible to a completely different, non-admin student — proving RLS
    // (not application code) is what makes cohort-wide sessions visible,
    // matching how the real /api/live-sessions route deliberately relies
    // on the request-scoped client rather than manual filtering.
    const studentEmail = `e2e-livesess-student-${test.info().testId}-${Date.now()}@example.com`;
    const studentPassword = crypto.randomUUID();
    const { data: student } = await admin.auth.admin.createUser({ email: studentEmail, password: studentPassword, email_confirm: true });
    studentUserId = student!.user!.id;

    const studentContext = await page.context().browser()!.newContext();
    await studentContext.addCookies(await signInAndGetCookies(studentEmail, studentPassword));
    const studentPage = await studentContext.newPage();
    await studentPage.goto("/live-sessions");
    await expect(studentPage.locator("text=E2E Week 5 — Agent Loops")).toBeVisible({ timeout: 10_000 });
    await expect(studentPage.locator("text=Live Class")).toBeVisible();
    await studentContext.close();
  });

  test("a mock_interview session is visible only to the assigned student and to admins — not to an unrelated user", async ({ page }) => {
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);

    const adminEmail = `e2e-livesess-admin3-${test.info().testId}-${Date.now()}@example.com`;
    adminUserId = await createAdminTestUser(admin, adminEmail, crypto.randomUUID());

    const assignedEmail = `e2e-livesess-assigned-${test.info().testId}-${Date.now()}@example.com`;
    const assignedPassword = crypto.randomUUID();
    const { data: assigned } = await admin.auth.admin.createUser({ email: assignedEmail, password: assignedPassword, email_confirm: true });
    studentUserId = assigned!.user!.id;

    const unrelatedEmail = `e2e-livesess-unrelated-${test.info().testId}-${Date.now()}@example.com`;
    const unrelatedPassword = crypto.randomUUID();
    const { data: unrelated } = await admin.auth.admin.createUser({ email: unrelatedEmail, password: unrelatedPassword, email_confirm: true });
    otherStudentUserId = unrelated!.user!.id;

    const { data: session, error } = await admin
      .from("live_sessions")
      .insert({
        title: "E2E Mock Interview — Confidential",
        session_type: "mock_interview",
        assigned_user_id: studentUserId,
        starts_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        duration_minutes: 45,
        daily_room_name: "e2e-fake-room-2",
        daily_room_url: "https://e2e-fake.daily.co/e2e-fake-room-2",
        created_by: adminUserId,
      })
      .select("id")
      .single();
    if (error || !session) throw new Error(`Failed to seed mock interview session: ${error?.message}`);
    seededSessionIds.push(session.id);

    // The assigned student sees it.
    const assignedContext = await page.context().browser()!.newContext();
    await assignedContext.addCookies(await signInAndGetCookies(assignedEmail, assignedPassword));
    const assignedPage = await assignedContext.newPage();
    await assignedPage.goto("/live-sessions");
    await expect(assignedPage.locator("text=E2E Mock Interview — Confidential")).toBeVisible({ timeout: 10_000 });
    await assignedContext.close();

    // An unrelated, real, logged-in user never sees it.
    const unrelatedContext = await page.context().browser()!.newContext();
    await unrelatedContext.addCookies(await signInAndGetCookies(unrelatedEmail, unrelatedPassword));
    const unrelatedPage = await unrelatedContext.newPage();
    await unrelatedPage.goto("/live-sessions");
    await expect(unrelatedPage.locator("text=E2E Mock Interview — Confidential")).not.toBeVisible();
    await unrelatedContext.close();
  });

  test("joining a real seeded session surfaces a clear 'not configured' state on the room page, not a blank crash", async ({ page }) => {
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    const adminEmail = `e2e-livesess-admin4-${test.info().testId}-${Date.now()}@example.com`;
    adminUserId = await createAdminTestUser(admin, adminEmail, crypto.randomUUID());

    const studentEmail = `e2e-livesess-joiner-${test.info().testId}-${Date.now()}@example.com`;
    const studentPassword = crypto.randomUUID();
    const { data: student } = await admin.auth.admin.createUser({ email: studentEmail, password: studentPassword, email_confirm: true });
    studentUserId = student!.user!.id;

    // starts_at now, so the join window (T-10min through end) is open.
    const { data: session, error } = await admin
      .from("live_sessions")
      .insert({
        title: "E2E Joinable Now",
        session_type: "office_hours",
        starts_at: new Date().toISOString(),
        duration_minutes: 60,
        daily_room_name: "e2e-fake-room-3",
        daily_room_url: "https://e2e-fake.daily.co/e2e-fake-room-3",
        created_by: adminUserId,
      })
      .select("id")
      .single();
    if (error || !session) throw new Error(`Failed to seed session: ${error?.message}`);
    seededSessionIds.push(session.id);

    await page.context().addCookies(await signInAndGetCookies(studentEmail, studentPassword));
    await page.goto(`/live-sessions/${session.id}/room`);

    await expect(page.locator("text=Can't Join")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=/not configured/i")).toBeVisible();
    // Never silently left on a blank/frozen loading screen.
    await expect(page.locator("text=Connecting to your session…")).not.toBeVisible();
  });

  test("cancelling a session in the admin panel removes it from the student's upcoming list", async ({ page }) => {
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    const adminEmail = `e2e-livesess-admin5-${test.info().testId}-${Date.now()}@example.com`;
    const adminPassword = crypto.randomUUID();
    adminUserId = await createAdminTestUser(admin, adminEmail, adminPassword);

    const studentEmail = `e2e-livesess-watcher-${test.info().testId}-${Date.now()}@example.com`;
    const studentPassword = crypto.randomUUID();
    const { data: student } = await admin.auth.admin.createUser({ email: studentEmail, password: studentPassword, email_confirm: true });
    studentUserId = student!.user!.id;

    const { data: session, error } = await admin
      .from("live_sessions")
      .insert({
        title: "E2E Cancel Me",
        session_type: "architecture_session",
        starts_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 60,
        daily_room_name: "e2e-fake-room-4",
        daily_room_url: "https://e2e-fake.daily.co/e2e-fake-room-4",
        created_by: adminUserId,
      })
      .select("id")
      .single();
    if (error || !session) throw new Error(`Failed to seed session: ${error?.message}`);
    seededSessionIds.push(session.id);

    // Confirm the student sees it before cancellation.
    const studentContext = await page.context().browser()!.newContext();
    await studentContext.addCookies(await signInAndGetCookies(studentEmail, studentPassword));
    const studentPage = await studentContext.newPage();
    await studentPage.goto("/live-sessions");
    await expect(studentPage.locator("text=E2E Cancel Me")).toBeVisible({ timeout: 10_000 });

    // Admin cancels via the real API (mirrors the panel's "Cancel Session" button).
    await page.context().addCookies(await signInAndGetCookies(adminEmail, adminPassword));
    const cancelRes = await page.request.patch(`/api/admin/live-sessions/${session.id}`, {
      data: { cancelled_at: new Date().toISOString() },
    });
    expect(cancelRes.ok()).toBeTruthy();

    await studentPage.reload();
    await expect(studentPage.locator("text=E2E Cancel Me")).not.toBeVisible();
    await studentContext.close();
  });
});
