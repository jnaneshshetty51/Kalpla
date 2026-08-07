import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { recomputeAndSaveNodeScore } from "@/lib/skillGraph/updateScore";

/**
 * POST /api/skill-graph/update-score
 *
 * Call after an assessment attempt is graded. Recomputes the affected
 * node's competency score from public.assessment_attempts, upserts
 * competency_scores, and reports any nodes newly unlocked by the change so
 * the UI can show an "unlocked!" notification.
 *
 * The actual recompute logic lives in lib/skillGraph/updateScore.ts so
 * lib/lessons/markComplete.ts's AI-graded completion path can call the
 * exact same score computation rather than writing an arbitrary score
 * directly and drifting from this endpoint's definition of "the score."
 *
 * competency_scores has no RLS write path for regular users by design (see
 * its migration) — scores are system-computed, not self-reported — so this
 * always writes via the service-role admin client, never the caller's own
 * session. The user can only ever trigger a recompute of their own score:
 * skillNodeId comes from the request, but user_id always comes from the
 * authenticated session, never from the request body.
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { skillNodeId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 },
    );
  }

  const { skillNodeId } = body;
  if (!skillNodeId || typeof skillNodeId !== "string") {
    return NextResponse.json(
      { error: "Missing required field: 'skillNodeId'" },
      { status: 400 },
    );
  }

  try {
    const result = await recomputeAndSaveNodeScore(user.id, skillNodeId);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
