import { describe, it, expect } from "vitest";
import { calculateCostUsd, MODEL_PRICING } from "@/lib/llm/pricing";

describe("lib/llm/pricing.ts — calculateCostUsd (money-critical: feeds cost_logs and /admin/ai-cost)", () => {
  it("computes cost from real per-model input/output rates, not a flat rate", () => {
    // claude-haiku-4-5: $1.00/$5.00 per million
    const cost = calculateCostUsd("claude-haiku-4-5", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(1.0 + 5.0, 6);
  });

  it("input and output tokens are priced independently, not averaged", () => {
    // sonnet-5: $3.00 in / $15.00 out per million. 500k in, 100k out.
    const cost = calculateCostUsd("claude-sonnet-5", 500_000, 100_000);
    const expected = (500_000 / 1_000_000) * 3.0 + (100_000 / 1_000_000) * 15.0;
    expect(cost).toBeCloseTo(expected, 6);
  });

  it("an embedding model with 0 output rate never charges for output tokens", () => {
    const cost = calculateCostUsd("text-embedding-3-small", 1_000_000, 500_000);
    // output rate is 0, so completionTokens shouldn't matter at all
    const costWithZeroOutput = calculateCostUsd("text-embedding-3-small", 1_000_000, 0);
    expect(cost).toBe(costWithZeroOutput);
    expect(cost).toBeCloseTo(0.02, 6);
  });

  it("an unrecognized model ID falls back to the documented fallback rate instead of throwing or returning 0", () => {
    const cost = calculateCostUsd("some-future-unlisted-model", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(1.0 + 5.0, 6); // fallback: $1/$5 per million
    expect(cost).toBeGreaterThan(0);
  });

  it("zero tokens (e.g. a cache-hit marker) always costs exactly 0, regardless of which rate table is hit", () => {
    expect(calculateCostUsd("cache-hit", 0, 0)).toBe(0);
    expect(calculateCostUsd("claude-sonnet-5", 0, 0)).toBe(0);
  });

  it("rounds to 6 decimal places, matching the numeric(10,6) cost_logs column", () => {
    const cost = calculateCostUsd("claude-haiku-4-5", 137, 89);
    const decimalPlaces = cost.toString().split(".")[1]?.length ?? 0;
    expect(decimalPlaces).toBeLessThanOrEqual(6);
  });

  it("every model in the pricing table has non-negative rates", () => {
    for (const [modelId, rates] of Object.entries(MODEL_PRICING)) {
      expect(rates.inputPerMillionUsd, `${modelId} input rate`).toBeGreaterThanOrEqual(0);
      expect(rates.outputPerMillionUsd, `${modelId} output rate`).toBeGreaterThanOrEqual(0);
    }
  });
});
