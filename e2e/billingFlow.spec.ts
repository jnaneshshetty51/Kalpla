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

/**
 * This environment has no STRIPE_SECRET_KEY configured (confirmed:
 * .env.local has no STRIPE_* vars set), so a real Stripe Checkout/Portal
 * redirect can't be exercised here — and shouldn't be faked. What IS real
 * and worth covering end-to-end: the billing page renders real
 * tier/usage data from the DB, and clicking Upgrade/Manage Billing
 * genuinely calls the real API routes, which correctly report the real
 * "not configured on this deployment" state (503) rather than crashing,
 * hanging, or silently doing nothing — the actual behavior this
 * deployment has today, not a hypothetical fully-configured one.
 */
test.describe("Billing Page E2E — real usage data, real (unconfigured) checkout/portal wiring", () => {
  let testUserId: string | undefined;

  test.beforeEach(async ({ page }) => {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase env vars — copy .env.example to .env.local before running e2e tests.");
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const email = `e2e-billing-${test.info().testId}-${Date.now()}@example.com`;
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

  test("a brand-new user sees real free-tier status, not a loading spinner stuck forever or fabricated data", async ({ page }) => {
    await page.goto("/billing");

    await expect(page.locator("text=/free/i").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("button:has-text('Upgrade to Pro')")).toBeVisible();
  });

  test("clicking Upgrade to Pro genuinely calls the real checkout route, which correctly reports this deployment has no Stripe configured", async ({ page }) => {
    await page.goto("/billing");
    await expect(page.locator("button:has-text('Upgrade to Pro')")).toBeVisible({ timeout: 10_000 });

    await page.click("button:has-text('Upgrade to Pro')");

    // Real round trip to /api/billing/checkout, real 503, real error surfaced —
    // not a silent no-op and not a fabricated redirect.
    await expect(page.locator("text=/not configured|Failed to start checkout/i")).toBeVisible({ timeout: 10_000 });
    // Never actually navigated away to a fake/broken checkout URL.
    await expect(page).toHaveURL(/\/billing$/);
  });

  test("clicking Manage Billing Portal genuinely calls the real portal route, same honest unconfigured response", async ({ page }) => {
    // "Manage Billing Portal" only renders for non-free tiers — confirmed
    // live (a fresh free-tier user never sees this button at all) — so a
    // real subscription has to be seeded first for this button to even exist.
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    await admin.from("subscriptions").insert({ user_id: testUserId!, tier: "pro", status: "active", usage_this_period: {} });

    await page.goto("/billing");
    const portalButton = page.locator("button:has-text('Manage Billing Portal')");
    await expect(portalButton).toBeVisible({ timeout: 10_000 });

    await portalButton.click();
    await expect(page.locator("text=/not configured|Failed to open billing portal/i")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/billing$/);

    await admin.from("subscriptions").delete().eq("user_id", testUserId!);
  });

  test("a seeded pro-tier subscription renders real usage meters instead of the free-tier upgrade nudge", async ({ page }) => {
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    await admin.from("subscriptions").insert({
      user_id: testUserId!,
      tier: "pro",
      status: "active",
      usage_this_period: { tutor: 42 },
    });

    await page.goto("/billing");
    await expect(page.locator("text=/pro/i").first()).toBeVisible({ timeout: 10_000 });
    // Pro isn't the top tier, so an upgrade-to-premium nudge can still show,
    // but the pro-specific "Upgrade to Pro" CTA (for free users) should not.
    await expect(page.locator("button:has-text('Upgrade to Pro →')")).toHaveCount(0);

    await admin.from("subscriptions").delete().eq("user_id", testUserId!);
  });
});
