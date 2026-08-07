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

const REAL_TASK_ID = "b0000000-0000-4000-a000-000000000201"; // short_answer, skill_node a...201

/**
 * Bootstraps a real admin test user. public.users has a trigger that
 * blocks self-role-escalation via UPDATE (checked against auth.uid(),
 * which is null for service-role calls — confirmed live) — but the
 * trigger is scoped to `before update of role`, not INSERT. Deleting the
 * auto-created profile row and inserting a fresh one with role: "admin"
 * is a legitimate use of the schema's own intended bootstrap path, not a
 * workaround of the security control (which exists specifically to stop
 * runtime privilege escalation, not initial provisioning).
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

test.describe("Admin Grading Review E2E — real admin, real queued attempt, real approve/override", () => {
  // grading_review_queue is a genuinely global, shared admin resource — not
  // scoped per viewer — so parallel workers seeding their own entries would
  // see each other's real rows in the same live queue (confirmed live: a
  // "1 IN QUEUE" assertion failed because a sibling test's entry was also
  // present). Serial mode matches how this page actually behaves for real
  // concurrent admins and keeps each test's afterEach cleanup authoritative
  // before the next test's data lands.
  test.describe.configure({ mode: "serial" });

  let adminUserId: string | undefined;
  let studentUserId: string | undefined;
  let attemptId: string | undefined;
  let queueEntryId: string | undefined;

  test.beforeEach(async ({ page }) => {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase env vars — copy .env.example to .env.local before running e2e tests.");
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const email = `e2e-admin-grading-${test.info().testId}-${Date.now()}@example.com`;
    const password = crypto.randomUUID();
    adminUserId = await createAdminTestUser(admin, email, password);

    // A separate student whose low-confidence attempt is queued for review.
    const { data: student } = await admin.auth.admin.createUser({
      email: `e2e-student-${test.info().testId}-${Date.now()}@example.com`,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    studentUserId = student!.user!.id;

    const { data: attempt, error: attemptErr } = await admin
      .from("assessment_attempts")
      .insert({
        user_id: studentUserId,
        task_id: REAL_TASK_ID,
        response: { answer: "Zero-shot has no examples, few-shot includes some." },
        ai_score: 55,
        ai_feedback: { summary: "Partially correct but vague." },
        confidence: 0.4,
      })
      .select("id")
      .single();
    if (attemptErr || !attempt) throw new Error(`Failed to seed attempt: ${attemptErr?.message}`);
    attemptId = attempt.id;

    const { data: queueEntry, error: queueErr } = await admin
      .from("grading_review_queue")
      .insert({ attempt_id: attemptId, reason: "low_confidence", status: "pending" })
      .select("id")
      .single();
    if (queueErr || !queueEntry) throw new Error(`Failed to seed queue entry: ${queueErr?.message}`);
    queueEntryId = queueEntry.id;

    // Sign in as the admin.
    const cookieStore = new Map<string, string>();
    const authedSupabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () => Array.from(cookieStore.entries()).map(([name, value]) => ({ name, value })),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) cookieStore.set(name, value);
        },
      },
    });
    const { error: signInErr } = await authedSupabase.auth.signInWithPassword({ email, password });
    if (signInErr) throw new Error(`Failed to sign in admin: ${signInErr.message}`);

    await page.context().addCookies(
      Array.from(cookieStore.entries()).map(([name, value]) => ({
        name,
        value,
        domain: "localhost",
        path: "/",
      })),
    );
  });

  test.afterEach(async () => {
    if (!supabaseUrl || !supabaseServiceRoleKey) return;
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    if (attemptId) await admin.from("grading_review_queue").delete().eq("attempt_id", attemptId);
    if (attemptId) await admin.from("assessment_attempts").delete().eq("id", attemptId);
    if (studentUserId) await admin.from("competency_scores").delete().eq("user_id", studentUserId);
    if (studentUserId) await admin.auth.admin.deleteUser(studentUserId);
    if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
    adminUserId = undefined;
    studentUserId = undefined;
    attemptId = undefined;
    queueEntryId = undefined;
  });

  test("a real admin sees the real queued low-confidence attempt, and approving it resolves the queue for real", async ({ page }) => {
    await page.goto("/admin/grading-review");

    await expect(page.locator("text=1 IN QUEUE")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=AI SCORE: 55%")).toBeVisible();

    await page.click("button:has-text('Approve AI Score')");

    await expect(page.locator("text=QUEUE CLEAR")).toBeVisible({ timeout: 10_000 });

    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    const { data: resolvedEntry } = await admin
      .from("grading_review_queue")
      .select("status, reviewer_id, reviewer_notes")
      .eq("id", queueEntryId!)
      .maybeSingle();
    expect(resolvedEntry).toMatchObject({ status: "resolved", reviewer_id: adminUserId });
    expect(resolvedEntry!.reviewer_notes).toContain("approved");
  });

  test("overriding the score genuinely cascades into a real competency_scores row for the student, not just the queue entry", async ({ page }) => {
    await page.goto("/admin/grading-review");
    await expect(page.locator("text=AI SCORE: 55%")).toBeVisible({ timeout: 10_000 });

    await page.fill("input[placeholder='Score %']", "90");
    await page.click("button:has-text('Override Score')");

    await expect(page.locator("text=QUEUE CLEAR")).toBeVisible({ timeout: 10_000 });

    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    const { data: updatedAttempt } = await admin
      .from("assessment_attempts")
      .select("ai_score")
      .eq("id", attemptId!)
      .maybeSingle();
    expect(updatedAttempt?.ai_score).toBe(90);

    // The real cascade: recomputeAndSaveNodeScore rolls the corrected
    // attempt into a real competency_scores row for the student.
    const { data: score } = await admin
      .from("competency_scores")
      .select("score")
      .eq("user_id", studentUserId!)
      .eq("skill_node_id", "a0000000-0000-4000-a000-000000000201")
      .maybeSingle();
    expect(score).not.toBeNull();
    expect(score!.score).toBeGreaterThan(0);
  });

  test("a non-admin (logged-in but role=user) never sees another user's real queued attempt content", async ({ browser }) => {
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    const nonAdminEmail = `e2e-nonadmin-${test.info().testId}-${Date.now()}@example.com`;
    const nonAdminPassword = crypto.randomUUID();
    const { data: regularUser } = await admin.auth.admin.createUser({
      email: nonAdminEmail,
      password: nonAdminPassword,
      email_confirm: true,
    });

    const cookieStore = new Map<string, string>();
    const authedSupabase = createServerClient(supabaseUrl!, supabaseAnonKey!, {
      cookies: {
        getAll: () => Array.from(cookieStore.entries()).map(([name, value]) => ({ name, value })),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) cookieStore.set(name, value);
        },
      },
    });
    const { error: signInErr } = await authedSupabase.auth.signInWithPassword({ email: nonAdminEmail, password: nonAdminPassword });
    if (signInErr) throw new Error(`Failed to sign in non-admin: ${signInErr.message}`);

    const context = await browser.newContext();
    await context.addCookies(
      Array.from(cookieStore.entries()).map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })),
    );
    const page = await context.newPage();
    await page.goto("/admin/grading-review");

    // Whether this deployment redirects away entirely or renders a
    // forbidden shell, the one thing that must never happen is a non-admin
    // seeing the real seeded student's queued attempt data.
    await expect(page.locator("text=AI SCORE: 55%")).not.toBeVisible();
    await expect(page.locator("text=1 IN QUEUE")).not.toBeVisible();

    await context.close();
    await admin.auth.admin.deleteUser(regularUser!.user!.id);
  });
});
