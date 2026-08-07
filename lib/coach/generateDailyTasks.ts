import { createAdminClient } from "@/lib/supabase/admin";
import { getRecommendedNextStep } from "@/lib/roadmap/nextStep";
import { executeLLMCallWithCap } from "@/lib/llm/executeLLMCallWithCap";
import { resolveModelConfig } from "@/lib/llm/models";

export interface DailyTask {
  title: string;
  description: string;
  estimated_minutes: number;
  type: "onboarding" | "roadmap" | "review" | "re_engagement";
}

export interface DailyTasksResult {
  tasks: DailyTask[];
  user_state: "new" | "active" | "stalled";
}

const STALLED_THRESHOLD_DAYS = 5;

const TASKS_SYSTEM_PROMPT = `You are a supportive daily learning coach for a GenAI engineering platform. Given a student's current roadmap position and time budget, produce a short, specific task list for today.

Rules:
- 2-3 tasks maximum.
- Each task must be concrete and time-boxed (a student should know exactly what to do and how long it should take).
- Total estimated time should roughly fit within the student's daily time budget.
- Do NOT use generic filler like "keep learning" or "review your notes" — reference the actual skill/node/project named in the context.

Reply ONLY with a JSON array matching: [{"title": str, "description": str, "estimated_minutes": number}]. No markdown fences, no prose.`;

function parseTasksJson(raw: string): Array<{ title: string; description: string; estimated_minutes: number }> | null {
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    }
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Generates today's task list for one user (Prompt 77), covering three
 * distinct states rather than one generic path (Prompt 80):
 * - brand new, no roadmap yet -> an onboarding nudge, not an error
 * - active, mid-roadmap -> specific tasks derived from their real
 *   next-step (Prompt 34) and time budget, via a cheap-tier LLM call
 * - stalled (no activity in 5+ days) -> a re-engagement task, not a
 *   verbatim repeat of whatever the last suggestion happened to be
 */
export async function generateDailyTasks(userId: string): Promise<DailyTasksResult> {
  const adminSupabase = createAdminClient();

  const { data: profile } = await adminSupabase
    .from("users")
    .select("time_budget_minutes_per_day")
    .eq("id", userId)
    .maybeSingle();

  const timeBudgetMinutes = profile?.time_budget_minutes_per_day || 30;

  const { data: latestRoadmap } = await adminSupabase
    .from("roadmaps")
    .select("id")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRoadmap) {
    return {
      user_state: "new",
      tasks: [
        {
          title: "Complete your diagnostic assessment",
          description:
            "You haven't taken the baseline assessment yet — it's what generates your personalized roadmap and unlocks everything else on the platform.",
          estimated_minutes: Math.min(timeBudgetMinutes, 20),
          type: "onboarding",
        },
      ],
    };
  }

  const { data: recentAttempts } = await adminSupabase
    .from("assessment_attempts")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  const lastActivityAt = recentAttempts?.[0]?.created_at
    ? new Date(recentAttempts[0].created_at)
    : null;

  const daysSinceActivity = lastActivityAt
    ? (Date.now() - lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;

  const isStalled = daysSinceActivity >= STALLED_THRESHOLD_DAYS;

  const nextStep = await getRecommendedNextStep(userId);

  if (isStalled) {
    return {
      user_state: "stalled",
      tasks: [
        {
          title: `Ease back in: revisit ${nextStep.node_name}`,
          description: `It's been ${Math.floor(daysSinceActivity)} days since your last activity. Rather than picking up where a longer session left off, spend a short, low-friction block just re-reading ${nextStep.node_name} to rebuild momentum before diving back into exercises.`,
          estimated_minutes: Math.min(timeBudgetMinutes, 15),
          type: "re_engagement",
        },
      ],
    };
  }

  // Active, mid-roadmap: derive specific tasks from the real next-step and
  // time budget via a cheap-tier LLM call.
  const userPrompt = `Student's current next-step: "${nextStep.node_name}" (${nextStep.category}) — ${nextStep.action_description}
Student's daily time budget: ${timeBudgetMinutes} minutes.

Produce today's task list.`;

  const resolvedConfig = resolveModelConfig("cheap");

  // This runs unattended once a day for every user (Prompt 77) — a capped
  // user (or any other LLM failure) still needs *some* task delivered, so
  // this degrades to the deterministic next-step-grounded fallback below
  // rather than failing the whole daily job for that user.
  let parsed: ReturnType<typeof parseTasksJson> = null;
  try {
    const llmResponse = await executeLLMCallWithCap({
      userId,
      provider: resolvedConfig.provider,
      modelId: resolvedConfig.modelId,
      feature: "daily_coach_tasks",
      messages: [
        { role: "system", content: TASKS_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 400,
      temperature: 0.5,
    });
    parsed = parseTasksJson(llmResponse.content);
  } catch (err) {
    console.warn("[lib/coach/generateDailyTasks] LLM call failed or usage-capped; using deterministic fallback:", err);
  }

  const tasks: DailyTask[] = parsed
    ? parsed.map((t) => ({
        title: t.title,
        description: t.description,
        estimated_minutes: t.estimated_minutes,
        type: "roadmap" as const,
      }))
    : [
        // Deterministic fallback if the model output didn't parse — still
        // grounded in the real next-step, not a placeholder.
        {
          title: `Work on ${nextStep.node_name}`,
          description: nextStep.action_description,
          estimated_minutes: Math.min(timeBudgetMinutes, nextStep.estimated_days ? 30 : 20),
          type: "roadmap",
        },
      ];

  return { user_state: "active", tasks };
}
