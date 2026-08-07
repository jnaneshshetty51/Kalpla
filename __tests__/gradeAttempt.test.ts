import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecuteLLMCallWithCap = vi.fn();
vi.mock("@/lib/llm/executeLLMCallWithCap", async (importOriginal) => {
  // Keep the REAL UsageCapExceededError class so `instanceof` checks in
  // gradeAttempt.ts still work against errors we throw from the mock.
  const actual = await importOriginal<typeof import("@/lib/llm/executeLLMCallWithCap")>();
  return {
    ...actual,
    executeLLMCallWithCap: (params: unknown) => mockExecuteLLMCallWithCap(params),
  };
});

vi.mock("@/lib/llm/models", () => ({
  resolveModelConfig: () => ({ provider: "anthropic", modelId: "claude-haiku-4-5" }),
}));

import { gradeAttemptWithLLM } from "@/lib/grading/gradeAttempt";
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";

const TASK = {
  id: "task-1",
  skill_node_id: "node-1",
  type: "short_answer",
  prompt: "Explain tokenization.",
  rubric: { criteria: [{ id: "comprehension", name: "Comprehension" }] },
};

const VALID_GRADING_JSON = JSON.stringify({
  score: 82,
  feedback: "Solid explanation.",
  criteriaBreakdown: [{ criterion: "Comprehension", met: true, note: "Clear." }],
  confidence: "high",
});

describe("lib/grading/gradeAttempt.ts — gradeAttemptWithLLM (AI grading, feeds real assessment scores)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the parsed grade on a valid first attempt, without a retry", async () => {
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: VALID_GRADING_JSON });

    const result = await gradeAttemptWithLLM({ task: TASK, response: { answer: "BPE splits text into subword tokens." }, userId: "usr-1" });

    expect(result.score).toBe(82);
    expect(result.confidence).toBe("high");
    expect(result.failedValidationAfterRetry).toBe(false);
    expect(mockExecuteLLMCallWithCap).toHaveBeenCalledTimes(1);
  });

  it("strips markdown code fences before parsing", async () => {
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: "```json\n" + VALID_GRADING_JSON + "\n```" });

    const result = await gradeAttemptWithLLM({ task: TASK, response: "some answer", userId: "usr-1" });
    expect(result.score).toBe(82);
  });

  it("retries once with an error-correction prompt when the first attempt returns invalid JSON, and succeeds on the retry", async () => {
    mockExecuteLLMCallWithCap
      .mockResolvedValueOnce({ content: "not valid json at all" })
      .mockResolvedValueOnce({ content: VALID_GRADING_JSON });

    const result = await gradeAttemptWithLLM({ task: TASK, response: "answer", userId: "usr-1" });

    expect(result.score).toBe(82);
    expect(result.failedValidationAfterRetry).toBe(false);
    expect(mockExecuteLLMCallWithCap).toHaveBeenCalledTimes(2);

    // The retry call includes the assistant's bad output and a correction instruction.
    const retryCallArgs = mockExecuteLLMCallWithCap.mock.calls[1][0] as { messages: Array<{ role: string; content: string }> };
    expect(retryCallArgs.messages.some((m) => m.role === "assistant" && m.content === "not valid json at all")).toBe(true);
    expect(retryCallArgs.messages.some((m) => m.role === "user" && m.content.includes("CRITICAL ERROR"))).toBe(true);
  });

  it("falls back to a safe generic grade when both the initial attempt and the retry fail validation", async () => {
    mockExecuteLLMCallWithCap
      .mockResolvedValueOnce({ content: "garbage" })
      .mockResolvedValueOnce({ content: "still garbage" });

    const result = await gradeAttemptWithLLM({ task: TASK, response: { answer: "a real attempt at an answer" }, userId: "usr-1" });

    expect(result.failedValidationAfterRetry).toBe(true);
    expect(result.score).toBe(75); // fallback: non-empty response
    expect(result.confidence).toBe("low");
  });

  it("fallback grading scores 0 for a genuinely empty response, not the non-empty default of 75", async () => {
    mockExecuteLLMCallWithCap.mockRejectedValue(new Error("provider unreachable"));

    const result = await gradeAttemptWithLLM({ task: TASK, response: "", userId: "usr-1" });

    expect(result.score).toBe(0);
    expect(result.failedValidationAfterRetry).toBe(true);
  });

  it("a schema-invalid JSON object (e.g. score out of range) is treated as a validation failure, not accepted", async () => {
    const outOfRange = JSON.stringify({ score: 150, feedback: "x", criteriaBreakdown: [], confidence: "high" });
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: outOfRange });

    const result = await gradeAttemptWithLLM({ task: TASK, response: "answer", userId: "usr-1" });
    // Both "attempts" get exhausted (same bad response mocked for both calls via mockResolvedValue) and fall back.
    expect(result.failedValidationAfterRetry).toBe(true);
  });

  it("a UsageCapExceededError from the LLM call propagates to the caller instead of being swallowed into a fallback grade", async () => {
    mockExecuteLLMCallWithCap.mockRejectedValue(
      new UsageCapExceededError({
        allowed: false,
        error: "usage_cap_exceeded",
        feature: "assessment_grading",
        resetDate: "2026-09-01T00:00:00.000Z",
        limit: 9,
        currentUsage: 9,
      }),
    );

    await expect(
      gradeAttemptWithLLM({ task: TASK, response: "answer", userId: "usr-1" }),
    ).rejects.toBeInstanceOf(UsageCapExceededError);
  });

  it("passes the real userId through to the capped LLM call for enforcement", async () => {
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: VALID_GRADING_JSON });
    await gradeAttemptWithLLM({ task: TASK, response: "answer", userId: "usr-specific-123" });

    expect(mockExecuteLLMCallWithCap).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "usr-specific-123", feature: "assessment_grading" }),
    );
  });

  it("extracts the 'code' field from a code-submission response shape, not the raw object", async () => {
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: VALID_GRADING_JSON });
    await gradeAttemptWithLLM({ task: TASK, response: { code: "def solve(): return 42" }, userId: "usr-1" });

    const callArgs = mockExecuteLLMCallWithCap.mock.calls[0][0] as { messages: Array<{ content: string }> };
    const userMessage = callArgs.messages.find((m) => m.content.includes("CANDIDATE RESPONSE"));
    expect(userMessage!.content).toContain("def solve(): return 42");
    expect(userMessage!.content).not.toContain('"code":');
  });
});
