import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecuteLLMCallWithCap = vi.fn();
vi.mock("@/lib/llm/executeLLMCallWithCap", async (importOriginal) => {
  // Keep the REAL UsageCapExceededError class so `instanceof` checks made by
  // callers of this module (the route) still work against errors thrown here.
  const actual = await importOriginal<typeof import("@/lib/llm/executeLLMCallWithCap")>();
  return {
    ...actual,
    executeLLMCallWithCap: (params: unknown) => mockExecuteLLMCallWithCap(params),
  };
});

vi.mock("@/lib/llm/models", () => ({
  resolveModelConfig: () => ({ provider: "anthropic", modelId: "claude-sonnet-5", tier: "expensive" }),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { generateCaseStudy } from "@/lib/portfolio/generateCaseStudy";
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";

const SUBMISSION = {
  id: "sub-1",
  user_id: "usr-1",
  project_id: "proj-1",
  code: "def embed(x): return vectorize(x)",
  reflection: "The hardest part was handling empty inputs.",
  ai_review: null,
  metadata: null,
};

const PROJECT = { id: "proj-1", name: "Embedding Service", spec: { description: "Build an embedding microservice." } };

function defaultFromImpl(table: string) {
  if (table === "submissions") return makeChainable({ data: SUBMISSION, error: null });
  if (table === "projects") return makeChainable({ data: PROJECT, error: null });
  return makeChainable({ data: null, error: null });
}

describe("lib/portfolio/generateCaseStudy.ts — LLM-backed, usage-capped, cached case-study generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultFromImpl);
  });

  it("throws clearly when the submission doesn't exist, rather than generating for nothing", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "submissions") return makeChainable({ data: null, error: null });
      return defaultFromImpl(table);
    });

    await expect(generateCaseStudy({ submissionId: "sub-missing" })).rejects.toThrow(/Submission not found/);
    expect(mockExecuteLLMCallWithCap).not.toHaveBeenCalled();
  });

  it("throws when the submission fetch itself errors", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "submissions") return makeChainable({ data: null, error: { message: "connection reset" } });
      return defaultFromImpl(table);
    });

    await expect(generateCaseStudy({ submissionId: "sub-1" })).rejects.toThrow(/Submission not found/);
  });

  it("returns the cached case study without calling the LLM when one already exists and force is not set", async () => {
    const cached = { summary: "Cached case study.", cached: false, generated_at: "2026-08-01T00:00:00Z" };
    mockFrom.mockImplementation((table: string) => {
      if (table === "submissions") return makeChainable({ data: { ...SUBMISSION, metadata: { case_study: cached } }, error: null });
      return defaultFromImpl(table);
    });

    const result = await generateCaseStudy({ submissionId: "sub-1" });
    expect(result).toEqual({ ...cached, cached: true });
    expect(mockExecuteLLMCallWithCap).not.toHaveBeenCalled();
  });

  it("regenerates via the LLM even when a cached case study exists, if force is true", async () => {
    const cached = { summary: "Old cached case study.", cached: false, generated_at: "2026-08-01T00:00:00Z" };
    mockFrom.mockImplementation((table: string) => {
      if (table === "submissions") return makeChainable({ data: { ...SUBMISSION, metadata: { case_study: cached } }, error: null });
      return defaultFromImpl(table);
    });
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: "Brand new case study text." });

    const result = await generateCaseStudy({ submissionId: "sub-1", force: true });
    expect(result.summary).toBe("Brand new case study text.");
    expect(result.cached).toBe(false);
    expect(mockExecuteLLMCallWithCap).toHaveBeenCalledTimes(1);
  });

  it("calls the capped LLM with the real userId, feature, and a prompt grounded in the actual code and reflection", async () => {
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: "Generated case study." });

    await generateCaseStudy({ submissionId: "sub-1" });

    expect(mockExecuteLLMCallWithCap).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "usr-1",
        feature: "portfolio_case_study",
        provider: "anthropic",
        modelId: "claude-sonnet-5",
      }),
    );

    const callArgs = mockExecuteLLMCallWithCap.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain("def embed(x): return vectorize(x)");
    expect(userMessage).toContain("The hardest part was handling empty inputs.");
    expect(userMessage).toContain("Embedding Service");
  });

  it("includes reviewer notes in the prompt when an ai_review is present on the submission", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "submissions") {
        return makeChainable({
          data: {
            ...SUBMISSION,
            ai_review: {
              logic_correctness: { score: 90, summary: "Correctly handles the core embedding flow." },
              edge_case_handling: { score: 70, summary: "Misses empty-string inputs." },
            },
          },
          error: null,
        });
      }
      return defaultFromImpl(table);
    });
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: "x" });

    await generateCaseStudy({ submissionId: "sub-1" });

    const callArgs = mockExecuteLLMCallWithCap.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain("Correctly handles the core embedding flow.");
    expect(userMessage).toContain("Misses empty-string inputs.");
  });

  it("trims the LLM's raw output and stamps a fresh generated_at timestamp", async () => {
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: "  Case study with padding.  \n" });
    const result = await generateCaseStudy({ submissionId: "sub-1" });

    expect(result.summary).toBe("Case study with padding.");
    expect(new Date(result.generated_at).toString()).not.toBe("Invalid Date");
  });

  it("persists the generated case study onto the submission's metadata, merging rather than clobbering existing metadata keys", async () => {
    let capturedUpdate: Record<string, unknown> | null = null;
    mockFrom.mockImplementation((table: string) => {
      if (table === "submissions") {
        const chain = makeChainable({
          data: { ...SUBMISSION, metadata: { unrelated_key: "keep-me" } },
          error: null,
        });
        const originalUpdate = chain.update as (payload: Record<string, unknown>) => unknown;
        chain.update = vi.fn((payload: Record<string, unknown>) => {
          capturedUpdate = payload;
          return originalUpdate(payload);
        });
        return chain;
      }
      return defaultFromImpl(table);
    });
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: "New case study." });

    await generateCaseStudy({ submissionId: "sub-1" });

    expect(capturedUpdate).not.toBeNull();
    const metadata = (capturedUpdate as unknown as { metadata: { unrelated_key: string; case_study: { summary: string } } }).metadata;
    expect(metadata.unrelated_key).toBe("keep-me");
    expect(metadata.case_study.summary).toBe("New case study.");
  });

  it("propagates a UsageCapExceededError from the LLM call instead of swallowing it into a fake result", async () => {
    mockExecuteLLMCallWithCap.mockRejectedValue(
      new UsageCapExceededError({
        allowed: false,
        error: "usage_cap_exceeded",
        feature: "portfolio_case_study",
        resetDate: "2026-09-01T00:00:00.000Z",
        limit: 5,
        currentUsage: 5,
      }),
    );

    await expect(generateCaseStudy({ submissionId: "sub-1" })).rejects.toBeInstanceOf(UsageCapExceededError);
  });
});
