import { ModelTier, LLMProviderName } from "@/types/llm";

export interface ResolvedModelConfig {
  provider: LLMProviderName;
  modelId: string;
  tier: ModelTier;
}

export const MODEL_MAPPINGS: Record<
  LLMProviderName,
  Record<ModelTier, string>
> = {
  anthropic: {
    // claude-3-5-haiku-20241022 / claude-3-5-sonnet-20241022 are retired
    // (Feb 2026 / Oct 2025) — a live call with either 404s. These are the
    // current aliases; keep using the alias form, not a dated snapshot.
    cheap: "claude-haiku-4-5",
    expensive: "claude-sonnet-5",
  },
  openai: {
    cheap: "gpt-4o-mini",
    expensive: "gpt-4o",
  },
};

/**
 * Resolves an abstract model tier ('cheap' | 'expensive') to a concrete provider and model ID.
 * Provider can be explicitly requested or resolved from environment / default configuration.
 */
export function resolveModelConfig(
  tier: ModelTier,
  requestedProvider?: LLMProviderName,
): ResolvedModelConfig {
  const envProvider = (process.env.DEFAULT_LLM_PROVIDER?.toLowerCase() ||
    "anthropic") as LLMProviderName;

  const provider: LLMProviderName =
    requestedProvider &&
    (requestedProvider === "openai" || requestedProvider === "anthropic")
      ? requestedProvider
      : envProvider === "openai"
        ? "openai"
        : "anthropic";

  const providerModels = MODEL_MAPPINGS[provider] || MODEL_MAPPINGS.anthropic;
  const modelId = providerModels[tier] || providerModels.cheap;

  return {
    provider,
    modelId,
    tier,
  };
}
