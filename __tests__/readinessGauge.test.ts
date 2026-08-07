import { describe, it, expect } from "vitest";
import { computeReadinessGaugeStatus } from "@/lib/ui/readinessGaugeStatus";

describe("lib/ui/readinessGaugeStatus.ts — signature ReadinessGauge threshold math", () => {
  it("classifies score >= 80 as MASTERED with the correct positive delta", () => {
    const state = computeReadinessGaugeStatus(88, 70);
    expect(state.normalizedScore).toBe(88);
    expect(state.delta).toBe(18);
    expect(state.isMastered).toBe(true);
    expect(state.statusLabel).toBe("MASTERED");
  });

  it("classifies score between the benchmark and 79 as PRODUCTION READY, not MASTERED", () => {
    const state = computeReadinessGaugeStatus(74, 70);
    expect(state.normalizedScore).toBe(74);
    expect(state.delta).toBe(4);
    expect(state.isProdReady).toBe(true);
    expect(state.isMastered).toBe(false);
    expect(state.statusLabel).toBe("PRODUCTION READY");
  });

  it("classifies score below the benchmark but >= 40 as FOUNDATIONAL with negative delta", () => {
    const state = computeReadinessGaugeStatus(55, 70);
    expect(state.normalizedScore).toBe(55);
    expect(state.delta).toBe(-15);
    expect(state.isProdReady).toBe(false);
    expect(state.statusLabel).toBe("FOUNDATIONAL");
  });

  it("classifies score below 40 as GAP DETECTED", () => {
    const state = computeReadinessGaugeStatus(28, 70);
    expect(state.statusLabel).toBe("GAP DETECTED");
    expect(state.isFoundational).toBe(false);
  });

  it("exact boundary values land on the higher tier, not the lower one", () => {
    expect(computeReadinessGaugeStatus(80, 70).statusLabel).toBe("MASTERED");
    expect(computeReadinessGaugeStatus(70, 70).statusLabel).toBe("PRODUCTION READY");
    expect(computeReadinessGaugeStatus(40, 70).statusLabel).toBe("FOUNDATIONAL");
    expect(computeReadinessGaugeStatus(39, 70).statusLabel).toBe("GAP DETECTED");
  });

  it("clamps out-of-range scores to [0, 100] before computing status", () => {
    expect(computeReadinessGaugeStatus(120, 70).normalizedScore).toBe(100);
    expect(computeReadinessGaugeStatus(-15, 70).normalizedScore).toBe(0);
    expect(computeReadinessGaugeStatus(-15, 70).statusLabel).toBe("GAP DETECTED");
  });

  it("rounds fractional scores before applying thresholds (79.6 rounds up into PRODUCTION READY at benchmark 70, not truncated to 79)", () => {
    const state = computeReadinessGaugeStatus(79.6, 70);
    expect(state.normalizedScore).toBe(80);
    expect(state.statusLabel).toBe("MASTERED");
  });

  it("respects a custom benchmark, not just the default 70", () => {
    const state = computeReadinessGaugeStatus(60, 50);
    expect(state.isProdReady).toBe(true);
    expect(state.delta).toBe(10);
  });
});
