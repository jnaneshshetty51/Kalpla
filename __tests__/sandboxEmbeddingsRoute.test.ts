import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  rateLimitedResponse: () => ({ error: "Too many requests — please wait before trying again.", code: "RATE_LIMITED" }),
}));

const mockGenerateEmbedding = vi.fn();
const mockSimilaritySearch = vi.fn();
vi.mock("@/lib/embeddings", () => ({
  generateEmbedding: (text: string, opts: unknown) => mockGenerateEmbedding(text, opts),
  similaritySearch: (...args: unknown[]) => mockSimilaritySearch(...args),
}));

const mockCheckUsageCap = vi.fn();
const mockIncrementUsage = vi.fn();
vi.mock("@/lib/llm/usageCap", () => ({
  checkUsageCap: (userId: string, feature: string) => mockCheckUsageCap(userId, feature),
  incrementUsage: (userId: string, feature: string) => mockIncrementUsage(userId, feature),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(result));
  return chain;
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { POST } from "@/app/api/sandbox/embeddings/route";

function req(body: unknown) {
  return new Request("http://localhost/api/sandbox/embeddings", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("app/api/sandbox/embeddings/route.ts — cap-gated store/search for the RAG sandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: null });
    mockCheckRateLimit.mockReturnValue(false);
    mockCheckUsageCap.mockResolvedValue({ allowed: true, tier: "free", currentUsage: 0, limit: 100 });
    mockFrom.mockReturnValue(makeChainable({ data: { id: "emb-1" }, error: null }));
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });
    const res = await POST(req({ action: "store", project_id: "p1", text: "hi" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on unparseable JSON body", async () => {
    const badReq = new Request("http://localhost/api/sandbox/embeddings", { method: "POST", body: "not json" });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("returns 400 when project_id is missing", async () => {
    const res = await POST(req({ action: "store", text: "hi" }));
    expect(res.status).toBe(400);
  });

  it("returns 429 with the cap result when the usage cap is exceeded, before doing any embedding work", async () => {
    mockCheckUsageCap.mockResolvedValue({ allowed: false, error: "usage_cap_exceeded", feature: "sandbox_embeddings", resetDate: "2026-09-01", limit: 100, currentUsage: 100 });

    const res = await POST(req({ action: "store", project_id: "p1", text: "hi" }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe("usage_cap_exceeded");
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid action", async () => {
    const res = await POST(req({ action: "delete", project_id: "p1" }));
    expect(res.status).toBe(400);
  });

  describe("action: store", () => {
    it("returns 400 when text is missing", async () => {
      const res = await POST(req({ action: "store", project_id: "p1" }));
      expect(res.status).toBe(400);
    });

    it("generates an embedding, increments usage, and inserts scoped to user:project", async () => {
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      let insertPayload: Record<string, unknown> | null = null;
      mockFrom.mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.insert = vi.fn((payload: Record<string, unknown>) => {
          insertPayload = payload;
          return chain;
        });
        chain.select = vi.fn(() => chain);
        chain.single = vi.fn(() => Promise.resolve({ data: { id: "emb-1" }, error: null }));
        return chain;
      });

      const res = await POST(req({ action: "store", project_id: "proj-1", text: "some chunk text" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe("emb-1");

      expect(mockGenerateEmbedding).toHaveBeenCalledWith("some chunk text", { userId: "usr-1", feature: "sandbox_embeddings" });
      expect(mockIncrementUsage).toHaveBeenCalledWith("usr-1", "sandbox_embeddings");
      expect(insertPayload).toMatchObject({
        content_type: "project_rag_sandbox",
        content_id: "usr-1:proj-1",
      });
      expect((insertPayload!.metadata as Record<string, unknown>).text).toBe("some chunk text");
      expect((insertPayload!.metadata as Record<string, unknown>).user_id).toBe("usr-1");
    });

    it("returns 500 when the insert fails", async () => {
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockFrom.mockReturnValue(makeChainable({ data: null, error: { message: "insert failed" } }));

      const res = await POST(req({ action: "store", project_id: "p1", text: "x" }));
      expect(res.status).toBe(500);
    });
  });

  describe("action: search", () => {
    it("returns 400 when query is missing", async () => {
      const res = await POST(req({ action: "search", project_id: "p1" }));
      expect(res.status).toBe(400);
    });

    it("scopes results to only this user+project's own stored chunks, filtering out other content_ids", async () => {
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockSimilaritySearch.mockResolvedValue([
        { content_id: "usr-1:proj-1", similarity: 0.95, metadata: { text: "mine" } },
        { content_id: "usr-2:proj-1", similarity: 0.99, metadata: { text: "someone else's" } },
      ]);

      const res = await POST(req({ action: "search", project_id: "proj-1", query: "what is RAG?" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.results).toEqual([{ text: "mine", similarity: 0.95 }]);
      expect(mockIncrementUsage).toHaveBeenCalledWith("usr-1", "sandbox_embeddings");
    });

    it("passes top_k through to similaritySearch, defaulting to 3 when omitted", async () => {
      mockGenerateEmbedding.mockResolvedValue([0.1]);
      mockSimilaritySearch.mockResolvedValue([]);

      await POST(req({ action: "search", project_id: "proj-1", query: "q" }));
      expect(mockSimilaritySearch).toHaveBeenCalledWith([0.1], "embeddings", 0.0, 3, "project_rag_sandbox");

      mockSimilaritySearch.mockClear();
      await POST(req({ action: "search", project_id: "proj-1", query: "q", top_k: 7 }));
      expect(mockSimilaritySearch).toHaveBeenCalledWith([0.1], "embeddings", 0.0, 7, "project_rag_sandbox");
    });
  });

  it("returns 500 when something throws unexpectedly", async () => {
    mockGetServerUser.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ action: "store", project_id: "p1", text: "x" }));
    expect(res.status).toBe(500);
  });
});
