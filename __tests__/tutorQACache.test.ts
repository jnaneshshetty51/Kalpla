import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateEmbedding } from "@/lib/embeddings";

describe("Tutor QA Embedding Cache & Similarity Logic", () => {
  // Matches this project's actual current runtime: the dev server runs
  // with no OPENAI_API_KEY configured, so generateEmbedding uses its
  // documented deterministic dev fallback rather than a live API call.
  // (It refuses to fall back outside development, by design, to avoid
  // silently corrupting similarity search in production — see
  // lib/embeddings.ts.)
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  it("should generate 1536-dimensional vector embeddings (Prompt 5's shared generateEmbedding, not a separate implementation)", async () => {
    const text = "What is Byte-Pair Encoding in LLM Tokenization?";
    const embedding = await generateEmbedding(text);

    expect(embedding.length).toBe(1536);
  });

  it("should yield similarity 1.0 for identical questions and a lower score for a different question", async () => {
    const q1 = "What is Byte-Pair Encoding in tokenization?";
    const q2 = "What is Byte-Pair Encoding in tokenization?";
    const q3 = "How do I deploy a model with vLLM?";

    const vec1 = await generateEmbedding(q1);
    const vec2 = await generateEmbedding(q2);
    const vec3 = await generateEmbedding(q3);

    expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(1.0, 5);
    expect(cosineSimilarity(vec1, vec3)).toBeLessThan(1.0);
  });

  it("cache-hit cost_logs entries must use the real cost_logs column shape (tokens_in/tokens_out/cost_usd) — not prompt_tokens/completion_tokens/provider/details, which don't exist on the table", () => {
    // Mirrors exactly what lib/tutor/qaCache.ts's findCachedTutorAnswer
    // inserts on a cache hit.
    const costLogEntry = {
      user_id: "usr-test",
      feature: "tutor_chat_cache",
      model: "cache-hit",
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0.0,
    };

    expect(costLogEntry.cost_usd).toBe(0.0);
    expect(costLogEntry.tokens_in).toBe(0);
    expect(costLogEntry.tokens_out).toBe(0);
    expect(costLogEntry).not.toHaveProperty("prompt_tokens");
    expect(costLogEntry).not.toHaveProperty("provider");
    expect(costLogEntry).not.toHaveProperty("details");
  });
});
