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

test.describe("Marketing site — Prompt 92", () => {
  test("an unauthenticated visitor's primary CTA routes into the signup flow, not a dead link", async ({ page }) => {
    await page.goto("/");

    // The redesigned landing page repeats the primary CTA in more than one
    // section (hero, pricing, and the final CTA section) — all must point
    // to signup, so assert on all matches, then drive the flow via the first.
    const ctas = page.locator("a", { hasText: "Apply Now" });
    await expect(ctas.first()).toBeVisible();
    const count = await ctas.count();
    for (let i = 0; i < count; i++) {
      await expect(ctas.nth(i)).toHaveAttribute("href", "/signup");
    }

    await ctas.first().click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("the /how-it-works and /pricing CTAs also route unauthenticated visitors to signup", async ({ page }) => {
    await page.goto("/how-it-works");
    const howItWorksCta = page.locator("a", { hasText: "Take the free skill assessment" }).first();
    await expect(howItWorksCta).toHaveAttribute("href", "/signup");

    await page.goto("/pricing");
    const pricingCta = page.locator("a", { hasText: "Take the free assessment" }).first();
    await expect(pricingCta).toHaveAttribute("href", "/signup");
  });

  test.describe("already-authenticated visitor", () => {
    let testUserId: string | undefined;

    test.beforeEach(async ({ page }) => {
      if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
        throw new Error("Missing Supabase env vars — copy .env.example to .env.local before running e2e tests.");
      }

      const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
      const email = `marketing-e2e-${test.info().testId}-${Date.now()}@example.com`;
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

    test("is offered a 'Go to dashboard' path on the landing page instead of being forced through signup again", async ({ page }) => {
      await page.goto("/");

      // Matched on href, not exact copy — AuthAwareCTA's signed-in label
      // text is presentational and free to change; what must hold is that
      // a signed-in visitor gets a real link to /dashboard and the signup
      // CTA is gone entirely, not both present.
      const dashboardCta = page.locator('a[href="/dashboard"]').first();
      await expect(dashboardCta).toBeVisible();
      await expect(page.locator("a", { hasText: "Apply Now" })).toHaveCount(0);
      await expect(page.locator('a[href="/signup"]')).toHaveCount(0);

      await dashboardCta.click();
      await expect(page).toHaveURL(/\/dashboard$/);
    });

    test("visiting /login or /signup directly redirects straight to /dashboard", async ({ page }) => {
      // proxy.ts's existing authenticated-user-on-auth-page redirect — this
      // test documents/locks in that an authenticated visitor is never
      // forced back through the signup form even by a direct URL visit.
      await page.goto("/signup");
      await expect(page).toHaveURL(/\/dashboard$/);

      await page.goto("/login");
      await expect(page).toHaveURL(/\/dashboard$/);
    });
  });
});
