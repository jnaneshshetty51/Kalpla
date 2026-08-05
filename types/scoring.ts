export interface AssessmentAttemptInput {
  id?: string;
  ai_score: number | null;
  confidence?: number | null;
  created_at: string | Date;
}

export interface AttemptScoreContribution {
  attemptId?: string;
  rawScore: number;
  weight: number;
  confidence: number;
  contribution: number;
  createdAt: string;
}

export interface ScoringBreakdown {
  finalScore: number;
  attemptsCount: number;
  validAttemptsCount: number;
  contributions: AttemptScoreContribution[];
}
