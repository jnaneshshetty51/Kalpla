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

// Real, deterministic pure functions — not mocked (per audit guidance).
// import left implicit; route imports these directly from lib/llm/limits.

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

describe("POST /api/tutor/chat/route.ts — core request lifecycle", () => {
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
          data: { id: "node-1", name: "Vector Search", category: "Embeddings & Retrieval" },
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

  it("returns 401 when unauthenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });

    const res = await POST(makeRequest({ skill_node_id: "node-1", message: "hi" }));

    expect(res.status).toBe(401);
    expect(mockExecuteLLMCallStream).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockReturnValue(true);

    const res = await POST(makeRequest({ skill_node_id: "node-1", message: "hi" }));

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.code).toBe("RATE_LIMITED");
    expect(mockExecuteLLMCallStream).not.toHaveBeenCalled();
  });

  it("returns 429 with cap details when the usage cap is exceeded, without ever calling the LLM", async () => {
    const capResult = {
      allowed: false,
      error: "usage_cap_exceeded",
      feature: "tutor_chat",
      resetDate: "2026-09-01T00:00:00.000Z",
      limit: 30,
      currentUsage: 30,
    };
    mockCheckUsageCap.mockResolvedValue(capResult);

    const res = await POST(makeRequest({ skill_node_id: "node-1", message: "hi" }));

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json).toEqual(capResult);
    expect(mockExecuteLLMCallStream).not.toHaveBeenCalled();
  });

  it("embeds the fetched lesson's title, content, and code example into the system prompt", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") {
        return makeChainable({
          data: { id: "node-1", name: "Vector Search & Indexing", category: "Embeddings & Retrieval" },
          error: null,
        });
      }
      if (table === "tutor_conversations") {
        return makeChainable({ data: null, error: null });
      }
      if (table === "lessons") {
        return makeChainable({
          data: {
            title: "Intro to HNSW",
            content_markdown: "HNSW builds a multi-layer graph for approximate nearest neighbor search.",
            code_example: "index = hnswlib.Index(space='cosine', dim=128)",
          },
          error: null,
        });
      }
      return makeChainable({ data: null, error: null });
    });

    const res = await POST(makeRequest({ skill_node_id: "node-1", message: "What is HNSW?" }));
    await res.text();

    expect(mockExecuteLLMCallStream).toHaveBeenCalledTimes(1);
    const callArgs = mockExecuteLLMCallStream.mock.calls[0][0];
    const systemMessage = callArgs.messages[0];
    expect(systemMessage.role).toBe("system");
    expect(systemMessage.content).toContain("Vector Search & Indexing (Embeddings & Retrieval)");
    expect(systemMessage.content).toContain("Intro to HNSW");
    expect(systemMessage.content).toContain("HNSW builds a multi-layer graph");
    expect(systemMessage.content).toContain("index = hnswlib.Index(space='cosine', dim=128)");
  });

  it("falls back to generic lesson context when no lesson row exists", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") {
        return makeChainable({
          data: { id: "node-2", name: "Prompt Engineering", category: "LLM Fundamentals" },
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

    const res = await POST(makeRequest({ skill_node_id: "node-2", message: "Explain prompting" }));
    await res.text();

    const systemMessage = mockExecuteLLMCallStream.mock.calls[0][0].messages[0];
    expect(systemMessage.content).toContain("General concepts of Prompt Engineering in GenAI Engineering.");
  });

  it("streams delta chunks through to the response body", async () => {
    mockExecuteLLMCallStream.mockImplementation(async function* () {
      yield { type: "delta" as const, text: "The " };
      yield { type: "delta" as const, text: "answer " };
      yield { type: "delta" as const, text: "is 42." };
      yield {
        type: "done" as const,
        fullText: "The answer is 42.",
        model: "claude-sonnet-5",
        provider: "anthropic" as const,
        usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
      };
    });

    const res = await POST(makeRequest({ skill_node_id: "node-1", message: "What is the answer?" }));

    expect(res.headers.get("X-Cache-Hit")).toBe("false");
    const text = await res.text();
    expect(text).toBe("The answer is 42.");
  });

  it("on stream completion, logs LLM cost, increments usage, and persists the conversation", async () => {
    const upsertCalls: Array<{ payload: Record<string, unknown>; options: unknown }> = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") {
        return makeChainable({
          data: { id: "node-1", name: "Vector Search", category: "Embeddings & Retrieval" },
          error: null,
        });
      }
      if (table === "tutor_conversations") {
        const chain = makeChainable({ data: null, error: null });
        chain.upsert = vi.fn((payload: Record<string, unknown>, options: unknown) => {
          upsertCalls.push({ payload, options });
          return Promise.resolve({ data: null, error: null });
        });
        return chain;
      }
      if (table === "lessons") {
        return makeChainable({ data: null, error: null });
      }
      return makeChainable({ data: null, error: null });
    });

    const res = await POST(makeRequest({ skill_node_id: "node-1", message: "What is HNSW?" }));
    await res.text();

    expect(mockLogLLMCost).toHaveBeenCalledWith({
      userId: "user-1",
      feature: "tutor_chat",
      model: "claude-sonnet-5",
      tokensIn: 100,
      tokensOut: 20,
    });
    expect(mockIncrementUsage).toHaveBeenCalledWith("user-1", "tutor_chat");

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].options).toEqual({ onConflict: "user_id, skill_node_id" });
    expect(upsertCalls[0].payload).toMatchObject({
      user_id: "user-1",
      skill_node_id: "node-1",
      messages: [
        expect.objectContaining({ role: "user", content: "What is HNSW?" }),
        expect.objectContaining({ role: "assistant", content: "Hello world" }),
      ],
    });
  });
});
