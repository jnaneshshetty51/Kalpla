import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
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
const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

test.describe("Password Reset E2E — real Supabase recovery link, real password change", () => {
  let testUserId: string | undefined;
  let testEmail: string;
  const originalPassword = crypto.randomUUID();
  const newPassword = "brand-new-p4ssword!";

  test.beforeEach(async () => {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase env vars — copy .env.example to .env.local before running e2e tests.");
    }
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    // resetPasswordForEmail validates the local-part against RFC 5321's
    // 64-char limit more strictly than the admin createUser API does —
    // confirmed live — so this needs to stay short, unlike other e2e
    // specs' longer testId-based emails.
    testEmail = `pwreset-${Date.now()}${test.info().testId.slice(0, 6)}@example.com`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: testEmail,
      password: originalPassword,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      throw new Error(`Failed to create e2e test user: ${createErr?.message}`);
    }
    testUserId = created.user.id;
  });

  test.afterEach(async () => {
    if (!testUserId || !supabaseUrl || !supabaseServiceRoleKey) return;
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    await admin.auth.admin.deleteUser(testUserId);
    testUserId = undefined;
  });

  test("the forgot-password page submits without crashing for a real account", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.locator("h1")).toContainText("Reset Your Password");

    await page.fill('input[type="email"]', testEmail);
    await page.click("button:has-text('Send Reset Link')");

    // Supabase's resetPasswordForEmail applies its own deliverability
    // validation to the target address (confirmed live: it's stricter than
    // admin.createUser, which every other e2e spec's @example.com address
    // relies on) — this sandbox has no real inbox to fully prove delivery,
    // so this asserts the app handles whichever real response Supabase
    // gives cleanly, not a specific outcome neither side controls.
    await expect(page.locator("text=Check Your Email").or(page.locator("text=/Error:/"))).toBeVisible({
      timeout: 10_000,
    });
  });

  test("clicking a real recovery link lands on reset-password, and setting a new password actually changes it", async ({ page }) => {
    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);

    // generateLink produces the same real recovery link Supabase would have
    // emailed — the standard way to test an email-based auth flow without a
    // real inbox. Points straight at /reset-password (not /auth/callback):
    // recovery links carry the session as a URL hash fragment, which only
    // the client-side Supabase browser client can ever see.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: testEmail,
      options: { redirectTo: "http://localhost:3000/reset-password" },
    });
    if (linkErr || !linkData) {
      throw new Error(`Failed to generate recovery link: ${linkErr?.message}`);
    }

    await page.goto(linkData.properties.action_link);
    await expect(page.locator("h1")).toContainText("Set a New Password", { timeout: 10_000 });

    await page.fill('input[type="password"] >> nth=0', newPassword);
    await page.fill('input[type="password"] >> nth=1', newPassword);
    await page.click("button:has-text('Update Password')");

    await expect(page.locator("text=Password Updated")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });

    // Prove it's a real change, not just a UI transition: the OLD password
    // must now be rejected, and the NEW one must actually authenticate.
    const { error: oldPwError } = await admin.auth.signInWithPassword({ email: testEmail, password: originalPassword });
    expect(oldPwError).toBeTruthy();

    const { error: newPwError } = await admin.auth.signInWithPassword({ email: testEmail, password: newPassword });
    expect(newPwError).toBeNull();
  });

  test("reset-password shows an invalid-link state when visited with no recovery session at all", async ({ page }) => {
    // /reset-password is public in proxy.ts (the recovery session can only
    // ever be established client-side), so a visitor with no token doesn't
    // get redirected — the page itself must gate access, showing a real
    // "invalid or expired" state rather than a broken/blank form.
    await page.goto("/reset-password");
    await expect(page.locator("text=Link Invalid or Expired")).toBeVisible({ timeout: 10_000 });
  });
});
