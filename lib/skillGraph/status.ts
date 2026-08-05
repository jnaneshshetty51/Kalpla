import { NodeStatus } from "@/types/skillGraph";

export const COMPLETED_THRESHOLD = 80;

/**
 * Per-node status shared by the skill-graph GET endpoint and the
 * update-score endpoint, so the two can't drift on what "completed" means.
 *
 * - completed: score >= COMPLETED_THRESHOLD
 * - in_progress: 0 < score < COMPLETED_THRESHOLD (some engagement, not mastered)
 * - available: no score yet, but every prerequisite is completed
 * - locked: no score yet, and at least one prerequisite isn't completed
 */
export function computeNodeStatus(
  score: number,
  prerequisitesMet: boolean,
): NodeStatus {
  if (score >= COMPLETED_THRESHOLD) return "completed";
  if (score > 0) return "in_progress";
  return prerequisitesMet ? "available" : "locked";
}
