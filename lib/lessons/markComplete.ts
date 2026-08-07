import { createAdminClient } from "@/lib/supabase/admin";
import { updateRoadmapNodeStatus } from "@/lib/roadmap/updateStatus";
import { RoadmapNodeItem } from "@/lib/roadmap/generate";
import { recomputeAndSaveNodeScore } from "@/lib/skillGraph/updateScore";

export interface MarkLessonCompleteParams {
  userId: string;
  skillNodeId: string;
  score?: number;
  source?: "check_understanding" | "manual_button" | "tutor_interaction";
}

export interface MarkLessonCompleteResponse {
  success: boolean;
  skillNodeId: string;
  score: number;
  source: string;
  updatedNodes: RoadmapNodeItem[] | null;
  newlyUnlockedNodes: Array<{ skillNodeId: string; nodeName: string }>;
}

/**
 * Finds (or creates) the lightweight assessment_tasks row used to record
 * lesson comprehension-check attempts for a skill node, so those attempts
 * can flow through the same computeNodeScore rollup as diagnostic
 * assessment attempts instead of a separate, driftable scoring path.
 */
async function findOrCreateLessonCheckTask(
  adminSupabase: ReturnType<typeof createAdminClient>,
  skillNodeId: string,
): Promise<string> {
  const { data: existing } = await adminSupabase
    .from("assessment_tasks")
    .select("id")
    .eq("skill_node_id", skillNodeId)
    .eq("type", "short_answer")
    .contains("rubric", { source: "lesson_check" })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  const { data: created, error } = await adminSupabase
    .from("assessment_tasks")
    .insert({
      skill_node_id: skillNodeId,
      type: "short_answer",
      prompt: "Lesson comprehension check (in-lesson discussion question).",
      rubric: { source: "lesson_check" },
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(
      `Failed to find or create lesson-check task for node ${skillNodeId}: ${error?.message}`,
    );
  }

  return created.id;
}

/**
 * Unified lesson completion logic, covering two genuinely different trust
 * tiers:
 *
 * - "check_understanding": the score comes from a real AI grading pass
 *   (lib/assessment/grader.ts's gradeAssessmentAttempt — the same pipeline
 *   diagnostic assessments use). That grading result is recorded as a real
 *   assessment_attempts row and rolled into competency_scores via
 *   lib/skillGraph/updateScore.ts's recomputeAndSaveNodeScore — the exact
 *   logic behind POST /api/skill-graph/update-score (Prompt 13) — so
 *   lesson-driven mastery is computed the same way diagnostic mastery is,
 *   not a second parallel definition.
 * - "manual_button" / "tutor_interaction": an explicit self-report ("I
 *   already know this, mark it done") with no graded evidence behind it.
 *   There's nothing to recompute from, so this stays a direct competency
 *   score upsert — clearly a different, weaker trust tier by design, not
 *   an oversight.
 *
 * Both paths finish by updating roadmap node status and unlocking
 * downstream prerequisites via updateRoadmapNodeStatus (Prompt 33's logic).
 */
export async function markLessonComplete({
  userId,
  skillNodeId,
  score = 85.0,
  source = "manual_button",
}: MarkLessonCompleteParams): Promise<MarkLessonCompleteResponse> {
  const adminSupabase = createAdminClient();

  try {
    let finalScore = score;

    if (source === "check_understanding") {
      const taskId = await findOrCreateLessonCheckTask(adminSupabase, skillNodeId);

      const { error: attemptErr } = await adminSupabase.from("assessment_attempts").insert({
        user_id: userId,
        task_id: taskId,
        response: { source: "lesson_check" },
        ai_score: score,
        confidence: 0.8,
      });

      if (attemptErr) {
        console.error(
          `[lib/lessons/markComplete] Error recording lesson-check attempt for user ${userId}, node ${skillNodeId}:`,
          attemptErr,
        );
      }

      const recomputed = await recomputeAndSaveNodeScore(userId, skillNodeId);
      finalScore = recomputed.score;
    } else {
      // Self-reported completion (manual button / post-tutor-interaction) —
      // no graded evidence to roll up, so upsert the score directly.
      const { error: scoreErr } = await adminSupabase.from("competency_scores").upsert(
        {
          user_id: userId,
          skill_node_id: skillNodeId,
          score,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id, skill_node_id" },
      );

      if (scoreErr) {
        console.error(
          `[lib/lessons/markComplete] Error upserting score for user ${userId}, node ${skillNodeId}:`,
          scoreErr,
        );
      }
    }

    // Update roadmap node status and unlock downstream prerequisites.
    const statusResult = await updateRoadmapNodeStatus({
      userId,
      skillNodeId,
      score: finalScore,
      completionThreshold: 80.0,
    });

    return {
      success: true,
      skillNodeId,
      score: finalScore,
      source,
      updatedNodes: statusResult?.nodes ?? null,
      newlyUnlockedNodes: statusResult?.newlyUnlockedNodes ?? [],
    };
  } catch (err) {
    console.error(`[lib/lessons/markComplete] Error marking lesson complete:`, err);
    return {
      success: false,
      skillNodeId,
      score,
      source,
      updatedNodes: null,
      newlyUnlockedNodes: [],
    };
  }
}
