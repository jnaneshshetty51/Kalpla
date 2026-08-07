import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AssessmentTaskItem, AssessmentTaskType } from "@/types/assessment";

export async function GET(request: Request) {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const skillNodeId = searchParams.get("skill_node_id");
    const taskId = searchParams.get("task_id");

    if (!skillNodeId && !taskId) {
      return NextResponse.json(
        { error: "Missing query parameter: 'skill_node_id' or 'task_id'" },
        { status: 400 },
      );
    }

    const adminSupabase = createAdminClient();

    let query = adminSupabase
      .from("assessment_tasks")
      .select("id, skill_node_id, type, prompt, rubric");

    if (taskId) {
      query = query.eq("id", taskId);
    } else if (skillNodeId) {
      query = query.eq("skill_node_id", skillNodeId);
    }

    const { data: taskData } = await query.limit(1).maybeSingle();

    if (!taskData) {
      // If task DB row is missing, query skill node and generate fallback task object
      let targetSkillNodeId = skillNodeId;
      if (!targetSkillNodeId && taskId) {
        targetSkillNodeId = "a0000000-0000-4000-a000-000000000101";
      }

      const { data: nodeData } = await adminSupabase
        .from("skill_nodes")
        .select("id, name, category, difficulty")
        .eq("id", targetSkillNodeId || "")
        .maybeSingle();

      const fallbackTask: AssessmentTaskItem = {
        id: taskId || `fallback-${targetSkillNodeId}`,
        skill_node_id:
          targetSkillNodeId || "a0000000-0000-4000-a000-000000000101",
        type: "short_answer",
        prompt: `Explain key practical concepts and implementation strategies for ${nodeData?.name || "this skill"}.`,
        rubric: { key_points: ["Clear explanation", "Technical accuracy"] },
        category: nodeData?.category || "GenAI Engineering",
        skill_node: {
          id: nodeData?.id || "a0000000-0000-4000-a000-000000000101",
          name: nodeData?.name || "Skill Node",
          category: nodeData?.category || "GenAI Engineering",
          difficulty: nodeData?.difficulty || 1,
        },
      };

      return NextResponse.json({ task: fallbackTask });
    }

    // Fetch associated skill node metadata
    const { data: nodeData } = await adminSupabase
      .from("skill_nodes")
      .select("id, name, category, difficulty")
      .eq("id", taskData.skill_node_id)
      .maybeSingle();

    const taskItem: AssessmentTaskItem = {
      id: taskData.id,
      skill_node_id: taskData.skill_node_id,
      type: taskData.type as AssessmentTaskType,
      prompt: taskData.prompt,
      rubric: (taskData.rubric as Record<string, unknown>) || {},
      category: nodeData?.category || "GenAI Engineering",
      skill_node: {
        id: nodeData?.id || taskData.skill_node_id,
        name: nodeData?.name || "Skill Node",
        category: nodeData?.category || "GenAI Engineering",
        difficulty: nodeData?.difficulty || 1,
      },
    };

    return NextResponse.json({ task: taskItem });
  } catch (error) {
    console.error("Error in GET /api/assessment/task:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
