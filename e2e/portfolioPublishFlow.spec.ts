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

test.describe("Portfolio Publish E2E — real slug claim, real DB flip, real public page render", () => {
  let testUserId: string | undefined;
  let claimedSlug: string | undefined;

  test.beforeEach(async ({ page }) => {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase env vars — copy .env.example to .env.local before running e2e tests.");
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const email = `e2e-portfolio-${test.info().testId}-${Date.now()}@example.com`;
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

    // The portfolio editor only offers something to publish once the user
    // has at least one PASSING submission for a real ladder ("capstone")
    // project — confirmed live: with zero submissions the page shows "No
    // Capstones Completed Yet" and there's nothing to check/publish. Seed
    // a real passing submission for "Prompt Playground" (ladder_position 1).
    const { error: subErr } = await admin.from("submissions").insert({
      user_id: testUserId,
      project_id: "d0000000-0000-4000-a000-000000000001",
      code: "print('capstone solution')",
      reflection: "Seeded for e2e portfolio publish testing.",
      status: "passed",
    });
    if (subErr) {
      throw new Error(`Failed to seed capstone submission: ${subErr.message}`);
    }
  });

  test.afterEach(async () => {
    if (!testUserId || !supabaseUrl || !supabaseServiceRoleKey) return;
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    await admin.from("portfolios").delete().eq("user_id", testUserId);
    await admin.from("submissions").delete().eq("user_id", testUserId);
    await admin.auth.admin.deleteUser(testUserId);
    testUserId = undefined;
    claimedSlug = undefined;
  });

  test("a fresh user gets an auto-created draft portfolio, and publishing with a custom slug makes the real public page live", async ({ page }) => {
    await page.goto("/portfolio");

    // Auto-created draft — starts unpublished.
    await expect(page.locator("text=UNPUBLISHED DRAFT")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Passing Project Case Studies (1)")).toBeVisible();

    await page.locator('input[type="checkbox"]').first().check();

    claimedSlug = `e2e-slug-${Date.now()}`;
    const slugField = page.locator('input[type="text"]').first();
    await slugField.fill(claimedSlug);

    await page.click("button:has-text('Publish Portfolio')");
    await expect(page.locator("text=LIVE PUBLIC PAGE ✓")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text=kalpla.app/portfolio/${claimedSlug}`)).toBeVisible();

    // Verify the real DB row actually flipped, not just optimistic UI state.
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    const { data: portfolioRow } = await admin
      .from("portfolios")
      .select("slug, is_public")
      .eq("user_id", testUserId!)
      .maybeSingle();
    expect(portfolioRow).toMatchObject({ slug: claimedSlug, is_public: true });

    // The real public page (no auth) actually renders for this slug.
    const publicContext = await page.context().browser()!.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`/portfolio/${claimedSlug}`);
    await expect(publicPage.locator("body")).not.toContainText("404");
    await expect(publicPage).toHaveURL(new RegExp(`/portfolio/${claimedSlug}$`));
    await publicContext.close();
  });

  test("unpublishing takes the real public page down again", async ({ page }) => {
    await page.goto("/portfolio");
    await expect(page.locator("text=UNPUBLISHED DRAFT")).toBeVisible({ timeout: 10_000 });

    await page.locator('input[type="checkbox"]').first().check();
    claimedSlug = `e2e-unpub-${Date.now()}`;
    await page.locator('input[type="text"]').first().fill(claimedSlug);
    await page.click("button:has-text('Publish Portfolio')");
    await expect(page.locator("text=LIVE PUBLIC PAGE ✓")).toBeVisible({ timeout: 10_000 });

    await page.click("button:has-text('Unpublish Page')");
    await expect(page.locator("text=UNPUBLISHED DRAFT")).toBeVisible({ timeout: 10_000 });

    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    const { data: portfolioRow } = await admin
      .from("portfolios")
      .select("is_public")
      .eq("user_id", testUserId!)
      .maybeSingle();
    expect(portfolioRow?.is_public).toBe(false);
  });

  test("attempting to claim a slug already taken by another user is rejected with a real error, not a silent failure", async ({ page }) => {
    // Seed a second user who already owns a slug.
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    const { data: otherUser } = await admin.auth.admin.createUser({
      email: `e2e-portfolio-taken-${Date.now()}@example.com`,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    const takenSlug = `e2e-taken-${Date.now()}`;
    await admin.from("portfolios").insert({ user_id: otherUser!.user!.id, slug: takenSlug, is_public: true, published_projects: [] });

    await page.goto("/portfolio");
    await expect(page.locator("text=UNPUBLISHED DRAFT")).toBeVisible({ timeout: 10_000 });

    await page.locator('input[type="checkbox"]').first().check();
    await page.locator('input[type="text"]').first().fill(takenSlug);
    await page.click("button:has-text('Publish Portfolio')");

    await expect(page.locator("text=/already taken/i")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=UNPUBLISHED DRAFT")).toBeVisible(); // still not published

    await admin.from("portfolios").delete().eq("user_id", otherUser!.user!.id);
    await admin.auth.admin.deleteUser(otherUser!.user!.id);
  });
});
