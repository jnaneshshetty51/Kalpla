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

// Real free-tier seeded project ("Agent Tool Router") with real test cases.
const PROJECT_ID = "c0000000-0000-4000-a000-000000000002";

// A genuinely correct solution to the seeded project's route_action
// requirements — verified by hand against all 4 real test cases, so this
// exercises actual Pyodide WASM execution producing a real correct result,
// not a canned mock.
const CORRECT_SOLUTION = `def route_action(thought):
    t = thought.lower()
    if any(kw in t for kw in ["look up", "search", "find out", "current"]):
        return "search"
    if "calculate" in t or "compute" in t or any(op in thought for op in ["+", "-", "*", "/"]):
        return "calculate"
    return "answer"
`;

test.describe("Coding Workspace E2E — real Pyodide WASM execution in a real browser", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  let testUserId: string | undefined;

  test.beforeEach(async ({ page }) => {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase env vars — copy .env.example to .env.local before running e2e tests.");
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const email = `e2e-workspace-${test.info().testId}-${Date.now()}@example.com`;
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
    await admin.from("submissions").delete().eq("user_id", testUserId);
    await admin.auth.admin.deleteUser(testUserId);
    testUserId = undefined;
  });

  async function replaceEditorContent(page: import("@playwright/test").Page, code: string) {
    // Keyboard-simulated insertText fights with Monaco's own auto-indent
    // (it adds indentation after a ":"-terminated line on top of the
    // indentation already present in a pre-formatted multi-line string,
    // producing a real IndentationError — confirmed by hand while writing
    // this test). Setting the model value directly through Monaco's own
    // editor API sidesteps auto-indent entirely and still fires the same
    // onDidChangeModelContent event @monaco-editor/react's onChange relies
    // on, so React state updates correctly.
    await page.waitForFunction(() => (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length);
    await page.evaluate((newCode) => {
      const monaco = (window as unknown as { monaco: { editor: { getEditors: () => Array<{ setValue: (v: string) => void }> } } }).monaco;
      monaco.editor.getEditors()[0].setValue(newCode);
    }, code);
  }

  test("writing a correct solution and clicking Run Tests genuinely executes Python via WASM and reports all 4 real test cases passing", async ({ page }) => {
    await page.goto(`/workspace/${PROJECT_ID}`);
    await expect(page.locator(".monaco-editor")).toBeVisible({ timeout: 15_000 });

    await replaceEditorContent(page, CORRECT_SOLUTION);

    await page.click("button:has-text('Run Tests')");

    // First-time Pyodide WASM initialization can genuinely take a while.
    await expect(page.locator("text=4 / 4 Passed")).toBeVisible({ timeout: 60_000 });
  });

  test("a partially-wrong solution reports exactly the right per-case pass count, proving real per-case evaluation rather than a pass/fail coin flip", async ({ page }) => {
    await page.goto(`/workspace/${PROJECT_ID}`);
    await expect(page.locator(".monaco-editor")).toBeVisible({ timeout: 15_000 });

    // Always returns "search" — hand-verified against the 4 real seeded
    // test cases: matches cases 1 and 4 (both genuinely expect "search"),
    // misses case 2 (expects "calculate") and case 3 (expects "answer").
    // Exactly 2/4 should pass — anything else means the harness isn't
    // really evaluating each case independently.
    await replaceEditorContent(page, `def route_action(thought):\n    return "search"\n`);

    await page.click("button:has-text('Run Tests')");
    await expect(page.locator("text=2 / 4 Passed")).toBeVisible({ timeout: 60_000 });
  });

  test("Run Code executes real Python and shows real stdout in the output console, distinct from Run Tests", async ({ page }) => {
    await page.goto(`/workspace/${PROJECT_ID}`);
    await expect(page.locator(".monaco-editor")).toBeVisible({ timeout: 15_000 });

    await replaceEditorContent(page, `print("hello from a real Pyodide interpreter")\n`);
    await page.click("button:has-text('Run Code')");

    await expect(page.locator("text=hello from a real Pyodide interpreter")).toBeVisible({ timeout: 60_000 });
  });

  test("submitting a project opens the reflection modal, requires real text, and creates a real submissions row", async ({ page }) => {
    await page.goto(`/workspace/${PROJECT_ID}`);
    await expect(page.locator(".monaco-editor")).toBeVisible({ timeout: 15_000 });

    await replaceEditorContent(page, CORRECT_SOLUTION);
    await page.click("button:has-text('Submit Project')");

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Confirm button is disabled with no reflection text yet.
    const confirmBtn = page.locator("button:has-text('Confirm Project Submission')");
    await expect(confirmBtn).toBeDisabled();

    await page.fill("#submission-reflection", "I mapped each requirement to a keyword-membership check, in priority order: search cues first, then arithmetic cues, defaulting to answer.");
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Real submission round-trip — modal closes and the header reflects it.
    await expect(page.locator("text=Submitted")).toBeVisible({ timeout: 15_000 });

    const admin = createClient(supabaseUrl!, supabaseServiceRoleKey!);
    const { data: submission } = await admin
      .from("submissions")
      .select("id, code, reflection, status")
      .eq("user_id", testUserId!)
      .eq("project_id", PROJECT_ID)
      .maybeSingle();

    expect(submission).not.toBeNull();
    expect(submission!.code).toContain("route_action");
    expect(submission!.reflection).toContain("keyword-membership");
  });
});
