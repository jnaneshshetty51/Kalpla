import { createAdminClient } from "@/lib/supabase/admin";
import { RoadmapNodeItem } from "./generate";

export interface UpdateStatusParams {
  userId: string;
  skillNodeId: string;
  score: number;
  completionThreshold?: number;
}

export interface UpdateStatusResult {
  nodes: RoadmapNodeItem[];
  /** Nodes that transitioned locked -> available this call specifically
   * because their prerequisites just became satisfied (step 5 below) — the
   * genuine "you unlocked something" event. Deliberately excludes step 6's
   * fallback promotion (keeping at least one node focusable), since that's
   * a UX safety net, not something earned, and celebrating it would be a
   * fake moment tied to nothing the user actually did. */
  newlyUnlockedNodes: Array<{ skillNodeId: string; nodeName: string }>;
}

/**
 * Updates a skill node's status in a user's active roadmap based on competency score crossing the threshold.
 * Automatically unlocks downstream nodes whose prerequisites have been satisfied.
 */
export async function updateRoadmapNodeStatus({
  userId,
  skillNodeId,
  score,
  completionThreshold = 80.0,
}: UpdateStatusParams): Promise<UpdateStatusResult | null> {
  try {
    const adminSupabase = createAdminClient();

    // 1. Fetch latest roadmap for user
    const { data: dbRoadmap, error: roadmapErr } = await adminSupabase
      .from("roadmaps")
      .select("id, nodes")
      .eq("user_id", userId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roadmapErr || !dbRoadmap) {
      console.warn(
        `[lib/roadmap/updateStatus] No active roadmap found for user ${userId}:`,
        roadmapErr?.message,
      );
      return null;
    }

    const currentNodes: RoadmapNodeItem[] = Array.isArray(dbRoadmap.nodes)
      ? (dbRoadmap.nodes as RoadmapNodeItem[])
      : [];

    if (currentNodes.length === 0) {
      return null;
    }

    // 2. Fetch all skill node prerequisite definitions
    const { data: dbSkillNodes } = await adminSupabase
      .from("skill_nodes")
      .select("id, prerequisite_ids");

    const prereqMap = new Map<string, string[]>();
    if (dbSkillNodes) {
      for (const sn of dbSkillNodes) {
        prereqMap.set(
          sn.id,
          Array.isArray(sn.prerequisite_ids) ? (sn.prerequisite_ids as string[]) : [],
        );
      }
    }

    // 3. Update target node status if threshold crossed
    let isModified = false;

    const updatedNodes = currentNodes.map((node) => {
      if (node.skill_node_id === skillNodeId) {
        if (score >= completionThreshold && node.status !== "completed") {
          isModified = true;
          return { ...node, status: "completed" as const };
        }
      }
      return node;
    });

    // 4. Collect all completed or skipped node IDs
    const satisfiedSet = new Set<string>();
    updatedNodes.forEach((node) => {
      if (node.status === "completed" || node.status === "skipped") {
        satisfiedSet.add(node.skill_node_id);
      }
    });

    // 5. Evaluate downstream locked nodes for unlocking
    const newlyUnlockedNodes: Array<{ skillNodeId: string; nodeName: string }> = [];

    const finalNodes = updatedNodes.map((node) => {
      if (node.status === "locked") {
        const prereqs = prereqMap.get(node.skill_node_id) || [];

        // Check if all prerequisites are in satisfiedSet
        const allPrereqsMet = prereqs.every((pId) => satisfiedSet.has(pId));
        if (allPrereqsMet) {
          isModified = true;
          newlyUnlockedNodes.push({ skillNodeId: node.skill_node_id, nodeName: node.node_name });
          return { ...node, status: "available" as const };
        }
      }
      return node;
    });

    // 6. Ensure at least one unblocked node is 'available' if all previous are done
    const hasActiveFocus = finalNodes.some(
      (n) => n.status === "available" || n.status === "in_progress",
    );

    if (!hasActiveFocus) {
      const firstLockedIdx = finalNodes.findIndex((n) => n.status === "locked");
      if (firstLockedIdx !== -1) {
        finalNodes[firstLockedIdx] = {
          ...finalNodes[firstLockedIdx],
          status: "available",
        };
        isModified = true;
      }
    }

    // 7. Persist updated nodes array if any status changes occurred
    if (isModified) {
      const { error: updateErr } = await adminSupabase
        .from("roadmaps")
        .update({ nodes: finalNodes })
        .eq("id", dbRoadmap.id);

      if (updateErr) {
        console.error(
          `[lib/roadmap/updateStatus] Error persisting updated roadmap nodes:`,
          updateErr,
        );
      }
    }

    return { nodes: finalNodes, newlyUnlockedNodes };
  } catch (err) {
    console.error("[lib/roadmap/updateStatus] Unexpected error updating status:", err);
    return null;
  }
}
