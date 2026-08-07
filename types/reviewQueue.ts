export type ReviewReason =
  "low_confidence" | "schema_validation_failed" | "manual_flag";

export type ReviewQueueStatus =
  "pending" | "reviewed" | "resolved" | "dismissed";

export interface GradingReviewItem {
  id: string;
  attempt_id: string | null;
  submission_id: string | null;
  reason: ReviewReason;
  details: Record<string, unknown>;
  status: ReviewQueueStatus;
  reviewer_id: string | null;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlagAttemptParams {
  attemptId: string;
  reason: ReviewReason;
  details?: Record<string, unknown>;
}

export interface FlagSubmissionParams {
  submissionId: string;
  reason: ReviewReason;
  details?: Record<string, unknown>;
}
