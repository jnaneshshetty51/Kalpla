import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdminAuth } from "@/lib/admin/verifyAdminAuth";

export async function GET() {
  const auth = await verifyAdminAuth();
  if (!auth.authorized) return auth.response;

  const adminSupabase = createAdminClient();

  // Fetch all skill nodes
  const { data: nodes, error: nodeErr } = await adminSupabase
    .from("skill_nodes")
    .select("id, name, category")
    .order("category");

  if (nodeErr) return NextResponse.json({ error: nodeErr.message }, { status: 500 });

  // Aggregate competency scores per skill node
  const { data: scores } = await adminSupabase
    .from("competency_scores")
    .select("skill_node_id, user_id, score");

  // Aggregate assessment attempts per skill node
  const { data: attempts } = await adminSupabase
    .from("assessment_attempts")
    .select("task_id, user_id");

  // Map task_id -> skill_node_id via tasks table
  const { data: tasks } = await adminSupabase
    .from("tasks")
    .select("id, skill_node_id");

  const taskNodeMap = new Map<string, string>();
  for (const t of tasks || []) {
    taskNodeMap.set(t.id, t.skill_node_id);
  }

  // Build per-node metrics
  const scoresByNode = new Map<string, number[]>();
  for (const s of scores || []) {
    const arr = scoresByNode.get(s.skill_node_id) || [];
    arr.push(s.score);
    scoresByNode.set(s.skill_node_id, arr);
  }

  // Count attempts per node per user
  const attemptsByNode = new Map<string, Map<string, number>>();
  for (const a of attempts || []) {
    const nodeId = taskNodeMap.get(a.task_id);
    if (!nodeId) continue;
    const nodeMap = attemptsByNode.get(nodeId) || new Map<string, number>();
    nodeMap.set(a.user_id, (nodeMap.get(a.user_id) || 0) + 1);
    attemptsByNode.set(nodeId, nodeMap);
  }

  const results = (nodes || []).map((node) => {
    const nodeScores = scoresByNode.get(node.id) || [];
    const totalUsersWithScore = nodeScores.length;
    const completedUsers = nodeScores.filter((s) => s >= 80).length;
    const completionRate =
      totalUsersWithScore > 0
        ? Math.round((completedUsers / totalUsersWithScore) * 1000) / 10
        : 0;

    const nodeAttempts = attemptsByNode.get(node.id);
    const allAttemptCounts = nodeAttempts ? Array.from(nodeAttempts.values()) : [];
    const avgAttempts =
      allAttemptCounts.length > 0
        ? Math.round(
            (allAttemptCounts.reduce((s, v) => s + v, 0) / allAttemptCounts.length) * 10,
          ) / 10
        : 0;

    // Drop-off: users who have attempted but never reached ≥80
    const startedUsers = nodeAttempts ? nodeAttempts.size : 0;
    const dropOffRate =
      startedUsers > 0
        ? Math.round(((startedUsers - completedUsers) / startedUsers) * 1000) / 10
        : 0;

    return {
      id: node.id,
      name: node.name,
      category: node.category,
      completionRate,
      avgAttempts,
      dropOffRate,
      totalUsers: totalUsersWithScore,
      startedUsers,
    };
  });

  // Sort: worst first (lowest completion rate)
  results.sort((a, b) => a.completionRate - b.completionRate);

  return NextResponse.json({ nodes: results });
}
