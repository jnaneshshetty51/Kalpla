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

describe("POST /api/tutor/chat/route.ts — conversation history read/resume & persistence", () => {
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
          data: { id: "node-1", name: "RAG", category: "Retrieval" },
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

  it("loads existing conversation history and forwards it to the LLM as prior turns", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") {
        return makeChainable({
          data: { id: "node-1", name: "RAG", category: "Retrieval" },
          error: null,
        });
      }
      if (table === "tutor_conversations") {
        return makeChainable({
          data: {
            messages: [
              { role: "user", content: "What is RAG?", timestamp: "10:00 AM" },
              { role: "assistant", content: "RAG stands for Retrieval-Augmented Generation.", timestamp: "10:01 AM" },
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

    const res = await POST(makeRequest({ skill_node_id: "node-1", message: "Explain more" }));
    await res.text();

    const messages = mockExecuteLLMCallStream.mock.calls[0][0].messages;
    // [system, ...existing history, new user turn]
    expect(messages).toHaveLength(4);
    expect(messages[1]).toMatchObject({ role: "user", content: "What is RAG?" });
    expect(messages[2]).toMatchObject({ role: "assistant", content: "RAG stands for Retrieval-Augmented Generation." });
    expect(messages[3]).toMatchObject({ role: "user", content: "Explain more" });
  });

  it("starts from an empty history for a brand-new conversation with no existing row", async () => {
    const res = await POST(makeRequest({ skill_node_id: "node-1", message: "What is RAG?" }));
    await res.text();

    const messages = mockExecuteLLMCallStream.mock.calls[0][0].messages;
    expect(messages).toHaveLength(2); // system + new user turn only
    expect(messages[0].role).toBe("system");
    expect(messages[1]).toMatchObject({ role: "user", content: "What is RAG?" });
  });

  it("persistExchange upserts with onConflict 'user_id, skill_node_id' and the correct appended user+assistant turns", async () => {
    const upsertCalls: Array<{ payload: Record<string, unknown>; options: unknown }> = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") {
        return makeChainable({
          data: { id: "node-1", name: "RAG", category: "Retrieval" },
          error: null,
        });
      }
      if (table === "tutor_conversations") {
        const chain = makeChainable({
          data: {
            messages: [
              { role: "user", content: "Prior Q", timestamp: "9:00 AM" },
              { role: "assistant", content: "Prior A", timestamp: "9:01 AM" },
            ],
          },
          error: null,
        });
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

    const res = await POST(makeRequest({ skill_node_id: "node-1", message: "Follow-up Q" }));
    await res.text();

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].options).toEqual({ onConflict: "user_id, skill_node_id" });
    expect(upsertCalls[0].payload.user_id).toBe("user-1");
    expect(upsertCalls[0].payload.skill_node_id).toBe("node-1");

    const persistedMessages = upsertCalls[0].payload.messages as Array<{ role: string; content: string }>;
    expect(persistedMessages).toHaveLength(4);
    expect(persistedMessages[0]).toMatchObject({ role: "user", content: "Prior Q" });
    expect(persistedMessages[1]).toMatchObject({ role: "assistant", content: "Prior A" });
    expect(persistedMessages[2]).toMatchObject({ role: "user", content: "Follow-up Q" });
    expect(persistedMessages[3]).toMatchObject({ role: "assistant", content: "Hello world" });
  });

  it("on a cache hit, still persists the exchange and increments usage, but does NOT log LLM cost", async () => {
    mockFindCachedTutorAnswer.mockResolvedValue({
      cached: true,
      answerText: "Cached answer text.",
      similarity: 0.95,
    });

    const upsertCalls: Array<{ payload: Record<string, unknown>; options: unknown }> = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") {
        return makeChainable({
          data: { id: "node-1", name: "RAG", category: "Retrieval" },
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

    const res = await POST(makeRequest({ skill_node_id: "node-1", message: "What is RAG?" }));
    expect(res.headers.get("X-Cache-Hit")).toBe("true");
    const text = await res.text();
    expect(text).toBe("Cached answer text.");

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].options).toEqual({ onConflict: "user_id, skill_node_id" });
    const persistedMessages = upsertCalls[0].payload.messages as Array<{ role: string; content: string }>;
    expect(persistedMessages).toHaveLength(2);
    expect(persistedMessages[0]).toMatchObject({ role: "user", content: "What is RAG?" });
    expect(persistedMessages[1]).toMatchObject({ role: "assistant", content: "Cached answer text." });

    expect(mockIncrementUsage).toHaveBeenCalledWith("user-1", "tutor_chat");
    expect(mockLogLLMCost).not.toHaveBeenCalled();
    expect(mockExecuteLLMCallStream).not.toHaveBeenCalled();
  });
});
