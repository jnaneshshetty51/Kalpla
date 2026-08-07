import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({ insert: mockInsert }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { flagAttemptForReview, flagSubmissionForReview } from "@/lib/grading/reviewQueue";

describe("lib/grading/reviewQueue.ts — flagging attempts/submissions into the review queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
  });

  it("flagAttemptForReview inserts with attempt_id, the given reason, details, and status pending", async () => {
    await flagAttemptForReview({
      attemptId: "att-1",
      reason: "low_confidence",
      details: { confidence: 0.4 },
    });

    expect(mockFrom).toHaveBeenCalledWith("grading_review_queue");
    expect(mockInsert).toHaveBeenCalledWith({
      attempt_id: "att-1",
      reason: "low_confidence",
      details: { confidence: 0.4 },
      status: "pending",
    });
  });

  it("flagSubmissionForReview inserts with submission_id, not attempt_id", async () => {
    await flagSubmissionForReview({
      submissionId: "sub-1",
      reason: "schema_validation_failed",
    });

    expect(mockInsert).toHaveBeenCalledWith({
      submission_id: "sub-1",
      reason: "schema_validation_failed",
      details: {},
      status: "pending",
    });
    // Must never send an attempt_id on a submission-targeted flag — the
    // real table constraint is "exactly one target".
    const insertedPayload = mockInsert.mock.calls[0][0];
    expect(insertedPayload.attempt_id).toBeUndefined();
  });

  it("swallows a DB insert error rather than throwing — flagging is a best-effort side channel, not something that should fail the grading response", async () => {
    mockInsert.mockResolvedValue({ error: { message: "insert failed" } });

    await expect(
      flagAttemptForReview({ attemptId: "att-2", reason: "low_confidence" }),
    ).resolves.toBeUndefined();
  });
});
