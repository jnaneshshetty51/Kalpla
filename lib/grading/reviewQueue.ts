import { createAdminClient } from "@/lib/supabase/admin";
import { FlagAttemptParams, FlagSubmissionParams } from "@/types/reviewQueue";

/**
 * Inserts an assessment attempt into the `grading_review_queue` table
 * when low confidence or schema validation failure is detected.
 * Uses service_role admin privileges.
 */
export async function flagAttemptForReview({
  attemptId,
  reason,
  details = {},
}: FlagAttemptParams): Promise<void> {
  try {
    const adminSupabase = createAdminClient();

    const { error } = await adminSupabase.from("grading_review_queue").insert({
      attempt_id: attemptId,
      reason,
      details,
      status: "pending",
    });

    if (error) {
      console.error(
        `[lib/grading/reviewQueue] Error inserting review queue item for attempt ${attemptId}:`,
        error,
      );
    } else {
      console.log(
        `[lib/grading/reviewQueue] Flagged attempt ${attemptId} for review (reason: "${reason}")`,
      );
    }
  } catch (err) {
    console.error(
      `[lib/grading/reviewQueue] Unexpected error flagging attempt for review:`,
      err,
    );
  }
}

/**
 * Same queue as flagAttemptForReview, targeting a project submission
 * instead of an assessment attempt (Prompt 63) — the same confidence
 * threshold / ambiguity signal used for attempts, wired to
 * lib/grading/reviewSubmission.ts's output.
 */
export async function flagSubmissionForReview({
  submissionId,
  reason,
  details = {},
}: FlagSubmissionParams): Promise<void> {
  try {
    const adminSupabase = createAdminClient();

    const { error } = await adminSupabase.from("grading_review_queue").insert({
      submission_id: submissionId,
      reason,
      details,
      status: "pending",
    });

    if (error) {
      console.error(
        `[lib/grading/reviewQueue] Error inserting review queue item for submission ${submissionId}:`,
        error,
      );
    } else {
      console.log(
        `[lib/grading/reviewQueue] Flagged submission ${submissionId} for review (reason: "${reason}")`,
      );
    }
  } catch (err) {
    console.error(
      `[lib/grading/reviewQueue] Unexpected error flagging submission for review:`,
      err,
    );
  }
}
