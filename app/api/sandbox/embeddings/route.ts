import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding, similaritySearch } from "@/lib/embeddings";
import { checkUsageCap, incrementUsage } from "@/lib/llm/usageCap";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

const SANDBOX_CONTENT_TYPE = "project_rag_sandbox";
const SANDBOX_EMBEDDINGS_FEATURE = "sandbox_embeddings";

/**
 * Backs the sandbox's store_document_chunk/search_similar_chunks Python
 * shims (Prompt 69) — the RAG Chatbot project uses the platform's real
 * pgvector-backed public.embeddings table (Prompt 5) as its actual
 * retrieval store, not a simulated in-sandbox structure. Scoped per
 * (user, project) via content_id so different users' practice data don't
 * semantically collide.
 */
export async function POST(request: Request) {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    // Generous ceiling relative to sibling AI routes — a single RAG
    // exercise legitimately calls this many times in a burst while
    // indexing a document's chunks, not just once per user action.
    if (checkRateLimit(user.id, "sandbox_embeddings", 30, 60_000)) {
      return NextResponse.json(rateLimitedResponse(), { status: 429 });
    }

    let body: {
      action?: "store" | "search";
      project_id?: string;
      text?: string;
      query?: string;
      top_k?: number;
      metadata?: Record<string, unknown>;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { action, project_id } = body;
    if (!project_id || typeof project_id !== "string") {
      return NextResponse.json({ error: "Missing 'project_id'" }, { status: 400 });
    }

    const contentId = `${user.id}:${project_id}`;
    const adminSupabase = createAdminClient();

    // Previously uncapped and untracked: generateEmbedding called OpenAI
    // directly with no cost_logs entry and no usage-cap check at all, so a
    // user could store/search unlimited chunks for free with zero
    // visibility on the cost dashboard. Gated the same way every other
    // AI-consuming route in this app is (Prompt 81/84).
    const capResult = await checkUsageCap(user.id, SANDBOX_EMBEDDINGS_FEATURE);
    if (!capResult.allowed) {
      return NextResponse.json(capResult, { status: 429 });
    }

    if (action === "store") {
      const { text, metadata } = body;
      if (!text || typeof text !== "string") {
        return NextResponse.json({ error: "Missing 'text'" }, { status: 400 });
      }

      const embedding = await generateEmbedding(text, {
        userId: user.id,
        feature: SANDBOX_EMBEDDINGS_FEATURE,
      });
      await incrementUsage(user.id, SANDBOX_EMBEDDINGS_FEATURE);
      const { data, error } = await adminSupabase
        .from("embeddings")
        .insert({
          content_type: SANDBOX_CONTENT_TYPE,
          content_id: contentId,
          embedding,
          metadata: { ...(metadata || {}), text, user_id: user.id, project_id },
        })
        .select("id")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ id: data.id });
    }

    if (action === "search") {
      const { query, top_k } = body;
      if (!query || typeof query !== "string") {
        return NextResponse.json({ error: "Missing 'query'" }, { status: 400 });
      }

      const queryEmbedding = await generateEmbedding(query, {
        userId: user.id,
        feature: SANDBOX_EMBEDDINGS_FEATURE,
      });
      await incrementUsage(user.id, SANDBOX_EMBEDDINGS_FEATURE);
      const results = await similaritySearch(
        queryEmbedding,
        "embeddings",
        0.0,
        top_k || 3,
        SANDBOX_CONTENT_TYPE,
      );

      // Scope results to this user+project's own stored chunks only (the
      // RLS on embeddings is read-broad by design from Prompt 5; this
      // route enforces the practical isolation instead).
      const scoped = results.filter((r) => r.content_id === contentId);

      return NextResponse.json({
        results: scoped.map((r) => ({
          text: (r.metadata as { text?: string })?.text || "",
          similarity: r.similarity,
        })),
      });
    }

    return NextResponse.json({ error: "Invalid 'action': expected 'store' or 'search'" }, { status: 400 });
  } catch (err) {
    console.error("Error in POST /api/sandbox/embeddings:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
