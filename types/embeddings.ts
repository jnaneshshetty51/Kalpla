export interface EmbeddingRecord {
  id: string;
  content_type: string;
  content_id: string | null;
  embedding: number[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SimilaritySearchResult {
  id: string;
  content_type: string;
  content_id: string | null;
  metadata: Record<string, unknown>;
  similarity: number;
}

export interface SimilaritySearchOptions {
  matchThreshold?: number;
  matchCount?: number;
  filterContentType?: string;
}

export interface StoreEmbeddingParams {
  content_type: string;
  content_id?: string;
  text: string;
  metadata?: Record<string, unknown>;
}
