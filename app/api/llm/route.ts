import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { resolveModelConfig } from "@/lib/llm/models";
import { executeLLMCall } from "@/lib/llm/providers";
import { logLLMCost } from "@/lib/llm/logger";
import { checkUsageCap, incrementUsage } from "@/lib/llm/usageCap";
import { LLMProxyRequest, ModelTier } from "@/types/llm";

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

    const { feature, model, messages, maxTokens, temperature, provider } = body;

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

    // 3. Pre-call enforcement: Check subscription tier usage cap
    const capResult = await checkUsageCap(user.id, feature);
    if (!capResult.allowed) {
      return NextResponse.json(
        {
          error: capResult.error,
          feature: capResult.feature,
          resetDate: capResult.resetDate,
          limit: capResult.limit,
          currentUsage: capResult.currentUsage,
        },
        { status: 429 },
      );
    }

    // 4. Resolve model mapping (tier -> modelId)
    const resolvedConfig = resolveModelConfig(model as ModelTier, provider);

    // 5. Dispatch to provider adapter
    const result = await executeLLMCall({
      provider: resolvedConfig.provider,
      modelId: resolvedConfig.modelId,
      feature,
      messages,
      maxTokens,
      temperature,
    });

    // 6. Automatically log call to cost_logs ledger
    const costUsd = await logLLMCost({
      userId: user.id,
      feature,
      model: result.model,
      tokensIn: result.usage.promptTokens,
      tokensOut: result.usage.completionTokens,
    });

    result.usage.costUsd = costUsd;

    // 7. Increment usage counters atomically post-successful call
    await incrementUsage(user.id, feature);

    // 8. Return standardized LLM response
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in LLM proxy endpoint:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
