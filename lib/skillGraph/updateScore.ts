import { createAdminClient } from "@/lib/supabase/admin";
import { computeNodeScore } from "@/lib/skillGraph/scoring";
import { getUnlockableNodes } from "@/lib/skillGraph/traverse";
import { computeNodeStatus, COMPLETED_THRESHOLD } from "@/lib/skillGraph/status";
import { SkillNodeInput, NodeStatus } from "@/types/skillGraph";

export interface RecomputeNodeScoreResult {
  skillNodeId: string;
  score: number;
  attemptsUsed: number;
  status: NodeStatus;
  unlockedNodes: Array<{ id: string; name: string; category: string }>;
}

/**
 * Recomputes a user's competency score for one skill node strictly from
 * public.assessment_attempts (the same recency-weighted rollup as
 * lib/skillGraph/scoring.ts's computeNodeScore) and upserts the result into
 * competency_scores. This is the exact logic behind
 * POST /api/skill-graph/update-score (Prompt 13), factored out so other
 * callers — like lib/lessons/markComplete.ts's AI-graded completion path —
 * can genuinely reuse it instead of writing an arbitrary score directly and
 * drifting from the one place "how a competency score is computed" is
 * defined.
 */
export async function recomputeAndSaveNodeScore(
  userId: string,
  skillNodeId: string,
): Promise<RecomputeNodeScoreResult> {
  const adminSupabase = createAdminClient();

  const { data: tasks, error: tasksErr } = await adminSupabase
    .from("assessment_tasks")
    .select("id")
    .eq("skill_node_id", skillNodeId);

  if (tasksErr) {
    throw new Error(tasksErr.message);
  }

  const taskIds = (tasks || []).map((t) => t.id);

  const { data: attempts, error: attemptsErr } = taskIds.length
    ? await adminSupabase
        .from("assessment_attempts")
        .select("id, ai_score, confidence, created_at")
        .eq("user_id", userId)
        .in("task_id", taskIds)
    : { data: [], error: null };

  if (attemptsErr) {
    throw new Error(attemptsErr.message);
  }

  const newScore = computeNodeScore(attempts || []);

  const [allNodesResult, allScoresResult] = await Promise.all([
    adminSupabase.from("skill_nodes").select("*"),
    adminSupabase
      .from("competency_scores")
      .select("skill_node_id, score")
      .eq("user_id", userId),
  ]);

  if (allNodesResult.error) throw new Error(allNodesResult.error.message);
  if (allScoresResult.error) throw new Error(allScoresResult.error.message);

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

  const { error: upsertErr } = await adminSupabase.from("competency_scores").upsert(
    {
      user_id: userId,
      skill_node_id: skillNodeId,
      score: newScore,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,skill_node_id" },
  );

  if (upsertErr) {
    throw new Error(upsertErr.message);
  }

  const targetNode = allNodes.find((n) => n.id === skillNodeId);
  const prerequisitesMet = (targetNode?.prerequisite_ids ?? []).every((id) =>
    completedBefore.has(id),
  );

  return {
    skillNodeId,
    score: newScore,
    attemptsUsed: (attempts || []).length,
    status: computeNodeStatus(newScore, prerequisitesMet),
    unlockedNodes: newlyUnlocked.map((n) => ({ id: n.id, name: n.name, category: n.category })),
  };
}
