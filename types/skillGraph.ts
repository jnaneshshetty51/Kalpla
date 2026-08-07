export interface SkillNodeInput {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  prerequisite_ids: string[];
  difficulty: number;
  order_index: number;
}

export type SkillNode = SkillNodeInput;

export type NodeStatus = "locked" | "available" | "in_progress" | "completed" | "skipped";

export interface AnnotatedSkillNode extends SkillNodeInput {
  score: number;
  status: NodeStatus;
}
