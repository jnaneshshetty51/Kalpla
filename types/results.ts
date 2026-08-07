export interface NodeResultItem {
  id: string;
  name: string;
  category: string;
  difficulty: number;
  score: number;
  status: "mastered" | "in_progress" | "needs_focus";
}

export interface CategoryResultGroup {
  category: string;
  averageScore: number;
  nodes: NodeResultItem[];
}

export interface AssessmentResultsResponse {
  overallScore: number;
  aiSummary: string;
  categories: CategoryResultGroup[];
}
