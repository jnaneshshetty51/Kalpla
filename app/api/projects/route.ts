import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeProjectUnlockState } from "@/lib/projects/unlockLogic";

export interface ProjectLadderItem {
  id: string;
  name: string;
  ladder_position: number;
  spec: { type?: string; description?: string };
  unlocked: boolean;
  missing_prerequisites: Array<{ id: string; name: string }>;
  best_submission_status: string | null;
}

export async function GET() {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    const adminSupabase = createAdminClient();

    const { data: projects, error: projectsErr } = await adminSupabase
      .from("projects")
      .select("id, name, ladder_position, prerequisite_skill_node_ids, spec")
      .not("ladder_position", "is", null)
      .order("ladder_position", { ascending: true });

    if (projectsErr) {
      return NextResponse.json({ error: projectsErr.message }, { status: 500 });
    }

    const { data: scores } = await adminSupabase
      .from("competency_scores")
      .select("skill_node_id, score")
      .eq("user_id", user.id);

    const scoreByNode = new Map<string, number>(
      (scores || []).map((s) => [s.skill_node_id, Number(s.score)]),
    );

    const allPrereqIds = Array.from(
      new Set((projects || []).flatMap((p) => p.prerequisite_skill_node_ids || [])),
    );
    const { data: prereqNodes } = allPrereqIds.length
      ? await adminSupabase.from("skill_nodes").select("id, name").in("id", allPrereqIds)
      : { data: [] };
    const nodeNameById = new Map((prereqNodes || []).map((n) => [n.id, n.name]));

    const { data: submissions } = await adminSupabase
      .from("submissions")
      .select("project_id, status, created_at")
      .eq("user_id", user.id)
      .not("project_id", "is", null)
      .order("created_at", { ascending: false });

    const bestStatusByProject = new Map<string, string>();
    for (const s of submissions || []) {
      if (!s.project_id) continue;
      if (bestStatusByProject.has(s.project_id)) continue;
      // First (most recent, since ordered desc) submission per project;
      // "passed" from any prior attempt still counts even if unset here —
      // refined below.
      bestStatusByProject.set(s.project_id, s.status);
    }
    // Prefer "passed" if it appears anywhere in the user's history for that project.
    for (const s of submissions || []) {
      if (s.project_id && s.status === "passed") {
        bestStatusByProject.set(s.project_id, "passed");
      }
    }

    const items: ProjectLadderItem[] = (projects || []).map((p) => {
      const prereqIds: string[] = p.prerequisite_skill_node_ids || [];
      const { unlocked, missingSkillNodeIds } = computeProjectUnlockState(prereqIds, scoreByNode);

      return {
        id: p.id,
        name: p.name,
        ladder_position: p.ladder_position,
        spec: { type: p.spec?.type, description: p.spec?.description },
        unlocked,
        missing_prerequisites: missingSkillNodeIds.map((id) => ({ id, name: nodeNameById.get(id) || id })),
        best_submission_status: bestStatusByProject.get(p.id) || null,
      };
    });

    return NextResponse.json({ projects: items });
  } catch (err) {
    console.error("Error in GET /api/projects:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
