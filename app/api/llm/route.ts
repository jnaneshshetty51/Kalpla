import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { resolveModelConfig } from "@/lib/llm/models";
import { executeLLMCallWithCap, UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";
import { LLMProxyRequest, ModelTier } from "@/types/llm";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

export async function POST(request: Request) {
  try {
    // 1. Authenticate request using getServerUser
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    if (checkRateLimit(user.id, "llm_proxy", 20, 60_000)) {
      return NextResponse.json(rateLimitedResponse(), { status: 429 });
    }

    // 2. Parse and validate payload
    let body: LLMProxyRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    const { feature, model, messages, maxTokens, temperature, provider, tools } = body;

    if (!feature || typeof feature !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'feature' field" },
        { status: 400 },
      );
    }

    if (model !== "cheap" && model !== "expensive") {
      return NextResponse.json(
        { error: "Invalid 'model' tier: expected 'cheap' or 'expensive'" },
        { status: 400 },
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid 'messages' array" },
        { status: 400 },
      );
    }

    for (const msg of messages) {
      if (
        !msg ||
        typeof msg.content !== "string" ||
        !["system", "user", "assistant"].includes(msg.role)
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid message object: must have role ('system'|'user'|'assistant') and string content",
          },
          { status: 400 },
        );
      }
    }

    // 3. Resolve model mapping (tier -> modelId)
    const resolvedConfig = resolveModelConfig(model as ModelTier, provider);

    // 4. Cap-checked call: enforce, dispatch, log cost, increment usage —
    // the same pipeline every internal caller now goes through (Prompt 81).
    const result = await executeLLMCallWithCap({
      userId: user.id,
      provider: resolvedConfig.provider,
      modelId: resolvedConfig.modelId,
      feature,
      messages,
      maxTokens,
      temperature,
      tools,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UsageCapExceededError) {
      return NextResponse.json(error.details, { status: 429 });
    }
    console.error("Error in LLM proxy endpoint:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
