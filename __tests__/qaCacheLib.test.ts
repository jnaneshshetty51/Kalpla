import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateEmbedding = vi.fn();
vi.mock("@/lib/embeddings", () => ({
  generateEmbedding: (text: string, opts: unknown) => mockGenerateEmbedding(text, opts),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => Promise.resolve(result));
  chain.insert = vi.fn(() => Promise.resolve(result));
  return chain;
}

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

import { findCachedTutorAnswer, saveTutorQACache } from "@/lib/tutor/qaCache";

describe("lib/tutor/qaCache.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockFrom.mockReturnValue(makeChainable({ data: null, error: null }));
  });

  describe("findCachedTutorAnswer", () => {
    it("calls the RPC with the given skill node, threshold, and a JSON-stringified embedding", async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      await findCachedTutorAnswer({ userId: "usr-1", skillNodeId: "node-1", questionText: "what is a token?", similarityThreshold: 0.85 });

      expect(mockGenerateEmbedding).toHaveBeenCalledWith("what is a token?", { userId: "usr-1", feature: "tutor_chat_cache_lookup" });
      expect(mockRpc).toHaveBeenCalledWith("match_tutor_qa_cache", {
        query_embedding: JSON.stringify([0.1, 0.2, 0.3]),
        match_threshold: 0.85,
        match_count: 1,
        p_skill_node_id: "node-1",
      });
    });

    it("defaults similarityThreshold to 0.90 when not provided", async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });
      await findCachedTutorAnswer({ skillNodeId: "node-1", questionText: "q" });
      expect(mockRpc).toHaveBeenCalledWith("match_tutor_qa_cache", expect.objectContaining({ match_threshold: 0.9 }));
    });

    it("returns cached:false (no throw) when the RPC errors", async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: "rpc down" } });
      const result = await findCachedTutorAnswer({ skillNodeId: "node-1", questionText: "q" });
      expect(result).toEqual({ cached: false });
    });

    it("returns cached:false when no matches are found above threshold", async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });
      const result = await findCachedTutorAnswer({ skillNodeId: "node-1", questionText: "q" });
      expect(result).toEqual({ cached: false });
    });

    it("on a cache hit: returns the cached answer, increments hit_count, and logs a zero-cost cost_logs row when userId is present", async () => {
      mockRpc.mockResolvedValue({
        data: [{ id: "cache-1", answer_text: "A token is...", similarity: 0.93, hit_count: 4 }],
        error: null,
      });

      let updatePayload: unknown = null;
      let costLogPayload: unknown = null;
      mockFrom.mockImplementation((table: string) => {
        if (table === "tutor_qa_cache") {
          const chain: Record<string, unknown> = {};
          chain.update = vi.fn((payload: unknown) => {
            updatePayload = payload;
            return chain;
          });
          chain.eq = vi.fn(() => Promise.resolve({ data: null, error: null }));
          return chain;
        }
        if (table === "cost_logs") {
          const chain: Record<string, unknown> = {};
          chain.insert = vi.fn((payload: unknown) => {
            costLogPayload = payload;
            return Promise.resolve({ data: null, error: null });
          });
          return chain;
        }
        return makeChainable({ data: null, error: null });
      });

      const result = await findCachedTutorAnswer({ userId: "usr-1", skillNodeId: "node-1", questionText: "q" });

      expect(result).toEqual({ cached: true, answerText: "A token is...", similarity: 0.93 });
      expect(updatePayload).toMatchObject({ hit_count: 5 });
      expect(costLogPayload).toMatchObject({
        user_id: "usr-1",
        feature: "tutor_chat_cache",
        model: "cache-hit",
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0.0,
      });
    });

    it("hit_count increments from 0 when the cached row's hit_count is missing/undefined", async () => {
      mockRpc.mockResolvedValue({ data: [{ id: "cache-1", answer_text: "A", similarity: 0.95 }], error: null });
      let updatePayload: unknown = null;
      mockFrom.mockImplementation((table: string) => {
        if (table === "tutor_qa_cache") {
          const chain: Record<string, unknown> = {};
          chain.update = vi.fn((payload: unknown) => {
            updatePayload = payload;
            return chain;
          });
          chain.eq = vi.fn(() => Promise.resolve({ data: null, error: null }));
          return chain;
        }
        return makeChainable({ data: null, error: null });
      });

      await findCachedTutorAnswer({ skillNodeId: "node-1", questionText: "q" });
      expect(updatePayload).toMatchObject({ hit_count: 1 });
    });

    it("does NOT attempt a cost_logs insert when no userId is provided on a cache hit", async () => {
      mockRpc.mockResolvedValue({ data: [{ id: "cache-1", answer_text: "A", similarity: 0.95, hit_count: 0 }], error: null });
      const insertSpy = vi.fn();
      mockFrom.mockImplementation((table: string) => {
        if (table === "cost_logs") {
          insertSpy();
          return makeChainable({ data: null, error: null });
        }
        return makeChainable({ data: null, error: null });
      });

      const result = await findCachedTutorAnswer({ skillNodeId: "node-1", questionText: "q" });
      expect(result.cached).toBe(true);
      expect(insertSpy).not.toHaveBeenCalled();
    });

    it("returns cached:false instead of throwing when generateEmbedding itself fails", async () => {
      mockGenerateEmbedding.mockRejectedValue(new Error("embedding service down"));
      const result = await findCachedTutorAnswer({ skillNodeId: "node-1", questionText: "q" });
      expect(result).toEqual({ cached: false });
    });

    it("a cache hit still returns normally even if the cost_logs insert itself throws (best-effort logging)", async () => {
      mockRpc.mockResolvedValue({ data: [{ id: "cache-1", answer_text: "A", similarity: 0.95, hit_count: 0 }], error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === "cost_logs") {
          return { insert: vi.fn(() => { throw new Error("logging failed"); }) };
        }
        return makeChainable({ data: null, error: null });
      });

      const result = await findCachedTutorAnswer({ userId: "usr-1", skillNodeId: "node-1", questionText: "q" });
      expect(result).toEqual({ cached: true, answerText: "A", similarity: 0.95 });
    });
  });

  describe("saveTutorQACache", () => {
    it("inserts a trimmed question/answer with a JSON-stringified embedding, and returns true on success", async () => {
      let insertPayload: Record<string, unknown> | null = null;
      mockFrom.mockImplementation(() => ({
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertPayload = payload;
          return Promise.resolve({ data: null, error: null });
        }),
      }));

      const result = await saveTutorQACache({
        skillNodeId: "node-1",
        questionText: "  what is a token?  ",
        answerText: "  A token is a unit of text.  ",
        userId: "usr-1",
      });

      expect(result).toBe(true);
      expect(insertPayload).toMatchObject({
        skill_node_id: "node-1",
        question_text: "what is a token?",
        answer_text: "A token is a unit of text.",
        question_embedding: JSON.stringify([0.1, 0.2, 0.3]),
      });
    });

    it("returns false (does not throw) when the insert errors", async () => {
      mockFrom.mockImplementation(() => ({
        insert: vi.fn(() => Promise.resolve({ data: null, error: { message: "insert failed" } })),
      }));

      const result = await saveTutorQACache({ skillNodeId: "node-1", questionText: "q", answerText: "a" });
      expect(result).toBe(false);
    });

    it("returns false (does not throw) when generateEmbedding fails", async () => {
      mockGenerateEmbedding.mockRejectedValue(new Error("embedding service down"));
      const result = await saveTutorQACache({ skillNodeId: "node-1", questionText: "q", answerText: "a" });
      expect(result).toBe(false);
    });
  });
});
