import { createAdminClient } from "@/lib/supabase/admin";
import { generateUserRoadmap, RoadmapNodeItem } from "@/lib/roadmap/generate";

export type NextStepActionType =
  | "start_lesson"
  | "continue_exercise"
  | "submit_project"
  | "complete_assessment"
  | "roadmap_completed";

export interface NextStepRecommendation {
  skill_node_id: string;
  node_name: string;
  category?: string;
  status: string;
  estimated_days: number;
  learning_objective: string;
  action_type: NextStepActionType;
  action_label: string;
  action_description: string;
  target_url: string;
}

/**
 * Computes the single "next best action" for a user based on their active roadmap state.
 * Shared by the Dashboard "Today" widget and the Daily Coach messaging service.
 */
export async function getRecommendedNextStep(
  userId: string,
): Promise<NextStepRecommendation> {
  const adminSupabase = createAdminClient();

  // 1. Fetch latest roadmap for user
  const { data: dbRoadmap } = await adminSupabase
    .from("roadmaps")
    .select("id, user_id, generated_at, nodes")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nodes: RoadmapNodeItem[] = [];

  if (dbRoadmap && Array.isArray(dbRoadmap.nodes)) {
    nodes = dbRoadmap.nodes as RoadmapNodeItem[];
  } else {
    // Auto-generate roadmap if none exists
    const newRoadmap = await generateUserRoadmap({ userId });
    nodes = newRoadmap.nodes;
  }

  // 2. Find the active node: prioritize 'in_progress', then 'available', then first non-completed/non-skipped
  const inProgressNode = nodes.find((n) => n.status === "in_progress");
  const availableNode = nodes.find((n) => n.status === "available");
  const firstUncompletedNode = nodes.find(
    (n) => n.status !== "completed" && n.status !== "skipped",
  );

  const targetNode = inProgressNode || availableNode || firstUncompletedNode;

  // 3. If all nodes are completed or skipped
  if (!targetNode) {
    return {
      skill_node_id: "completed",
      node_name: "Curriculum Completed!",
      status: "completed",
      estimated_days: 0,
      learning_objective:
        "Congratulations! You have mastered the full GenAI Engineering curriculum.",
      action_type: "roadmap_completed",
      action_label: "View Mastered Roadmap →",
      action_description:
        "Explore advanced capstone challenges or review your mastered skill graph.",
      target_url: "/roadmap",
    };
  }

  // 4. Fetch category details from skill_nodes table if available
  let categoryName = "GenAI Engineering";
  try {
    const { data: nodeMeta } = await adminSupabase
      .from("skill_nodes")
      .select("category")
      .eq("id", targetNode.skill_node_id)
      .maybeSingle();

    if (nodeMeta?.category) {
      categoryName = nodeMeta.category;
    }
  } catch (err) {
    console.warn("Error fetching node category for next-step:", err);
  }

  // 5. Determine action type, label, and description
  let actionType: NextStepActionType = "start_lesson";
  let actionLabel = "Start Core Module →";
  let actionDescription = `Begin learning ${targetNode.node_name} concepts and interactive exercises.`;

  if (targetNode.status === "in_progress") {
    actionType = "continue_exercise";
    actionLabel = "Continue Exercise →";
    actionDescription = `Pick up where you left off in ${targetNode.node_name}.`;
  } else if (
    targetNode.node_name.toLowerCase().includes("project") ||
    targetNode.node_name.toLowerCase().includes("rag pipeline")
  ) {
    actionType = "submit_project";
    actionLabel = "Build Project Challenge →";
    actionDescription = `Implement the practical ${targetNode.node_name} application challenge.`;
  }

  return {
    skill_node_id: targetNode.skill_node_id,
    node_name: targetNode.node_name,
    category: categoryName,
    status: targetNode.status,
    estimated_days: targetNode.estimated_days || 2,
    learning_objective:
      targetNode.learning_objective ||
      `Master ${targetNode.node_name} concepts and practice.`,
    action_type: actionType,
    action_label: actionLabel,
    action_description: actionDescription,
    target_url: `/learn/${encodeURIComponent(targetNode.skill_node_id)}`,
  };
}
