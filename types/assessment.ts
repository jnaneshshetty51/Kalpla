export type AssessmentTaskType =
  "multiple_choice" | "short_answer" | "code" | "project";

export interface SkillNodeInfo {
  id: string;
  name: string;
  category: string;
  difficulty: number;
}

export interface AssessmentTaskItem {
  id: string;
  skill_node_id: string;
  type: AssessmentTaskType;
  prompt: string;
  rubric: Record<string, unknown>;
  skill_node: SkillNodeInfo;
  category: string;
}

export interface AssessmentRunnerState {
  tasks: AssessmentTaskItem[];
  currentIndex: number;
  answers: Record<string, unknown>;
  isSubmitting: boolean;
  isCompleted: boolean;
}
