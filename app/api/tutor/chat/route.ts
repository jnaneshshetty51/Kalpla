import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeLLMCallStream } from "@/lib/llm/providers";
import { resolveModelConfig } from "@/lib/llm/models";
import { logLLMCost } from "@/lib/llm/logger";
import { checkUsageCap, incrementUsage } from "@/lib/llm/usageCap";
import { getFeatureCategory, getLimitForTier } from "@/lib/llm/limits";
import { findCachedTutorAnswer, saveTutorQACache } from "@/lib/tutor/qaCache";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

const TUTOR_CHAT_FEATURE = "tutor_chat";

export async function POST(request: Request) {
  try {
    // 1. Authenticate user
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    if (checkRateLimit(user.id, "tutor_chat", 15, 60_000)) {
      return NextResponse.json(rateLimitedResponse(), { status: 429 });
    }

    // 2. Parse and validate payload
    let body: {
      skill_node_id?: string;
      message?: string;
      re_prompt_mode?: string;
      prior_explanation?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    const { skill_node_id, message, re_prompt_mode, prior_explanation } = body;

    if (!skill_node_id || typeof skill_node_id !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'skill_node_id' parameter" },
        { status: 400 },
      );
    }

    const isExplainDifferently =
      re_prompt_mode === "explain_differently" || Boolean(prior_explanation);

    const userQueryText =
      message && message.trim()
        ? message.trim()
        : isExplainDifferently
        ? "Could you explain your previous response using a completely different approach, like a real-world analogy?"
        : "";

    if (!userQueryText) {
      return NextResponse.json(
        { error: "Missing or empty 'message' parameter" },
        { status: 400 },
      );
    }

    const adminSupabase = createAdminClient();
    const userId = user.id;

    // 2b. Enforce the subscription tier cap before doing any work (Prompt
    // 81/84) — checked here explicitly rather than via the shared
    // executeLLMCallWithCap wrapper, since this route needs to return a
    // clean 429 *before* opening the streaming response, not partway
    // through a stream that's already been sent to the client.
    const capResult = await checkUsageCap(userId, TUTOR_CHAT_FEATURE);
    if (!capResult.allowed) {
      return NextResponse.json(capResult, { status: 429 });
    }

    // 3. Fetch skill node details
    const { data: dbNode } = await adminSupabase
      .from("skill_nodes")
      .select("id, name, category")
      .eq("id", skill_node_id)
      .maybeSingle();

    const node = dbNode || {
      id: skill_node_id,
      name: skill_node_id.replace(/[-_]/g, " "),
      category: "GenAI Engineering",
    };
    const nodeId = node.id;

    // 4. Fetch existing tutor conversation history
    const { data: dbConversation } = await adminSupabase
      .from("tutor_conversations")
      .select("messages")
      .eq("user_id", userId)
      .eq("skill_node_id", nodeId)
      .maybeSingle();

    const existingMessages: Array<{ role: string; content: string; timestamp?: string }> =
      dbConversation && Array.isArray(dbConversation.messages)
        ? dbConversation.messages
        : [];

    const nowIso = () =>
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    async function persistExchange(answerText: string) {
      const userMessageObj = {
        role: "user" as const,
        content: userQueryText,
        timestamp: nowIso(),
      };
      const assistantMessageObj = {
        role: "assistant" as const,
        content: answerText,
        timestamp: nowIso(),
      };
      const updatedHistory = [...existingMessages, userMessageObj, assistantMessageObj];

      await adminSupabase.from("tutor_conversations").upsert(
        {
          user_id: userId,
          skill_node_id: nodeId,
          messages: updatedHistory,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id, skill_node_id" },
      );

      return updatedHistory;
    }

    // 5. Check vector embedding QA cache before making a fresh LLM call
    // (skipped when re-prompting differently — that always needs a fresh
    // generation, never a cached answer to a differently-phrased question).
    if (!isExplainDifferently) {
      const cachedResult = await findCachedTutorAnswer({
        userId,
        skillNodeId: nodeId,
        questionText: userQueryText,
        similarityThreshold: 0.9,
      });

      if (cachedResult.cached && cachedResult.answerText) {
        await persistExchange(cachedResult.answerText);
        // A cache hit still counts as a tutor message from the user's
        // perspective (it delivered an answer), even though it cost the
        // platform nothing — the cap is about message volume, not spend.
        await incrementUsage(userId, TUTOR_CHAT_FEATURE);

        const encoder = new TextEncoder();
        const cachedStream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(cachedResult.answerText as string));
            controller.close();
          },
        });

        const cacheFeatureCategory = getFeatureCategory(TUTOR_CHAT_FEATURE);
        const cacheLimit = getLimitForTier(capResult.tier, cacheFeatureCategory);
        const cacheProjectedUsage = capResult.currentUsage + 1;
        const cachePercentUsed =
          cacheLimit === Infinity ? 0 : Math.round((cacheProjectedUsage / cacheLimit) * 100);

        return new Response(cachedStream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Cache-Hit": "true",
            "X-Similarity": String(cachedResult.similarity ?? ""),
            ...(cachePercentUsed >= 80
              ? {
                  "X-Usage-Warning": "true",
                  "X-Usage-Current": String(cacheProjectedUsage),
                  "X-Usage-Limit": String(cacheLimit),
                  "X-Usage-Percent": String(cachePercentUsed),
                }
              : {}),
          },
        });
      }
    }

    // 6. Fetch latest versioned lesson content for grounding context
    const { data: dbLesson } = await adminSupabase
      .from("lessons")
      .select("title, content_markdown, code_example")
      .eq("skill_node_id", nodeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lessonContext = dbLesson
      ? `Lesson Title: ${dbLesson.title}\n\nContent:\n${dbLesson.content_markdown}\n\nWorked Example:\n${dbLesson.code_example || "N/A"}`
      : `General concepts of ${node.name} in GenAI Engineering.`;

    // 7. Construct system prompt for expensive-tier tutor model
    let systemPrompt = `You are a patient, encouraging, and world-class AI Engineering Tutor for Kalpla.
Target Skill Node: ${node.name} (${node.category}).

Lesson Context:
${lessonContext}

Instructions:
- Act as a patient Socratic AI tutor specialized in ${node.name}.
- Answer the student's question clearly, grounding explanations in the provided lesson context.
- Provide practical code snippets when applicable.
- Keep responses concise, supportive, and end with 1 clarifying or discussion question to check understanding.`;

    if (isExplainDifferently) {
      const priorText =
        prior_explanation ||
        existingMessages.filter((m) => m.role === "assistant").pop()?.content ||
        "";
      systemPrompt += `\n\nCRITICAL INSTRUCTION — EXPLAIN DIFFERENTLY:
The student did NOT fully grasp your prior explanation below:
"""
${priorText}
"""

Re-Prompt Guidelines:
1. Do NOT repeat the previous explanation, phrasing, or technical code structure.
2. Switch to a COMPLETELY DIFFERENT teaching approach (e.g., use an intuitive real-world analogy, visual metaphor, physical story, or intuitive step-by-step breakdown).
3. Ground your explanation in ${node.name} concepts and conclude with 1 check question to verify if the new analogy helped.`;
    }

    // Format chat history for LLM provider
    const formattedMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...existingMessages.map((m) => ({
        role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userQueryText },
    ];

    // 8. Resolve model config for expensive tier (Sonnet / GPT-4o) and stream the LLM call
    const resolvedConfig = resolveModelConfig("expensive");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = "";
        try {
          for await (const event of executeLLMCallStream({
            provider: resolvedConfig.provider,
            modelId: resolvedConfig.modelId,
            feature: "tutor_chat",
            messages: formattedMessages,
            maxTokens: 2048,
            temperature: 0.7,
          })) {
            if (event.type === "delta") {
              fullText += event.text;
              controller.enqueue(encoder.encode(event.text));
            } else if (event.type === "done") {
              // 9. Persist the completed exchange.
              await persistExchange(event.fullText || fullText);

              // 10. Log real LLM cost so the cost dashboard reflects actual
              // spend, matching the zero-cost cache-hit entries logged by
              // findCachedTutorAnswer — otherwise savings have nothing to
              // be measured against.
              await logLLMCost({
                userId,
                feature: "tutor_chat",
                model: event.model,
                tokensIn: event.usage.promptTokens,
                tokensOut: event.usage.completionTokens,
              }).catch((costErr) => {
                console.warn("logLLMCost error for tutor_chat:", costErr);
              });

              // Count this message against the tier cap (Prompt 81/84).
              await incrementUsage(userId, TUTOR_CHAT_FEATURE);

              // 11. Cache the fresh QA pair for future high-similarity matches.
              saveTutorQACache({
                skillNodeId: nodeId,
                questionText: userQueryText,
                answerText: event.fullText || fullText,
                userId,
              }).catch((cacheErr) => {
                console.warn("Async saveTutorQACache error:", cacheErr);
              });
            }
          }
        } catch (streamErr) {
          console.error("Error during tutor chat stream:", streamErr);
          controller.enqueue(
            encoder.encode(
              "\n\n[The tutor connection was interrupted. Please try again.]",
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    // Prompt 84's 80% soft warning: computed from the pre-check snapshot
    // (capResult), since the real post-increment count only lands once the
    // stream finishes, after response headers are already committed.
    const featureCategory = getFeatureCategory(TUTOR_CHAT_FEATURE);
    const limitForWarning = getLimitForTier(capResult.tier, featureCategory);
    const projectedUsage = capResult.currentUsage + 1;
    const percentUsed =
      limitForWarning === Infinity ? 0 : Math.round((projectedUsage / limitForWarning) * 100);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Cache-Hit": "false",
        ...(percentUsed >= 80
          ? {
              "X-Usage-Warning": "true",
              "X-Usage-Current": String(projectedUsage),
              "X-Usage-Limit": String(limitForWarning),
              "X-Usage-Percent": String(percentUsed),
            }
          : {}),
      },
    });
  } catch (err) {
    console.error("Error in POST /api/tutor/chat:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
