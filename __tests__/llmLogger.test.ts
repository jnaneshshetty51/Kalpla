import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({ insert: mockInsert }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { logLLMCost } from "@/lib/llm/logger";

describe("lib/llm/logger.ts — logLLMCost (writes the cost_logs ledger every /admin/ai-cost number is derived from)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
  });

  it("inserts a real row using the real calculateCostUsd computation, not a hardcoded value", async () => {
    const cost = await logLLMCost({
      userId: "usr-1",
      feature: "tutor_chat",
      model: "claude-haiku-4-5",
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
    });

    expect(cost).toBeCloseTo(6.0, 6); // $1 in + $5 out per million
    expect(mockFrom).toHaveBeenCalledWith("cost_logs");
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: "usr-1",
      feature: "tutor_chat",
      model: "claude-haiku-4-5",
      tokens_in: 1_000_000,
      tokens_out: 1_000_000,
      cost_usd: 6.0,
    });
  });

  it("still returns the correct computed cost even when the DB insert fails, rather than throwing", async () => {
    mockInsert.mockResolvedValue({ error: { message: "insert failed" } });

    const cost = await logLLMCost({
      userId: "usr-1",
      feature: "tutor_chat",
      model: "claude-haiku-4-5",
      tokensIn: 100,
      tokensOut: 100,
    });

    expect(cost).toBeGreaterThan(0);
  });

  it("a zero-cost cache-hit log still writes a real row (for cache-hit-rate analytics), just with cost_usd 0", async () => {
    const cost = await logLLMCost({
      userId: "usr-1",
      feature: "tutor_chat_cache",
      model: "cache-hit",
      tokensIn: 0,
      tokensOut: 0,
    });

    expect(cost).toBe(0);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ model: "cache-hit", cost_usd: 0 }),
    );
  });
});
