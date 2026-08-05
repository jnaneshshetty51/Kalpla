import { NextResponse } from "next/server";
import { getServerUser, createClient } from "@/lib/supabase/server";
import { topologicalSort } from "@/lib/skillGraph/traverse";
import {
  computeNodeStatus,
  COMPLETED_THRESHOLD,
} from "@/lib/skillGraph/status";
import { AnnotatedSkillNode, SkillNodeInput } from "@/types/skillGraph";

/**
 * GET /api/skill-graph
 *
 * The single source of truth for both the dashboard and the roadmap page:
 * the full skill graph in valid learning order, annotated with the calling
 * user's own competency score and computed status per node.
 */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const [nodesResult, scoresResult] = await Promise.all([
    supabase.from("skill_nodes").select("*"),
    supabase
      .from("competency_scores")
      .select("skill_node_id, score")
      .eq("user_id", user.id),
  ]);

  if (nodesResult.error) {
    return NextResponse.json(
      { error: nodesResult.error.message },
      { status: 500 },
    );
  }
  if (scoresResult.error) {
    return NextResponse.json(
      { error: scoresResult.error.message },
      { status: 500 },
    );
  }

  const nodes = (nodesResult.data || []) as SkillNodeInput[];
  const scoreByNode = new Map<string, number>(
    (scoresResult.data || []).map((s) => [s.skill_node_id, Number(s.score)]),
  );

  let ordered: SkillNodeInput[];
  try {
    ordered = topologicalSort(nodes);
  } catch (err) {
    // Shouldn't happen with valid seed data plus the PATCH-time cycle guard
    // in app/api/admin/skill-nodes — but a bad manual DB edit shouldn't take
    // down the one endpoint every page depends on. Fall back to unordered.
    console.error("Skill graph topological sort failed:", err);
    ordered = nodes;
  }

  const completedIds = new Set(
    ordered
      .filter((n) => (scoreByNode.get(n.id) ?? 0) >= COMPLETED_THRESHOLD)
      .map((n) => n.id),
  );

  const annotated: AnnotatedSkillNode[] = ordered.map((node) => {
    const score = scoreByNode.get(node.id) ?? 0;
    const prerequisitesMet = node.prerequisite_ids.every((id) =>
      completedIds.has(id),
    );

    return {
      ...node,
      score,
      status: computeNodeStatus(score, prerequisitesMet),
    };
  });

  return NextResponse.json({ data: annotated });
}
