import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCheckUsageCap = vi.fn();
const mockIncrementUsage = vi.fn();
vi.mock("@/lib/llm/usageCap", () => ({
  checkUsageCap: (userId: string, feature: string) => mockCheckUsageCap(userId, feature),
  incrementUsage: (userId: string, feature: string) => mockIncrementUsage(userId, feature),
}));

const mockLogLLMCost = vi.fn().mockResolvedValue(0.001);
vi.mock("@/lib/llm/logger", () => ({
  logLLMCost: (params: unknown) => mockLogLLMCost(params),
}));

const mockExecuteLLMCall = vi.fn();
vi.mock("@/lib/llm/providers", () => ({
  executeLLMCall: (opts: unknown) => mockExecuteLLMCall(opts),
  executeLLMCallStream: vi.fn(),
}));

import { executeLLMCallWithCap, UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";

describe("lib/llm/executeLLMCallWithCap.ts (Prompt 81/84)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows the call through and increments usage when under the cap", async () => {
    mockCheckUsageCap.mockResolvedValue({ allowed: true, tier: "free", currentUsage: 5, limit: 30 });
    mockExecuteLLMCall.mockResolvedValue({
      content: "hello",
      model: "claude-haiku-4-5",
      provider: "anthropic",
      feature: "tutor_chat",
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });

    const result = await executeLLMCallWithCap({
      userId: "usr-1",
      provider: "anthropic",
      modelId: "claude-haiku-4-5",
      feature: "tutor_chat",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.content).toBe("hello");
    expect(mockCheckUsageCap).toHaveBeenCalledWith("usr-1", "tutor_chat");
    expect(mockExecuteLLMCall).toHaveBeenCalledTimes(1);
    expect(mockLogLLMCost).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "usr-1", feature: "tutor_chat" }),
    );
    expect(mockIncrementUsage).toHaveBeenCalledWith("usr-1", "tutor_chat");
  });

  it("throws UsageCapExceededError and never calls the model when the cap is already reached", async () => {
    mockCheckUsageCap.mockResolvedValue({
      allowed: false,
      error: "usage_cap_exceeded",
      feature: "tutor_chat",
      resetDate: "2026-09-01T00:00:00.000Z",
      limit: 30,
      currentUsage: 30,
    });

    await expect(
      executeLLMCallWithCap({
        userId: "usr-2",
        provider: "anthropic",
        modelId: "claude-haiku-4-5",
        feature: "tutor_chat",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow(UsageCapExceededError);

    // No spend, no increment — the block happens before any real work.
    expect(mockExecuteLLMCall).not.toHaveBeenCalled();
    expect(mockLogLLMCost).not.toHaveBeenCalled();
    expect(mockIncrementUsage).not.toHaveBeenCalled();
  });

  it("attaches the real cap details to the thrown error for the route handler to translate into a 429", async () => {
    const details = {
      allowed: false as const,
      error: "usage_cap_exceeded" as const,
      feature: "assessment_grading",
      resetDate: "2026-09-01T00:00:00.000Z",
      limit: 9,
      currentUsage: 9,
    };
    mockCheckUsageCap.mockResolvedValue(details);

    try {
      await executeLLMCallWithCap({
        userId: "usr-3",
        provider: "anthropic",
        modelId: "claude-haiku-4-5",
        feature: "assessment_grading",
        messages: [{ role: "user", content: "hi" }],
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UsageCapExceededError);
      expect((err as UsageCapExceededError).details).toEqual(details);
    }
  });

  it("sets usageWarning once this call crosses 80% of the tier cap, but not below it", async () => {
    mockExecuteLLMCall.mockResolvedValue({
      content: "ok",
      model: "claude-haiku-4-5",
      provider: "anthropic",
      feature: "tutor_chat",
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    });

    // free tier tutor limit is 30 (lib/llm/limits.ts) — currentUsage 23 means
    // this call becomes the 24th, 80.0% of 30 -> warning should fire.
    mockCheckUsageCap.mockResolvedValue({ allowed: true, tier: "free", currentUsage: 23, limit: 30 });
    const nearCap = await executeLLMCallWithCap({
      userId: "usr-4",
      provider: "anthropic",
      modelId: "claude-haiku-4-5",
      feature: "tutor_chat",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(nearCap.usageWarning).toBeDefined();
    expect(nearCap.usageWarning?.percentUsed).toBeGreaterThanOrEqual(80);

    // Well under the threshold -> no warning.
    mockCheckUsageCap.mockResolvedValue({ allowed: true, tier: "free", currentUsage: 2, limit: 30 });
    const farFromCap = await executeLLMCallWithCap({
      userId: "usr-5",
      provider: "anthropic",
      modelId: "claude-haiku-4-5",
      feature: "tutor_chat",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(farFromCap.usageWarning).toBeUndefined();
  });

  it("never warns for an unlimited (premium) tier", async () => {
    mockCheckUsageCap.mockResolvedValue({ allowed: true, tier: "premium", currentUsage: 9999, limit: Infinity });
    mockExecuteLLMCall.mockResolvedValue({
      content: "ok",
      model: "claude-sonnet-5",
      provider: "anthropic",
      feature: "tutor_chat",
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    });

    const result = await executeLLMCallWithCap({
      userId: "usr-6",
      provider: "anthropic",
      modelId: "claude-sonnet-5",
      feature: "tutor_chat",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.usageWarning).toBeUndefined();
  });
});
