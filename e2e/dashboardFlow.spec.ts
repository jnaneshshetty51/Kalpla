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

test.describe("Authenticated Dashboard E2E Flow Test", () => {
  let testUserId: string | undefined;

  test.beforeEach(async ({ page }) => {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error(
        "Missing Supabase env vars — copy .env.example to .env.local before running e2e tests.",
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const email = `dashboard-e2e-${test.info().testId}-${Date.now()}@example.com`;
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

    // Stub /api/dashboard endpoint with seeded test payload
    await page.route("**/api/dashboard", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          dashboard: {
            overallScore: 84.5,
            readinessBadge: "Senior GenAI Architect",
            isAssessmentPending: false,
            streak: {
              current_streak_days: 5,
              total_active_days: 12,
              last_activity_at: "2026-08-05T12:00:00Z",
            },
            next_step: {
              skill_node_id: "node-rag-design",
              node_name: "RAG Pipeline Design",
              category: "Embeddings & Retrieval",
              status: "in_progress",
              estimated_days: 4,
              learning_objective: "Master vector indexing and retrieval optimization.",
              action_type: "continue_exercise",
              action_label: "Continue Exercise →",
              action_description: "Pick up where you left off in RAG Pipeline Design.",
              target_url: "/learn/node-rag-design",
            },
            recent_submissions: [
              {
                id: "sub-1",
                task_id: "node-prompt-eng",
                task_name: "Prompt Engineering Task",
                category: "Prompt Engineering",
                ai_score: 90,
                created_at: "2026-08-05T10:00:00Z",
              },
            ],
            categories: [
              {
                category: "LLM Fundamentals",
                averageScore: 88,
                nodes: [
                  {
                    id: "node-1",
                    name: "LLM Tokenization",
                    category: "LLM Fundamentals",
                    difficulty: 1,
                    score: 88,
                    status: "mastered",
                  },
                ],
              },
            ],
            nodeCounts: {
              mastered: 18,
              in_progress: 5,
              needs_focus: 3,
              total: 26,
            },
          },
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

  test("loads /dashboard and asserts readiness percentage, next-step target URL, and streak badge", async ({
    page,
  }) => {
    // Navigate to /dashboard
    await page.goto("/dashboard");

    // 1. Assert readiness percentage score gauge renders 84.5%
    await expect(page.locator("text=84.5%")).toBeVisible();

    // 2. Assert streak badge renders "5 Day Streak"
    await expect(page.locator("text=5 Day Streak (12 Active Days)")).toBeVisible();

    // 3. Assert next-step title and target URL
    await expect(page.locator("h2:has-text('RAG Pipeline Design')")).toBeVisible();
    const ctaLink = page.locator("a", { hasText: "Continue Exercise →" });
    await expect(ctaLink).toBeVisible();
    await expect(ctaLink).toHaveAttribute("href", "/learn/node-rag-design");
  });
});
