import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "update"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.upsert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => mockFrom(table) }),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  rateLimitedResponse: () => ({
    error: "Too many requests — please wait before trying again.",
    code: "RATE_LIMITED",
  }),
}));

const mockCheckUsageCap = vi.fn();
const mockIncrementUsage = vi.fn();
vi.mock("@/lib/llm/usageCap", () => ({
  checkUsageCap: (...args: unknown[]) => mockCheckUsageCap(...args),
  incrementUsage: (...args: unknown[]) => mockIncrementUsage(...args),
}));

const mockExecuteLLMCallStream = vi.fn();
vi.mock("@/lib/llm/providers", () => ({
  executeLLMCallStream: (...args: unknown[]) => mockExecuteLLMCallStream(...args),
}));

const mockResolveModelConfig = vi.fn();
vi.mock("@/lib/llm/models", () => ({
  resolveModelConfig: (...args: unknown[]) => mockResolveModelConfig(...args),
}));

const mockLogLLMCost = vi.fn();
vi.mock("@/lib/llm/logger", () => ({
  logLLMCost: (...args: unknown[]) => mockLogLLMCost(...args),
}));

const mockFindCachedTutorAnswer = vi.fn();
const mockSaveTutorQACache = vi.fn();
vi.mock("@/lib/tutor/qaCache", () => ({
  findCachedTutorAnswer: (...args: unknown[]) => mockFindCachedTutorAnswer(...args),
  saveTutorQACache: (...args: unknown[]) => mockSaveTutorQACache(...args),
}));

import { POST } from "@/app/api/tutor/chat/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/tutor/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function* defaultLLMStream() {
  yield { type: "delta" as const, text: "Hello " };
  yield { type: "delta" as const, text: "world" };
  yield {
    type: "done" as const,
    fullText: "Hello world",
    model: "claude-sonnet-5",
    provider: "anthropic" as const,
    usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
  };
}

describe("POST /api/tutor/chat/route.ts — 'explain differently' re-prompt branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "user-1" }, profile: null });
    mockCheckRateLimit.mockReturnValue(false);
    mockCheckUsageCap.mockResolvedValue({
      allowed: true,
      tier: "free",
      currentUsage: 0,
      limit: 30,
    });
    mockIncrementUsage.mockResolvedValue(undefined);
    mockResolveModelConfig.mockReturnValue({
      provider: "anthropic",
      modelId: "claude-sonnet-5",
      tier: "expensive",
    });
    mockFindCachedTutorAnswer.mockResolvedValue({ cached: false });
    mockSaveTutorQACache.mockResolvedValue(true);
    mockLogLLMCost.mockResolvedValue(0.01);
    mockExecuteLLMCallStream.mockImplementation(() => defaultLLMStream());

    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") {
        return makeChainable({
          data: { id: "node-1", name: "LLM Tokenization", category: "LLM Fundamentals" },
          error: null,
        });
      }
      if (table === "tutor_conversations") {
        return makeChainable({ data: null, error: null });
      }
      if (table === "lessons") {
        return makeChainable({ data: null, error: null });
      }
      return makeChainable({ data: null, error: null });
    });
  });

  it("does NOT include the EXPLAIN DIFFERENTLY block for a normal message, and still checks the cache", async () => {
    const res = await POST(makeRequest({ skill_node_id: "node-1", message: "What is BPE?" }));
    await res.text();

    const systemMessage = mockExecuteLLMCallStream.mock.calls[0][0].messages[0];
    expect(systemMessage.content).not.toContain("EXPLAIN DIFFERENTLY");
    expect(mockFindCachedTutorAnswer).toHaveBeenCalledTimes(1);
  });

  it("includes the EXPLAIN DIFFERENTLY block when re_prompt_mode is 'explain_differently'", async () => {
    const res = await POST(
      makeRequest({
        skill_node_id: "node-1",
        re_prompt_mode: "explain_differently",
        prior_explanation: "Tokenization breaks strings into integer token IDs using BPE.",
      }),
    );
    await res.text();

    const systemMessage = mockExecuteLLMCallStream.mock.calls[0][0].messages[0];
    expect(systemMessage.content).toContain("CRITICAL INSTRUCTION — EXPLAIN DIFFERENTLY");
    expect(systemMessage.content).toContain("Switch to a COMPLETELY DIFFERENT teaching approach");
    expect(systemMessage.content).toContain("Tokenization breaks strings into integer token IDs using BPE.");
  });

  it("includes the EXPLAIN DIFFERENTLY block whenever prior_explanation is set, even without re_prompt_mode", async () => {
    const res = await POST(
      makeRequest({
        skill_node_id: "node-1",
        message: "Try again please",
        prior_explanation: "Some prior explanation text.",
      }),
    );
    await res.text();

    const systemMessage = mockExecuteLLMCallStream.mock.calls[0][0].messages[0];
    expect(systemMessage.content).toContain("EXPLAIN DIFFERENTLY");
    expect(systemMessage.content).toContain("Some prior explanation text.");
  });

  it("uses prior_explanation from the request body when given, not the conversation history", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") {
        return makeChainable({
          data: { id: "node-1", name: "LLM Tokenization", category: "LLM Fundamentals" },
          error: null,
        });
      }
      if (table === "tutor_conversations") {
        return makeChainable({
          data: {
            messages: [
              { role: "user", content: "Q1" },
              { role: "assistant", content: "OLD ANSWER FROM HISTORY" },
            ],
          },
          error: null,
        });
      }
      if (table === "lessons") {
        return makeChainable({ data: null, error: null });
      }
      return makeChainable({ data: null, error: null });
    });

    const res = await POST(
      makeRequest({
        skill_node_id: "node-1",
        re_prompt_mode: "explain_differently",
        prior_explanation: "EXPLICIT PRIOR TEXT FROM REQUEST",
      }),
    );
    await res.text();

    const systemMessage = mockExecuteLLMCallStream.mock.calls[0][0].messages[0];
    expect(systemMessage.content).toContain("EXPLICIT PRIOR TEXT FROM REQUEST");
    expect(systemMessage.content).not.toContain("OLD ANSWER FROM HISTORY");
  });

  it("falls back to the last assistant message in history when prior_explanation isn't given", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") {
        return makeChainable({
          data: { id: "node-1", name: "LLM Tokenization", category: "LLM Fundamentals" },
          error: null,
        });
      }
      if (table === "tutor_conversations") {
        return makeChainable({
          data: {
            messages: [
              { role: "user", content: "Q1" },
              { role: "assistant", content: "FIRST ANSWER" },
              { role: "user", content: "Q2" },
              { role: "assistant", content: "LATEST ANSWER" },
            ],
          },
          error: null,
        });
      }
      if (table === "lessons") {
        return makeChainable({ data: null, error: null });
      }
      return makeChainable({ data: null, error: null });
    });

    const res = await POST(makeRequest({ skill_node_id: "node-1", re_prompt_mode: "explain_differently" }));
    await res.text();

    const systemMessage = mockExecuteLLMCallStream.mock.calls[0][0].messages[0];
    expect(systemMessage.content).toContain("LATEST ANSWER");
    expect(systemMessage.content).not.toContain("FIRST ANSWER");
  });

  it("skips the cache lookup entirely in explain-differently mode (re_prompt_mode)", async () => {
    const res = await POST(
      makeRequest({
        skill_node_id: "node-1",
        re_prompt_mode: "explain_differently",
        prior_explanation: "text",
      }),
    );
    await res.text();

    expect(mockFindCachedTutorAnswer).not.toHaveBeenCalled();
  });

  it("skips the cache lookup entirely when triggered via prior_explanation alone", async () => {
    const res = await POST(
      makeRequest({
        skill_node_id: "node-1",
        message: "Try again",
        prior_explanation: "text",
      }),
    );
    await res.text();

    expect(mockFindCachedTutorAnswer).not.toHaveBeenCalled();
  });
});
