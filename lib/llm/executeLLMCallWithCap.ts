import { executeLLMCall, executeLLMCallStream, ExecuteLLMCallOptions } from "@/lib/llm/providers";
import { logLLMCost } from "@/lib/llm/logger";
import { checkUsageCap, incrementUsage } from "@/lib/llm/usageCap";
import { getFeatureCategory, getLimitForTier } from "@/lib/llm/limits";
import { LLMProxyResponse, LLMStreamEvent, UsageCapExceeded, UsageWarning } from "@/types/llm";

/**
 * Thrown when a call is blocked by the caller's subscription tier cap
 * (Prompt 8/81). Every consuming route should catch this specifically and
 * translate it into the consistent upgrade-prompt UX (Prompt 84), not let
 * it surface as a generic 500.
 */
export class UsageCapExceededError extends Error {
  details: UsageCapExceeded;
  constructor(details: UsageCapExceeded) {
    super(`Usage cap exceeded for feature "${details.feature}"`);
    this.name = "UsageCapExceededError";
    this.details = details;
  }
}

function computeWarning(feature: string, tier: string, currentUsageBeforeThisCall: number): UsageWarning | undefined {
  const featureCategory = getFeatureCategory(feature);
  const limit = getLimitForTier(tier, featureCategory);
  if (limit === Infinity) return undefined;

  const usageAfterThisCall = currentUsageBeforeThisCall + 1;
  const percentUsed = Math.round((usageAfterThisCall / limit) * 100);

  if (percentUsed >= 80) {
    return { feature, currentUsage: usageAfterThisCall, limit, percentUsed };
  }
  return undefined;
}

export interface ExecuteLLMCallWithCapOptions extends ExecuteLLMCallOptions {
  userId: string;
}

/**
 * The real Prompt 8 pipeline (check cap -> call model -> log cost ->
 * increment usage), extracted so every internal caller (tutor chat, hints,
 * assessment grading, roadmap generation, reviews, daily coach, case
 * studies, reference solutions — not just the standalone /api/llm proxy
 * nothing else was actually calling) goes through the same enforcement,
 * not a bypassable direct executeLLMCall. Throws UsageCapExceededError
 * when blocked; on success, response.usageWarning is set once this call
 * pushes the user to/past 80% of their tier cap (Prompt 84's soft warning
 * before the 100% hard block).
 */
export async function executeLLMCallWithCap(
  options: ExecuteLLMCallWithCapOptions,
): Promise<LLMProxyResponse & { usageWarning?: UsageWarning }> {
  const { userId, ...llmOptions } = options;

  const capResult = await checkUsageCap(userId, options.feature);
  if (!capResult.allowed) {
    throw new UsageCapExceededError(capResult);
  }

  const result = await executeLLMCall(llmOptions);

  const costUsd = await logLLMCost({
    userId,
    feature: options.feature,
    model: result.model,
    tokensIn: result.usage.promptTokens,
    tokensOut: result.usage.completionTokens,
  });
  result.usage.costUsd = costUsd;

  await incrementUsage(userId, options.feature);

  const usageWarning = computeWarning(options.feature, capResult.tier, capResult.currentUsage);

  return { ...result, usageWarning };
}

/**
 * Streaming counterpart. The cap is checked before the stream starts (so a
 * blocked call never opens a stream at all); the 80% warning is delivered
 * as an extra field on the stream's final "done" event, right alongside
 * usage/cost, so callers don't need a second round-trip to learn about it.
 */
export async function* executeLLMCallStreamWithCap(
  options: ExecuteLLMCallWithCapOptions,
): AsyncGenerator<LLMStreamEvent & { usageWarning?: UsageWarning }> {
  const { userId, ...llmOptions } = options;

  const capResult = await checkUsageCap(userId, options.feature);
  if (!capResult.allowed) {
    throw new UsageCapExceededError(capResult);
  }

  for await (const event of executeLLMCallStream(llmOptions)) {
    if (event.type === "delta") {
      yield event;
      continue;
    }

    // "done": log cost, increment usage, attach the warning if applicable.
    await logLLMCost({
      userId,
      feature: options.feature,
      model: event.model,
      tokensIn: event.usage.promptTokens,
      tokensOut: event.usage.completionTokens,
    });
    await incrementUsage(userId, options.feature);

    const usageWarning = computeWarning(options.feature, capResult.tier, capResult.currentUsage);
    yield { ...event, usageWarning };
  }
}
