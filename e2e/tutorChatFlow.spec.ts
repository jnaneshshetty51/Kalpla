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

// A real seeded skill node ("Model Families & Capabilities") — the tutor
// chat page needs a real skill_node_id, but the LLM call itself is stubbed
// at the app's own API boundary below rather than hitting a real model.
const SKILL_NODE_ID = "a0000000-0000-4000-a000-000000000103";

test.describe("AI Tutor Chat E2E — real streaming UI against a stubbed /api/tutor/chat", () => {
  let testUserId: string | undefined;

  test.beforeEach(async ({ page }) => {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase env vars — copy .env.example to .env.local before running e2e tests.");
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const email = `e2e-tutorchat-${test.info().testId}-${Date.now()}@example.com`;
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

    // Stub the tutor chat LLM call at the app's own API boundary — same
    // approach the assessment flow spec uses for /api/llm. The endpoint
    // streams plain text; a single-chunk fulfilled body still exercises
    // the frontend's real reader.read() loop and message-rendering path.
    await page.route("**/api/tutor/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        headers: { "X-Cache-Hit": "false" },
        body: "Tokenization breaks text into subword units using algorithms like Byte-Pair Encoding (BPE), which balances vocabulary size against sequence length.",
      });
    });
  });

  test.afterEach(async () => {
    if (!testUserId || !supabaseUrl || !supabaseServiceRoleKey) return;
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    await admin.from("tutor_conversations").delete().eq("user_id", testUserId);
    await admin.auth.admin.deleteUser(testUserId);
    testUserId = undefined;
  });

  test("sending a message renders the user's turn and the (stubbed) tutor's reply in the conversation log", async ({ page }) => {
    await page.goto(`/learn/${SKILL_NODE_ID}`);

    const chatInput = page.locator("#tutor-chat-input");
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    await chatInput.fill("What is tokenization?");
    await page.click("button:has-text('Send')");

    // The user's own message renders immediately.
    await expect(page.locator("text=What is tokenization?")).toBeVisible();

    // The stubbed tutor reply streams in and renders too.
    await expect(page.locator("text=Byte-Pair Encoding (BPE)")).toBeVisible({ timeout: 10_000 });

    // Input clears after a successful send, ready for the next turn.
    await expect(chatInput).toHaveValue("");
  });

  test("the conversation log is a real accessible live region, and the input has a real label (not just a placeholder)", async ({ page }) => {
    await page.goto(`/learn/${SKILL_NODE_ID}`);

    const chatInput = page.locator("#tutor-chat-input");
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    const logRegion = page.locator('[role="log"][aria-label="Conversation with AI tutor"]');
    await expect(logRegion).toBeAttached();

    const labelledInput = page.locator('label[for="tutor-chat-input"]');
    await expect(labelledInput).toBeAttached();
  });

  // Note: real persistence to tutor_conversations is NOT tested here —
  // page.route() intercepts the request inside the browser before it ever
  // reaches the real Next.js handler, so the server-side persistExchange
  // code never runs against a stubbed route. That real DB-write behavior
  // is already covered directly (mocked-Supabase, real function) in
  // __tests__/tutorConversation.test.ts.
});
