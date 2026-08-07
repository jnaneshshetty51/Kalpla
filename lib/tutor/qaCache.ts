import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding } from "@/lib/embeddings";

export interface FindCachedAnswerParams {
  userId?: string;
  skillNodeId: string;
  questionText: string;
  similarityThreshold?: number;
}

export interface CachedAnswerResult {
  cached: boolean;
  answerText?: string;
  similarity?: number;
}

/**
 * Searches public.tutor_qa_cache for a vector embedding match matching skillNodeId.
 * If similarity >= similarityThreshold, logs zero-cost savings and returns cached answer.
 */
export async function findCachedTutorAnswer({
  userId,
  skillNodeId,
  questionText,
  similarityThreshold = 0.90,
}: FindCachedAnswerParams): Promise<CachedAnswerResult> {
  try {
    const adminSupabase = createAdminClient();
    const embedding = await generateEmbedding(questionText, {
      userId,
      feature: "tutor_chat_cache_lookup",
    });

    // Call RPC procedure match_tutor_qa_cache
    const { data: matches, error: rpcErr } = await adminSupabase.rpc(
      "match_tutor_qa_cache",
      {
        query_embedding: JSON.stringify(embedding),
        match_threshold: similarityThreshold,
        match_count: 1,
        p_skill_node_id: skillNodeId,
      },
    );

    if (rpcErr) {
      console.warn("[lib/tutor/qaCache] RPC similarity search error:", rpcErr.message);
      return { cached: false };
    }

    if (matches && matches.length > 0) {
      const bestMatch = matches[0];

      // 1. Increment hit_count for cached record
      await adminSupabase
        .from("tutor_qa_cache")
        .update({ hit_count: (bestMatch.hit_count || 0) + 1, updated_at: new Date().toISOString() })
        .eq("id", bestMatch.id);

      // 2. Log a zero-cost hit in public.cost_logs so the cost dashboard
      // reflects the savings from skipping a fresh LLM call.
      if (userId) {
        try {
          await adminSupabase.from("cost_logs").insert({
            user_id: userId,
            feature: "tutor_chat_cache",
            model: "cache-hit",
            tokens_in: 0,
            tokens_out: 0,
            cost_usd: 0.0,
          });
        } catch (logErr) {
          console.warn("[lib/tutor/qaCache] Error logging zero-cost cache hit:", logErr);
        }
      }

      return {
        cached: true,
        answerText: bestMatch.answer_text,
        similarity: bestMatch.similarity,
      };
    }

    return { cached: false };
  } catch (err) {
    console.error("[lib/tutor/qaCache] Error in findCachedTutorAnswer:", err);
    return { cached: false };
  }
}

/**
 * Saves a new QA pair and question vector embedding into public.tutor_qa_cache for future cache hits.
 */
export async function saveTutorQACache({
  skillNodeId,
  questionText,
  answerText,
  userId,
}: {
  skillNodeId: string;
  questionText: string;
  answerText: string;
  userId?: string;
}): Promise<boolean> {
  try {
    const adminSupabase = createAdminClient();
    const embedding = await generateEmbedding(questionText, {
      userId,
      feature: "tutor_chat_cache_store",
    });

    const { error: insertErr } = await adminSupabase.from("tutor_qa_cache").insert({
      skill_node_id: skillNodeId,
      question_text: questionText.trim(),
      question_embedding: JSON.stringify(embedding),
      answer_text: answerText.trim(),
    });

    if (insertErr) {
      console.error("[lib/tutor/qaCache] Error saving QA cache row:", insertErr);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[lib/tutor/qaCache] Unexpected error saving QA cache:", err);
    return false;
  }
}
