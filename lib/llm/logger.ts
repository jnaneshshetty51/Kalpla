import { createAdminClient } from "@/lib/supabase/admin";
import { calculateCostUsd } from "@/lib/llm/pricing";
import { LogCostParams } from "@/types/llm";

/**
 * Automatically logs an LLM invocation into the `cost_logs` database ledger.
 * Computes USD cost based on token counts and model pricing.
 * Uses service_role admin privileges to insert audit records safely.
 *
 * @returns Computed USD cost for the call.
 */
export async function logLLMCost({
  userId,
  feature,
  model,
  tokensIn,
  tokensOut,
}: LogCostParams): Promise<number> {
  const costUsd = calculateCostUsd(model, tokensIn, tokensOut);

  try {
    const adminSupabase = createAdminClient();

    const { error } = await adminSupabase.from("cost_logs").insert({
      user_id: userId,
      feature,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
    });

    if (error) {
      console.error(
        `[lib/llm/logger] Failed to insert cost log entry for user ${userId}, feature "${feature}":`,
        error,
      );
    }
  } catch (err) {
    console.error(
      `[lib/llm/logger] Unexpected error while logging LLM cost:`,
      err,
    );
  }

  return costUsd;
}
