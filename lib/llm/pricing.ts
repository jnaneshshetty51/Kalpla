export interface ModelPriceRates {
  /** Price in USD per 1,000,000 prompt / input tokens */
  inputPerMillionUsd: number;
  /** Price in USD per 1,000,000 completion / output tokens */
  outputPerMillionUsd: number;
}

/**
 * Centralized pricing configuration mapping model IDs to per-token rates.
 * Updatable without modifying code elsewhere in the application.
 */
export const MODEL_PRICING: Record<string, ModelPriceRates> = {
  // Anthropic Models — rates as of 2026-08-05. Sonnet 5 has an introductory
  // rate ($2/$10 per MTok) through 2026-08-31; using the standard post-intro
  // rate here so this doesn't silently under-report once it lapses.
  "claude-haiku-4-5": {
    inputPerMillionUsd: 1.0,
    outputPerMillionUsd: 5.0,
  },
  "claude-sonnet-5": {
    inputPerMillionUsd: 3.0,
    outputPerMillionUsd: 15.0,
  },

  // OpenAI Models
  "gpt-4o-mini": {
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
  },
  "gpt-4o": {
    inputPerMillionUsd: 2.5,
    outputPerMillionUsd: 10.0,
  },

  // OpenAI Embeddings — input-only, no completion tokens.
  "text-embedding-3-small": {
    inputPerMillionUsd: 0.02,
    outputPerMillionUsd: 0,
  },
};

// Fallback pricing rate used if an unlisted model ID is encountered
const FALLBACK_PRICING: ModelPriceRates = {
  inputPerMillionUsd: 1.0,
  outputPerMillionUsd: 5.0,
};

/**
 * Calculates the total cost in USD for an LLM call based on prompt and completion token counts.
 *
 * @param modelId Model ID string (e.g. "claude-3-5-haiku-20241022")
 * @param promptTokens Number of input / prompt tokens
 * @param completionTokens Number of output / completion tokens
 * @returns Cost in USD rounded to 6 decimal places
 */
export function calculateCostUsd(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rates = MODEL_PRICING[modelId] || FALLBACK_PRICING;

  const inputCost = (promptTokens / 1_000_000) * rates.inputPerMillionUsd;
  const outputCost = (completionTokens / 1_000_000) * rates.outputPerMillionUsd;
  const totalCost = inputCost + outputCost;

  // Round to 6 decimal places matching database numeric(10, 6) column
  return Math.round(totalCost * 1_000_000) / 1_000_000;
}
