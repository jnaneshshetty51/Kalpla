export interface ReadinessGaugeStatus {
  normalizedScore: number;
  delta: number;
  isMastered: boolean;
  isProdReady: boolean;
  isFoundational: boolean;
  statusLabel: "MASTERED" | "PRODUCTION READY" | "FOUNDATIONAL" | "GAP DETECTED";
}

/**
 * Pure threshold/status math behind the ReadinessGauge component, extracted
 * so it's testable without rendering React (this codebase's vitest setup
 * runs in a node environment, no DOM). components/ui/ReadinessGauge.tsx
 * imports this rather than recomputing it inline, so the component and its
 * tests can never drift from each other.
 */
export function computeReadinessGaugeStatus(
  score: number,
  benchmark: number = 70,
): ReadinessGaugeStatus {
  const normalizedScore = Math.min(Math.max(Math.round(score), 0), 100);
  const delta = normalizedScore - benchmark;
  const isMastered = normalizedScore >= 80;
  const isProdReady = normalizedScore >= benchmark;
  const isFoundational = normalizedScore >= 40;

  const statusLabel: ReadinessGaugeStatus["statusLabel"] = isMastered
    ? "MASTERED"
    : isProdReady
      ? "PRODUCTION READY"
      : isFoundational
        ? "FOUNDATIONAL"
        : "GAP DETECTED";

  return { normalizedScore, delta, isMastered, isProdReady, isFoundational, statusLabel };
}
