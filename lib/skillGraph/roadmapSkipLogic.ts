export const DEFAULT_SKIP_THRESHOLD = 80.0;

/**
 * Determines whether a skill node can be skipped based on its competency score.
 * A skill node is marked as skippable if the user's score meets or exceeds the mastery threshold (default: 80.0).
 *
 * @param score Skill node competency score (0–100)
 * @param threshold Mastery score threshold required to skip (default: 80.0)
 * @returns True if score >= threshold, false otherwise.
 */
export function isNodeSkippable(
  score: number | null | undefined,
  threshold: number = DEFAULT_SKIP_THRESHOLD,
): boolean {
  if (typeof score !== "number" || isNaN(score)) {
    return false;
  }
  return score >= threshold;
}

/**
 * Filters a map of skill node scores and returns the list of node IDs that are eligible to be skipped.
 *
 * @param nodeScores Map of skillNodeId -> competency score
 * @param threshold Mastery score threshold (default: 80.0)
 * @returns Array of skippable skill node IDs
 */
export function getSkippableNodes(
  nodeScores: Record<string, number | null | undefined>,
  threshold: number = DEFAULT_SKIP_THRESHOLD,
): string[] {
  if (!nodeScores) return [];

  return Object.entries(nodeScores)
    .filter(([, score]) => isNodeSkippable(score, threshold))
    .map(([nodeId]) => nodeId);
}

export interface RoadmapSkipEvaluation {
  /** Node IDs already at mastery — skip straight to marked-complete. */
  skip: string[];
  /** Node IDs that need the full learn -> practice -> assess cycle. */
  fullCycle: string[];
}

/**
 * Partitions a roadmap's nodes into "skip" (diagnostic score already at
 * mastery, before any lessons were taken) vs. "full cycle" (needs to learn,
 * practice, and be assessed). Pure function, no DB/LLM calls — the roadmap
 * generation step calls this to decide per-node treatment; it does not
 * decide anything about lesson content itself.
 *
 * @param nodeScores Map of skillNodeId -> diagnostic competency score
 * @param nodeIds Full ordered list of node IDs the roadmap covers
 * @param threshold Mastery score threshold (default: 80.0)
 */
export function evaluateRoadmapSkips(
  nodeScores: Record<string, number | null | undefined>,
  nodeIds: string[],
  threshold: number = DEFAULT_SKIP_THRESHOLD,
): RoadmapSkipEvaluation {
  const skip: string[] = [];
  const fullCycle: string[] = [];

  for (const nodeId of nodeIds) {
    if (isNodeSkippable(nodeScores?.[nodeId], threshold)) {
      skip.push(nodeId);
    } else {
      fullCycle.push(nodeId);
    }
  }

  return { skip, fullCycle };
}
