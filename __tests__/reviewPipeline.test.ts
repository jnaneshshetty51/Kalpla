import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the cap-checked wrapper directly (not the raw provider) — this is
// what reviewSubmission.ts actually calls since Prompt 81 wired usage-cap
// enforcement into every LLM consumer. Keeps this file's real infra calls
// (checkUsageCap/logLLMCost/incrementUsage, which need a live DB) out of a
// unit test that's about grading logic, not cap enforcement — that's
// covered separately in usageCapEnforcement.test.ts.
const mockExecuteLLMCall = vi.fn();
vi.mock("@/lib/llm/executeLLMCallWithCap", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm/executeLLMCallWithCap")>(
    "@/lib/llm/executeLLMCallWithCap",
  );
  return {
    ...actual,
    executeLLMCallWithCap: (opts: unknown) => mockExecuteLLMCall(opts),
  };
});

import { reviewSubmission } from "@/lib/grading/reviewSubmission";

const RAG_PROJECT = {
  id: "proj-rag",
  name: "RAG Pipeline: Chunking & Retrieval Scorer",
  spec: {
    type: "rag" as const,
    description: "Implement chunking and cosine similarity.",
    requirements: ["chunk_text must return overlapping chunks", "cosine_similarity must handle zero vectors"],
  },
};

function wellFormedReviewJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    overall_score: 92,
    logic_correctness: { score: 95, summary: "Correctly implements chunking and cosine similarity." },
    readability: { score: 90, summary: "Clear naming and structure." },
    optimization_opportunities: { score: 85, summary: "Could vectorize with numpy, but not required." },
    edge_case_handling: { score: 90, summary: "Handles zero-magnitude vectors correctly." },
    architecture_quality: { score: 88, summary: "Reasonable separation of concerns." },
    genai_specific_criteria: [
      { name: "Chunking strategy reasonableness", met: true, note: "Overlap handled correctly." },
      { name: "Retrieval relevance", met: true, note: "Cosine similarity is standard and correct." },
    ],
    reflection_flag: null,
    confidence: "high",
    is_ambiguous: false,
    ...overrides,
  });
}

describe("lib/grading/reviewSubmission.ts (Prompt 66)", () => {
  beforeEach(() => {
    mockExecuteLLMCall.mockReset();
  });

  it("scores a well-formed, correct submission highly with genai-specific criteria populated", async () => {
    mockExecuteLLMCall.mockResolvedValueOnce({
      content: wellFormedReviewJson(),
      model: "claude-sonnet-5",
      provider: "anthropic",
      feature: "submission_review",
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });

    const review = await reviewSubmission({
      userId: "usr-test-123",
      project: RAG_PROJECT,
      code: "def chunk_text(text, chunk_size, overlap):\n    ...\n\ndef cosine_similarity(a, b):\n    ...",
      testResults: [
        { function: "chunk_text", passed: true },
        { function: "cosine_similarity", passed: true },
      ],
    });

    expect(review.overall_score).toBe(92);
    expect(review.confidence).toBe("high");
    expect(review.is_ambiguous).toBe(false);
    expect(review.genai_specific_criteria.length).toBeGreaterThan(0);
    expect(review.genai_specific_criteria.every((c) => c.met)).toBe(true);
    expect(review.failedValidationAfterRetry).toBe(false);
    expect(mockExecuteLLMCall).toHaveBeenCalledTimes(1);

    // Uses the expensive tier, distinct from Prompt 23's cheap-tier
    // general assessment grading.
    const callArgs = mockExecuteLLMCall.mock.calls[0][0];
    expect(callArgs.modelId).toBe("claude-sonnet-5");
    expect(callArgs.feature).toBe("submission_review");
  });

  it("handles an empty/near-empty submission gracefully — no crash, low score, actionable feedback, not flagged as a generic error", async () => {
    // Simulate the LLM call itself failing outright (e.g. provider error) —
    // the pipeline must not throw, and must fall back to a clear result.
    mockExecuteLLMCall.mockRejectedValue(new Error("provider unavailable"));

    const review = await reviewSubmission({
      userId: "usr-test-123",
      project: RAG_PROJECT,
      code: "",
      testResults: [],
    });

    expect(review.overall_score).toBe(0);
    expect(review.confidence).toBe("low");
    expect(review.failedValidationAfterRetry).toBe(true);
    expect(review.logic_correctness.summary.toLowerCase()).toContain("no code");
    // Actionable, not a generic "an error occurred" message.
    expect(review.logic_correctness.summary).not.toMatch(/^error$/i);
  });

  it("a malformed/syntactically-invalid submission still produces useful feedback rather than crashing or a generic error", async () => {
    // The LLM successfully reviews the (syntactically broken) code and
    // reports the issue as feedback — reviewSubmission doesn't execute
    // the code, so this exercises that a bad submission still flows
    // through to a specific, useful critique.
    mockExecuteLLMCall.mockResolvedValueOnce({
      content: wellFormedReviewJson({
        overall_score: 15,
        logic_correctness: {
          score: 0,
          summary: "The submission has a syntax error: 'def chunk_text(text, chunk_size, overlap)' is missing a colon, so this code will not run.",
        },
        edge_case_handling: { score: 0, summary: "Cannot evaluate edge case handling — code does not execute." },
        confidence: "high",
        is_ambiguous: false,
      }),
      model: "claude-sonnet-5",
      provider: "anthropic",
      feature: "submission_review",
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });

    const review = await reviewSubmission({
      userId: "usr-test-123",
      project: RAG_PROJECT,
      code: "def chunk_text(text, chunk_size, overlap)\n    return []", // missing colon
      testResults: [{ function: "chunk_text", passed: false, error: "SyntaxError: expected ':'" }],
    });

    expect(review.overall_score).toBeLessThan(50);
    expect(review.logic_correctness.summary).toContain("syntax error");
    expect(review.failedValidationAfterRetry).toBe(false);
    expect(review.logic_correctness.summary.length).toBeGreaterThan(20); // specific, not generic
  });

  it("retries once on malformed JSON from the model, then falls back safely without throwing if the retry also fails", async () => {
    mockExecuteLLMCall
      .mockResolvedValueOnce({
        content: "not valid json at all",
        model: "claude-sonnet-5",
        provider: "anthropic",
        feature: "submission_review",
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
      })
      .mockResolvedValueOnce({
        content: "still not valid json",
        model: "claude-sonnet-5",
        provider: "anthropic",
        feature: "submission_review",
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
      });

    const review = await reviewSubmission({
      userId: "usr-test-123",
      project: RAG_PROJECT,
      code: "def chunk_text(text, chunk_size, overlap):\n    return [text]",
      testResults: [{ function: "chunk_text", passed: false }],
    });

    expect(mockExecuteLLMCall).toHaveBeenCalledTimes(2); // one retry, then fallback — no crash
    expect(review.failedValidationAfterRetry).toBe(true);
    expect(review.confidence).toBe("low");
  });

  it("uses the agent-specific rubric (tool-use, planning, error handling) for an agent-type project, not the RAG rubric", async () => {
    mockExecuteLLMCall.mockResolvedValueOnce({
      content: wellFormedReviewJson({
        genai_specific_criteria: [
          { name: "Tool-use correctness", met: true, note: "Routes correctly." },
          { name: "Error handling on tool failure", met: false, note: "No try/except around tool calls." },
        ],
      }),
      model: "claude-sonnet-5",
      provider: "anthropic",
      feature: "submission_review",
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });

    await reviewSubmission({
      userId: "usr-test-123",
      project: {
        id: "proj-agent",
        name: "Agent Tool Router",
        spec: { type: "agent", description: "Route thoughts to tools.", requirements: ["route_action must classify correctly"] },
      },
      code: "def route_action(thought):\n    return 'answer'",
    });

    const systemPromptSent = mockExecuteLLMCall.mock.calls[0][0].messages[0].content;
    expect(systemPromptSent).toContain("Tool-use correctness");
    expect(systemPromptSent).toContain("Planning logic");
    expect(systemPromptSent).not.toContain("Chunking strategy reasonableness");
  });
});
