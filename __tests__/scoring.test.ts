import { describe, it, expect } from "vitest";
import {
  computeNodeScore,
  computeNodeScoreWithBreakdown,
} from "../lib/skillGraph/scoring";
import { AssessmentAttemptInput } from "../types/scoring";

describe("Skill Competency Scoring Engine", () => {
  it("should return 0 when attempt history is empty", () => {
    expect(computeNodeScore([])).toBe(0);
  });

  it("should return exact attempt score when only a single attempt exists", () => {
    const attempts: AssessmentAttemptInput[] = [
      {
        id: "att-1",
        ai_score: 85.5,
        confidence: 0.9,
        created_at: "2026-08-01T10:00:00Z",
      },
    ];

    expect(computeNodeScore(attempts)).toBe(85.5);
  });

  it("should apply 60/40 recency weighting when exactly 2 attempts exist", () => {
    const attempts: AssessmentAttemptInput[] = [
      {
        id: "att-old",
        ai_score: 50.0,
        confidence: 1.0,
        created_at: "2026-08-01T10:00:00Z",
      },
      {
        id: "att-recent",
        ai_score: 100.0,
        confidence: 1.0,
        created_at: "2026-08-02T10:00:00Z",
      },
    ];

    // Expected: 100.0 * 0.60 + 50.0 * 0.40 = 60 + 20 = 80.0
    expect(computeNodeScore(attempts)).toBe(80.0);
  });

  it("should apply 50/30/20 recency weighting to the 3 most recent attempts", () => {
    const attempts: AssessmentAttemptInput[] = [
      {
        id: "att-1", // Oldest
        ai_score: 40.0,
        confidence: 1.0,
        created_at: "2026-08-01T10:00:00Z",
      },
      {
        id: "att-2", // Middle
        ai_score: 70.0,
        confidence: 1.0,
        created_at: "2026-08-02T10:00:00Z",
      },
      {
        id: "att-3", // Newest
        ai_score: 90.0,
        confidence: 1.0,
        created_at: "2026-08-03T10:00:00Z",
      },
    ];

    // Expected: 90.0 * 0.50 + 70.0 * 0.30 + 40.0 * 0.20 = 45 + 21 + 8 = 74.0
    expect(computeNodeScore(attempts)).toBe(74.0);
  });

  it("should ignore older attempts beyond the 3 most recent", () => {
    const attempts: AssessmentAttemptInput[] = [
      {
        id: "att-ancient",
        ai_score: 0.0,
        confidence: 1.0,
        created_at: "2026-07-01T10:00:00Z",
      },
      {
        id: "att-1",
        ai_score: 60.0,
        confidence: 1.0,
        created_at: "2026-08-01T10:00:00Z",
      },
      {
        id: "att-2",
        ai_score: 80.0,
        confidence: 1.0,
        created_at: "2026-08-02T10:00:00Z",
      },
      {
        id: "att-3", // Newest
        ai_score: 100.0,
        confidence: 1.0,
        created_at: "2026-08-03T10:00:00Z",
      },
    ];

    // Top 3 recent: att-3 (100), att-2 (80), att-1 (60). att-ancient is ignored.
    // Expected: 100 * 0.50 + 80 * 0.30 + 60 * 0.20 = 50 + 24 + 12 = 86.0
    expect(computeNodeScore(attempts)).toBe(86.0);
  });

  it("should scale weights according to AI confidence and return breakdown", () => {
    const attempts: AssessmentAttemptInput[] = [
      {
        id: "att-low-confidence",
        ai_score: 100.0,
        confidence: 0.5, // Floored at 0.5
        created_at: "2026-08-02T10:00:00Z", // Newest
      },
      {
        id: "att-high-confidence",
        ai_score: 50.0,
        confidence: 1.0,
        created_at: "2026-08-01T10:00:00Z", // Oldest
      },
    ];

    const breakdown = computeNodeScoreWithBreakdown(attempts);

    expect(breakdown.validAttemptsCount).toBe(2);
    expect(breakdown.finalScore).toBeGreaterThan(0);
    expect(breakdown.contributions).toHaveLength(2);
  });
});
