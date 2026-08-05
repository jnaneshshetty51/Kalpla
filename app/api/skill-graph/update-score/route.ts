import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeNodeScore } from "@/lib/skillGraph/scoring";
import { getUnlockableNodes } from "@/lib/skillGraph/traverse";
import {
  computeNodeStatus,
  COMPLETED_THRESHOLD,
} from "@/lib/skillGraph/status";
import { SkillNodeInput } from "@/types/skillGraph";

/**
 * POST /api/skill-graph/update-score
 *
 * Call after an assessment attempt is graded. Recomputes the affected
 * node's competency score from public.assessment_attempts, upserts
 * competency_scores, and reports any nodes newly unlocked by the change so
 * the UI can show an "unlocked!" notification.
 *
 * Scores are computed only from assessment_attempts (id, ai_score,
 * confidence, created_at) — the shape computeNodeScore expects. Submissions
 * (project/exercise reviews) store their result as an unstructured
 * `ai_review` jsonb blob with no defined mapping to a numeric score, so
 * they aren't wired into node scoring here.
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

  const adminSupabase = createAdminClient();

  const { data: tasks, error: tasksErr } = await adminSupabase
    .from("assessment_tasks")
    .select("id")
    .eq("skill_node_id", skillNodeId);

  if (tasksErr) {
    return NextResponse.json({ error: tasksErr.message }, { status: 500 });
  }

  const taskIds = (tasks || []).map((t) => t.id);

  const { data: attempts, error: attemptsErr } = taskIds.length
    ? await adminSupabase
        .from("assessment_attempts")
        .select("id, ai_score, confidence, created_at")
        .eq("user_id", user.id)
        .in("task_id", taskIds)
    : { data: [], error: null };

  if (attemptsErr) {
    return NextResponse.json({ error: attemptsErr.message }, { status: 500 });
  }

  const newScore = computeNodeScore(attempts || []);

  // Snapshot every node + the user's current scores before this write, so
  // we can diff "unlockable" before vs. after and report only genuinely new
  // unlocks caused by this specific update.
  const [allNodesResult, allScoresResult] = await Promise.all([
    adminSupabase.from("skill_nodes").select("*"),
    adminSupabase
      .from("competency_scores")
      .select("skill_node_id, score")
      .eq("user_id", user.id),
  ]);

  if (allNodesResult.error) {
    return NextResponse.json(
      { error: allNodesResult.error.message },
      { status: 500 },
    );
  }
  if (allScoresResult.error) {
    return NextResponse.json(
      { error: allScoresResult.error.message },
      { status: 500 },
    );
  }

  const allNodes = (allNodesResult.data || []) as SkillNodeInput[];
  const scoreByNode = new Map<string, number>(
    (allScoresResult.data || []).map((s) => [s.skill_node_id, Number(s.score)]),
  );

  const completedBefore = new Set(
    allNodes
      .filter((n) => (scoreByNode.get(n.id) ?? 0) >= COMPLETED_THRESHOLD)
      .map((n) => n.id),
  );

  scoreByNode.set(skillNodeId, newScore);
  const completedAfter = new Set(
    allNodes
      .filter((n) => (scoreByNode.get(n.id) ?? 0) >= COMPLETED_THRESHOLD)
      .map((n) => n.id),
  );

  const unlockableBefore = new Set(
    getUnlockableNodes(allNodes, completedBefore).map((n) => n.id),
  );
  const newlyUnlocked = getUnlockableNodes(allNodes, completedAfter).filter(
    (n) => !unlockableBefore.has(n.id),
  );

  const { data: savedScore, error: upsertErr } = await adminSupabase
    .from("competency_scores")
    .upsert(
      {
        user_id: user.id,
        skill_node_id: skillNodeId,
        score: newScore,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,skill_node_id" },
    )
    .select()
    .single();

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const targetNode = allNodes.find((n) => n.id === skillNodeId);
  const prerequisitesMet = (targetNode?.prerequisite_ids ?? []).every((id) =>
    completedBefore.has(id),
  );

  return NextResponse.json({
    data: {
      skillNodeId,
      score: newScore,
      attemptsUsed: (attempts || []).length,
      status: computeNodeStatus(newScore, prerequisitesMet),
      unlockedNodes: newlyUnlocked.map((n) => ({
        id: n.id,
        name: n.name,
        category: n.category,
      })),
    },
    savedScore,
  });
}
