import { COMPLETED_THRESHOLD } from "@/lib/skillGraph/status";

/**
 * Prompt 67: a project unlocks once every prerequisite skill node is
 * marked complete (score >= COMPLETED_THRESHOLD — the same shared
 * threshold Section B/D/H all use, so this can't drift into a fourth
 * independent definition of "complete").
 */
export function computeProjectUnlockState(
  prerequisiteSkillNodeIds: string[],
  scoreByNode: Map<string, number>,
): { unlocked: boolean; missingSkillNodeIds: string[] } {
  const missing = prerequisiteSkillNodeIds.filter(
    (id) => (scoreByNode.get(id) ?? 0) < COMPLETED_THRESHOLD,
  );
  return { unlocked: missing.length === 0, missingSkillNodeIds: missing };
}
