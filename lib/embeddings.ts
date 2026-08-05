import { createClient } from "@/lib/supabase/server";
import {
  SimilaritySearchResult,
  StoreEmbeddingParams,
} from "@/types/embeddings";

const EMBEDDING_DIMENSION = 1536;

/**
 * Generate a 1536-dimensional vector embedding for the given input text.
 * Uses OpenAI's `text-embedding-3-small` model when OPENAI_API_KEY is configured.
 * In development environments without an API key, falls back to generating a
 * normalized 1536-element vector derived deterministically from the text.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey && process.env.NODE_ENV !== "development") {
    throw new Error(
      "Missing OPENAI_API_KEY environment variable. Refusing to generate a fake embedding outside development — it would silently corrupt similarity search.",
    );
  }

  if (apiKey) {
    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenAI API embedding request failed (${response.status}): ${errorText}`,
        );
      }

      const json = await response.json();
      const embedding = json?.data?.[0]?.embedding;

      if (
        !Array.isArray(embedding) ||
        embedding.length !== EMBEDDING_DIMENSION
      ) {
        throw new Error(
          `Invalid embedding returned from OpenAI API: expected ${EMBEDDING_DIMENSION} dimensions`,
        );
      }

      return embedding as number[];
    } catch (err) {
      console.warn("Failed to generate embedding via OpenAI API:", err);
      if (process.env.NODE_ENV !== "development") {
        throw err;
      }
    }
  }

  // Development Fallback: Generate a deterministic, normalized 1536-dim vector for testing
  console.warn(
    "[lib/embeddings] OPENAI_API_KEY not configured. Generating deterministic fallback embedding for development.",
  );

  return generateMockNormalizedVector(text, EMBEDDING_DIMENSION);
}

/**
 * Perform a vector similarity search using pgvector's cosine distance operator (<=>).
 * Calls the Supabase RPC function `match_embeddings`.
 *
 * @param queryEmbedding 1536-dimensional query vector
 * @param table Name of the embeddings table (defaults to "embeddings")
 * @param matchThreshold Minimum similarity score threshold (0.0 to 1.0)
 * @param matchCount Maximum number of matching rows to return
 * @param filterContentType Optional content_type filter string
 */
export async function similaritySearch(
  queryEmbedding: number[],
  table: string = "embeddings",
  matchThreshold: number = 0.0,
  matchCount: number = 10,
  filterContentType?: string,
): Promise<SimilaritySearchResult[]> {
  const supabase = await createClient();

  // If a custom table name is provided that isn't default "embeddings", execute raw/rpc query
  const rpcName =
    table === "embeddings" ? "match_embeddings" : `match_${table}`;

  const { data, error } = await supabase.rpc(rpcName, {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
    filter_content_type: filterContentType ?? null,
  });

  if (error) {
    console.error("Error executing similarity search RPC:", error);
    throw error;
  }

  return (data as SimilaritySearchResult[]) || [];
}

/**
 * Utility helper to generate an embedding for text and store it in the embeddings table.
 */
export async function storeEmbedding({
  content_type,
  content_id,
  text,
  metadata = {},
}: StoreEmbeddingParams) {
  const embedding = await generateEmbedding(text);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("embeddings")
    .insert({
      content_type,
      content_id: content_id ?? null,
      embedding,
      metadata,
    })
    .select()
    .single();

  if (error) {
    console.error("Error storing embedding:", error);
    throw error;
  }

  return data;
}

/**
 * Helper to generate a deterministic, unit-length normalized vector of size `dim`
 * from a text string for local offline testing.
 */
function generateMockNormalizedVector(text: string, dim: number): number[] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  const rawVector: number[] = new Array(dim);
  let sumSq = 0;

  for (let i = 0; i < dim; i++) {
    const val = Math.sin(hash + i);
    rawVector[i] = val;
    sumSq += val * val;
  }

  const magnitude = Math.sqrt(sumSq) || 1;
  return rawVector.map((val) => val / magnitude);
}
