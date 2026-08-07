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

test.describe("Admin User Lookup E2E — real admin, real search, real user detail drill-down", () => {
  // The admin user list/search is shared, unfiltered, real production data —
  // running in parallel risks an unrelated concurrent test's user briefly
  // affecting total counts. Serial keeps each test's search deterministic.
  test.describe.configure({ mode: "serial" });

  let adminUserId: string | undefined;
  let lookupTargetUserId: string | undefined;
  const uniqueName = `E2E Lookup Target ${Date.now()}`;

  test.beforeAll(async () => {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase env vars — copy .env.example to .env.local before running e2e tests.");
    }
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: target } = await admin.auth.admin.createUser({
      email: `e2e-lookup-target-${Date.now()}@example.com`,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    lookupTargetUserId = target!.user!.id;
    await admin.from("users").update({ name: uniqueName }).eq("id", lookupTargetUserId);
    await admin.from("competency_scores").insert({
      user_id: lookupTargetUserId,
      skill_node_id: "a0000000-0000-4000-a000-000000000101",
      score: 72,
    });
  });

  test.afterAll(async () => {
    if (!supabaseUrl || !supabaseServiceRoleKey || !lookupTargetUserId) return;
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    await admin.from("competency_scores").delete().eq("user_id", lookupTargetUserId);
    await admin.auth.admin.deleteUser(lookupTargetUserId);
  });

  test.beforeEach(async ({ page }) => {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase env vars — copy .env.example to .env.local before running e2e tests.");
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const email = `e2e-admin-lookup-${test.info().testId}-${Date.now()}@example.com`;
    const password = crypto.randomUUID();
    adminUserId = await createAdminTestUser(admin, email, password);

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
    if (!adminUserId || !supabaseUrl || !supabaseServiceRoleKey) return;
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    await admin.auth.admin.deleteUser(adminUserId);
    adminUserId = undefined;
  });

  test("searching by real name filters the real user list down to the matching user", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.locator("text=User Directory & Support Telemetry")).toBeVisible({ timeout: 10_000 });

    const searchInput = page.getByPlaceholder(/Search users by email or full name/i);
    await searchInput.fill(uniqueName);

    // Debounced search — wait for the real filtered result to land. Scoped
    // to the desktop <table> specifically: the mobile card-list view for
    // the same data also exists in the DOM (toggled by CSS breakpoint, not
    // conditional rendering), so a bare text= locator matches both regardless
    // of which is actually visible at this viewport.
    await expect(page.locator("table").locator(`text=${uniqueName}`)).toBeVisible({ timeout: 10_000 });
  });

  test("clicking a real user row opens their real detail panel with real competency scores", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.locator("text=User Directory & Support Telemetry")).toBeVisible({ timeout: 10_000 });

    const searchInput = page.getByPlaceholder(/Search users by email or full name/i);
    await searchInput.fill(uniqueName);
    await expect(page.locator("table").locator(`text=${uniqueName}`)).toBeVisible({ timeout: 10_000 });

    await page.locator("table").locator(`text=${uniqueName}`).click();

    // Real detail panel, real seeded competency score. Scoped to the exact
    // score row (div containing the real skill_node_id) rather than a bare
    // "72%" text match, which also matches the page's own readiness-gauge
    // display and the (CSS-hidden but DOM-present) mobile card duplicate.
    await expect(page.locator("text=Competency Score Vector")).toBeVisible({ timeout: 10_000 });
    const scoreRow = page.locator("div", { hasText: "a0000000-0000-4000-a000-000000000101" }).last();
    await expect(scoreRow).toBeVisible();
    await expect(scoreRow).toContainText("72%");
  });

  test("a non-admin never sees the user directory or any real user data", async ({ browser }) => {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) return;
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const nonAdminEmail = `e2e-nonadmin-lookup-${test.info().testId}-${Date.now()}@example.com`;
    const nonAdminPassword = crypto.randomUUID();
    const { data: regularUser } = await admin.auth.admin.createUser({
      email: nonAdminEmail,
      password: nonAdminPassword,
      email_confirm: true,
    });

    const cookieStore = new Map<string, string>();
    const authedSupabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
    await page.goto("/admin/users");

    await expect(page.locator("table").locator(`text=${uniqueName}`)).not.toBeVisible();
    await expect(page.locator("text=Competency Score Vector")).not.toBeVisible();

    await context.close();
    await admin.auth.admin.deleteUser(regularUser!.user!.id);
  });
});
