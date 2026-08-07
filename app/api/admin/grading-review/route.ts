import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdminAuth } from "@/lib/admin/verifyAdminAuth";
import { recomputeAndSaveNodeScore } from "@/lib/skillGraph/updateScore";

/**
 * grading_review_queue has no user_id/task_id/ai_score/ai_feedback/confidence
 * columns of its own, and no `tasks` relationship — those live on the row
 * it points to via attempt_id (assessment_attempts, joined to
 * assessment_tasks for skill_node_id) or submission_id (submissions), per
 * the "exactly one target" constraint added in Prompt 63. This route
 * previously queried columns that never existed and 500'd unconditionally.
 * The admin UI only has a review flow for attempt-based entries (text/code
 * assessment grading), so submission-based flags are left out of this list
 * rather than half-supported with no UI to act on them.
 */
export async function GET() {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) return auth.response;

  const adminSupabase = createAdminClient();

  const { data: queue, error } = await adminSupabase
    .from("grading_review_queue")
    .select(
      `id, attempt_id, reason, status, created_at,
       assessment_attempts (
         id, user_id, task_id, response, ai_score, ai_feedback, confidence,
         assessment_tasks ( id, prompt, skill_node_id, type )
       )`,
    )
    .eq("status", "pending")
    .not("attempt_id", "is", null)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const shaped = (queue || [])
    .filter((entry) => entry.assessment_attempts)
    .map((entry) => {
      const attempt = entry.assessment_attempts as unknown as {
        id: string;
        user_id: string;
        task_id: string;
        response: unknown;
        ai_score: number;
        ai_feedback: Record<string, unknown>;
        confidence: number;
        assessment_tasks: { id: string; prompt: string; skill_node_id: string; type: string } | null;
      };
      return {
        id: entry.id,
        user_id: attempt.user_id,
        ai_score: attempt.ai_score,
        ai_feedback: attempt.ai_feedback,
        confidence: attempt.confidence,
        created_at: entry.created_at,
        response: attempt.response,
        tasks: attempt.assessment_tasks,
      };
    });

  return NextResponse.json({ queue: shaped });
}

export async function POST(request: Request) {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) return auth.response;

  let body: {
    action?: string;
    entryId?: string;
    overrideScore?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, entryId, overrideScore } = body;
  if (!entryId || !action) {
    return NextResponse.json({ error: "Missing entryId or action" }, { status: 400 });
  }
  if (!["approve", "override"].includes(action)) {
    return NextResponse.json({ error: "action must be 'approve' or 'override'" }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  const { data: entry, error: fetchErr } = await adminSupabase
    .from("grading_review_queue")
    .select(
      `id, attempt_id,
       assessment_attempts ( id, user_id, task_id, assessment_tasks ( skill_node_id ) )`,
    )
    .eq("id", entryId)
    .maybeSingle();

  if (fetchErr || !entry || !entry.assessment_attempts) {
    return NextResponse.json({ error: "Queue entry not found" }, { status: 404 });
  }

  const attempt = entry.assessment_attempts as unknown as {
    id: string;
    user_id: string;
    task_id: string;
    assessment_tasks: { skill_node_id: string } | null;
  };
  const skillNodeId = attempt.assessment_tasks?.skill_node_id;

  let finalScore: number | null = null;

  // On override: write the corrected score onto the actual attempt, then
  // recompute the node's competency score the same way a normal submission
  // would (recomputeAndSaveNodeScore), so the override genuinely cascades
  // into competency_scores and unlock logic rather than just changing an
  // isolated queue-row field nothing else reads.
  if (action === "override" && overrideScore != null) {
    const { error: updateAttemptErr } = await adminSupabase
      .from("assessment_attempts")
      .update({ ai_score: overrideScore })
      .eq("id", attempt.id);

    if (updateAttemptErr) {
      return NextResponse.json({ error: updateAttemptErr.message }, { status: 500 });
    }

    if (skillNodeId) {
      const recomputed = await recomputeAndSaveNodeScore(attempt.user_id, skillNodeId);
      finalScore = recomputed.score;
    } else {
      finalScore = overrideScore;
    }
  }

  await adminSupabase
    .from("grading_review_queue")
    .update({
      status: "resolved",
      reviewer_id: auth.user.id,
      reviewer_notes: action === "override" ? "Score overridden by admin" : "AI score approved by admin",
    })
    .eq("id", entryId);

  return NextResponse.json({ success: true, action, finalScore });
}
