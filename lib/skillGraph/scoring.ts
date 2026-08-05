import {
  AssessmentAttemptInput,
  ScoringBreakdown,
  AttemptScoreContribution,
} from "@/types/scoring";

/** Base recency weights for up to the 3 most recent graded attempts */
const BASE_WEIGHTS_MAP: Record<number, number[]> = {
  1: [1.0],
  2: [0.6, 0.4],
  3: [0.5, 0.3, 0.2],
};

/**
 * Computes a 0–100 competency score for a skill node based on historical assessment attempts.
 *
 * ===============================================================================
 *                     COMPETENCY SCORE ROLLUP FORMULA
 * ===============================================================================
 * This function converts raw assessment attempt AI scores (0–100) into a single
 * explainable 0–100 skill mastery score.
 *
 * FORMULA SPECIFICATION:
 * 1. Filtering: Only graded attempts with a non-null `ai_score` (between 0 and 100) are included.
 * 2. Windowing: Selects up to the 3 most recent attempts sorted chronologically by `created_at` descending.
 * 3. Base Recency Weighting:
 *    - 3 attempts available: Attempt 1 (50%), Attempt 2 (30%), Attempt 3 (20%)
 *    - 2 attempts available: Attempt 1 (60%), Attempt 2 (40%)
 *    - 1 attempt available:  Attempt 1 (100%)
 *    - 0 attempts available: Competency score defaults to 0.00
 * 4. AI Confidence Adjustment:
 *    - If grading `confidence` (0.0 to 1.0) is present, the base weight is multiplied by
 *      `Math.max(0.5, Math.min(1.0, confidence))`. This ensures lower-confidence AI grades
 *      have reduced influence while preventing any single low-confidence grade from being ignored entirely.
 * 5. Normalization: Effective weights are normalized so their sum equals 1.0.
 * 6. Precision: Output is clamped between 0 and 100 and rounded to 2 decimal places.
 * ===============================================================================
 *
 * @param attempts List of user assessment attempts for a specific skill node
 * @returns Competency score between 0.00 and 100.00
 */
export function computeNodeScore(attempts: AssessmentAttemptInput[]): number {
  return computeNodeScoreWithBreakdown(attempts).finalScore;
}

/**
 * Computes the competency score along with a detailed mathematical breakdown
 * of individual attempt weights and score contributions for UI inspection and auditability.
 *
 * @param attempts List of user assessment attempts for a specific skill node
 * @returns ScoringBreakdown containing final score and detailed attempt contributions
 */
export function computeNodeScoreWithBreakdown(
  attempts: AssessmentAttemptInput[],
): ScoringBreakdown {
  if (!attempts || attempts.length === 0) {
    return {
      finalScore: 0,
      attemptsCount: 0,
      validAttemptsCount: 0,
      contributions: [],
    };
  }

  // 1. Filter valid graded attempts
  const validAttempts = attempts
    .filter(
      (a) =>
        a !== null &&
        typeof a.ai_score === "number" &&
        !isNaN(a.ai_score) &&
        a.ai_score >= 0 &&
        a.ai_score <= 100,
    )
    .sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA; // Descending (most recent first)
    });

  if (validAttempts.length === 0) {
    return {
      finalScore: 0,
      attemptsCount: attempts.length,
      validAttemptsCount: 0,
      contributions: [],
    };
  }

  // 2. Take top 3 most recent attempts
  const windowSize = Math.min(validAttempts.length, 3);
  const recentAttempts = validAttempts.slice(0, windowSize);
  const baseWeights = BASE_WEIGHTS_MAP[windowSize] || [1.0];

  // 3. Compute effective weights incorporating AI confidence
  const rawEffectiveWeights: number[] = [];
  let totalEffectiveWeight = 0;

  for (let i = 0; i < recentAttempts.length; i++) {
    const attempt = recentAttempts[i];
    const baseWeight = baseWeights[i];

    // Floor confidence at 0.5 to maintain baseline weight stability
    const rawConfidence =
      typeof attempt.confidence === "number" && !isNaN(attempt.confidence)
        ? attempt.confidence
        : 1.0;
    const clampedConfidence = Math.max(0.5, Math.min(1.0, rawConfidence));

    const effectiveWeight = baseWeight * clampedConfidence;
    rawEffectiveWeights.push(effectiveWeight);
    totalEffectiveWeight += effectiveWeight;
  }

  // 4. Normalize weights and calculate weighted sum
  const contributions: AttemptScoreContribution[] = [];
  let weightedSum = 0;

  for (let i = 0; i < recentAttempts.length; i++) {
    const attempt = recentAttempts[i];
    const rawScore = attempt.ai_score!;
    const normalizedWeight =
      totalEffectiveWeight > 0
        ? rawEffectiveWeights[i] / totalEffectiveWeight
        : 1 / recentAttempts.length;

    const contribution = rawScore * normalizedWeight;
    weightedSum += contribution;

    contributions.push({
      attemptId: attempt.id,
      rawScore,
      weight: Math.round(normalizedWeight * 10000) / 10000,
      confidence:
        typeof attempt.confidence === "number" ? attempt.confidence : 1.0,
      contribution: Math.round(contribution * 100) / 100,
      createdAt: new Date(attempt.created_at).toISOString(),
    });
  }

  // 5. Clamp between 0 and 100 and round to 2 decimal places
  const clampedScore = Math.max(0, Math.min(100, weightedSum));
  const finalScore = Math.round(clampedScore * 100) / 100;

  return {
    finalScore,
    attemptsCount: attempts.length,
    validAttemptsCount: validAttempts.length,
    contributions,
  };
}
