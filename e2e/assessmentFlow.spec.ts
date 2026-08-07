import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFileSync, existsSync } from "fs";
import path from "path";

// Playwright doesn't load .env.local the way Next.js does — parse it
// manually, same as this project's own verification scripts.
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

test.describe("Onboarding to Assessment Flow E2E Integration Test", () => {
  let testUserId: string | undefined;

  test.beforeEach(async ({ page }) => {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error(
        "Missing Supabase env vars — copy .env.example to .env.local before running e2e tests.",
      );
    }

    // Real auth session for a throwaway test user. /assessment is behind
    // proxy.ts's default-deny auth gate, so without this the test never
    // gets past a redirect to /login. Uses @supabase/ssr's own cookie
    // encoding (via an in-memory cookie store) rather than hand-rolling the
    // cookie format, then injects those cookies into the browser context —
    // same approach used throughout this project's manual verification.
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const email = `e2e-${test.info().testId}-${Date.now()}@example.com`;
    const password = crypto.randomUUID();
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
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
        getAll: () =>
          Array.from(cookieStore.entries()).map(([name, value]) => ({
            name,
            value,
          })),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet)
            cookieStore.set(name, value);
        },
      },
    });
    const { error: signInErr } = await authedSupabase.auth.signInWithPassword({
      email,
      password,
    });
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

    // Stub LLM Proxy calls to prevent real API access or cost
    await page.route("**/api/llm", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: JSON.stringify({
            score: 88,
            feedback: "Outstanding explanation of key principles.",
            criteriaBreakdown: [
              {
                criterion: "Accuracy",
                met: true,
                note: "Solid technical accuracy",
              },
            ],
            confidence: "high",
          }),
          model: "claude-haiku-4-5",
          usage: { promptTokens: 120, completionTokens: 45, totalTokens: 165 },
        }),
      });
    });

    // 2. Stub Assessment Tasks API
    await page.route("**/api/assessment/tasks", async (route) => {
      const mockTasks = Array.from({ length: 8 }).map((_, idx) => ({
        id: `task-00${idx + 1}`,
        skill_node_id: `node-00${idx + 1}`,
        type: idx % 2 === 0 ? "multiple_choice" : "short_answer",
        prompt: `Diagnostic Task ${idx + 1}: Demonstrate core competency in domain ${idx + 1}`,
        rubric: {
          options: ["Option A", "Option B", "Option C", "Option D"],
          correct_answer: "Option A",
        },
        category: [
          "LLM Fundamentals",
          "Prompt Engineering",
          "API Integration",
          "Embeddings & Retrieval",
          "Agentic Systems",
          "Evaluation",
          "Fine-Tuning Basics",
          "Deployment",
        ][idx],
        skill_node: {
          id: `node-00${idx + 1}`,
          name: `Skill Node ${idx + 1}`,
          category: "LLM Fundamentals",
          difficulty: 1,
        },
      }));

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tasks: mockTasks }),
      });
    });

    // 3. Stub Assessment Submit API
    await page.route("**/api/assessment/submit", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          attempt_id: "attempt-mock-123",
          ai_score: 85,
          ai_feedback: { summary: "Great answer demonstrating strong grasp." },
          confidence: 0.95,
          competency_score: 85,
        }),
      });
    });

    // 4. Stub Assessment Results API
    await page.route("**/api/assessment/results", async (route) => {
      const mockCategories = [
        "LLM Fundamentals",
        "Prompt Engineering",
        "API Integration",
        "Embeddings & Retrieval",
        "Agentic Systems",
        "Evaluation",
        "Fine-Tuning Basics",
        "Deployment",
      ].map((cat, catIdx) => ({
        category: cat,
        averageScore: 82.5,
        nodes: Array.from({ length: 3 }).map((_, nIdx) => ({
          id: `cat-${catIdx}-node-${nIdx}`,
          name: `${cat} Node ${nIdx + 1}`,
          category: cat,
          difficulty: nIdx + 1,
          score: 80 + nIdx * 5,
          status: "mastered",
        })),
      }));

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          overallScore: 83.5,
          aiSummary:
            "You have a strong grasp of prompting fundamentals and LLM architecture. Your personalized roadmap will start by advancing into vector retrieval systems.",
          categories: mockCategories,
        }),
      });
    });
  });

  test.afterEach(async () => {
    if (!testUserId || !supabaseUrl || !supabaseServiceRoleKey) return;
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    await admin.auth.admin.deleteUser(testUserId);
    testUserId = undefined;
  });

  test("walks through onboarding, completes all 8 assessment tasks, and verifies results breakdown", async ({
    page,
  }) => {
    // Navigate to /assessment task runner
    await page.goto("/assessment");

    // Verify the persistent progress strip (not an <h1> — it's a status
    // readout, not a page heading; the task prompt itself is the real
    // content heading for each step).
    await expect(page.locator("text=Task 1 of 8")).toBeVisible();

    // Complete all 8 assessment tasks sequentially
    for (let taskNum = 1; taskNum <= 8; taskNum++) {
      await expect(page.locator(`text=Task ${taskNum} of 8`)).toBeVisible();

      // Fill out answer or click option button
      const optionBtn = page.locator("button", { hasText: "Option A" });
      if (await optionBtn.isVisible()) {
        await optionBtn.click();
      } else {
        const textarea = page.locator("textarea");
        if (await textarea.isVisible()) {
          await textarea.fill(
            "This is a detailed candidate response explaining core concepts.",
          );
        }
      }

      if (taskNum < 8) {
        // Click Next Task ->
        await page.click("button:has-text('Next Task →')");
      } else {
        // Click Submit Assessment ✓
        await page.click("button:has-text('Submit Assessment ✓')");
      }
    }

    // Verify assessment completion summary screen
    await expect(page.locator("h2")).toContainText("Nice work");

    // Navigate to results page
    await page.click("a:has-text('See your results')");
    await page.waitForURL("**/assessment/results");

    // Verify results page contents
    await expect(page.locator("h1")).toContainText(
      "GenAI Engineering Telemetry Matrix",
    );

    // Verify overall score badge — ReadinessGauge always rounds for
    // display (83.5 -> 84), it never renders the raw decimal.
    await expect(page.locator("text=84%")).toBeVisible();

    // Verify AI diagnostic summary text renders
    await expect(
      page.locator("text=You have a strong grasp of prompting fundamentals"),
    ).toBeVisible();

    // Verify domain category titles render. Each mock category also seeds
    // per-node labels like "LLM Fundamentals Node 1", so a plain text
    // locator matches multiple elements (Playwright strict-mode violation)
    // — scope to the heading role to target just the category title.
    await expect(
      page.getByRole("heading", { name: "LLM Fundamentals" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Prompt Engineering" }),
    ).toBeVisible();

    // Verify conversion CTA button renders
    await expect(
      page.locator("a:has-text('Start Your Adaptive Roadmap →')").first(),
    ).toBeVisible();
  });
});
