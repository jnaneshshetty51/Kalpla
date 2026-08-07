import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
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

test.describe("Onboarding Form Completion E2E — real form, real DB write, real redirect", () => {
  let testUserId: string | undefined;

  test.beforeEach(async ({ page }) => {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase env vars — copy .env.example to .env.local before running e2e tests.");
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const email = `e2e-onboarding-${test.info().testId}-${Date.now()}@example.com`;
    const password = crypto.randomUUID();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      throw new Error(`Failed to create e2e test user: ${createErr?.message}`);
    }
    testUserId = created.user.id;

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
    if (signInErr) {
      throw new Error(`Failed to sign in e2e test user: ${signInErr.message}`);
    }

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
    if (!testUserId || !supabaseUrl || !supabaseServiceRoleKey) return;
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    await admin.auth.admin.deleteUser(testUserId);
    testUserId = undefined;
  });

  test("walks a fresh user through all 5 onboarding questions, submits, and the real answers land in the database", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.locator("text=Question 1 of 5")).toBeVisible();

    // Step 1: name (free text)
    await page.getByPlaceholder("e.g. Rahul Sharma").fill("E2E Test User");
    await page.click("button:has-text('Next Step →')");

    // Step 2: goal — click a suggested target rather than typing free text
    await expect(page.locator("text=Question 2 of 5")).toBeVisible();
    await page.click("button:has-text('Land a job as a GenAI Engineer')");
    await page.click("button:has-text('Next Step →')");

    // Step 3: experience_level (select card)
    await expect(page.locator("text=Question 3 of 5")).toBeVisible();
    await page.click("button:has-text('Foundational Practitioner')");
    await page.click("button:has-text('Next Step →')");

    // Step 4: time budget (select card)
    await expect(page.locator("text=Question 4 of 5")).toBeVisible();
    await page.click("button:has-text('30 minutes / day')");
    await page.click("button:has-text('Next Step →')");

    // Step 5: timeline (select card) — last step, different CTA
    await expect(page.locator("text=Question 5 of 5")).toBeVisible();
    await page.click("button:has-text('90 Days (Standard Horizon)')");
    await page.click("button:has-text('Launch My Diagnostic Assessment →')");

    // Hand-off screen shows before redirecting
    await expect(page.locator("text=Building Your Diagnostic Assessment")).toBeVisible();

    // Real redirect to /assessment once the API call completes
    await page.waitForURL("**/assessment", { timeout: 10_000 });

    // Verify the real answers were actually persisted, not just that the
    // UI navigated away optimistically.
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    const { data: profile } = await admin
      .from("users")
      .select("name, goal, experience_level, time_budget_minutes_per_day, timeline_days")
      .eq("id", testUserId!)
      .maybeSingle();

    expect(profile).toMatchObject({
      name: "E2E Test User",
      goal: "Land a job as a GenAI Engineer",
      experience_level: "beginner",
      time_budget_minutes_per_day: 30,
      timeline_days: 90,
    });
  });

  test("the Next Step button is disabled until an answer is given, and Previous returns to the prior question with the answer preserved", async ({ page }) => {
    await page.goto("/onboarding");

    await expect(page.locator("button:has-text('Next Step →')")).toBeDisabled();

    await page.getByPlaceholder("e.g. Rahul Sharma").fill("Preserved Name");
    await expect(page.locator("button:has-text('Next Step →')")).toBeEnabled();
    await page.click("button:has-text('Next Step →')");

    await expect(page.locator("text=Question 2 of 5")).toBeVisible();
    await page.click("button:has-text('← Previous')");

    await expect(page.locator("text=Question 1 of 5")).toBeVisible();
    await expect(page.getByPlaceholder("e.g. Rahul Sharma")).toHaveValue("Preserved Name");
  });
});
