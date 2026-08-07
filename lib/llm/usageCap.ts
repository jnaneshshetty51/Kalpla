import { createAdminClient } from "@/lib/supabase/admin";
import { UsageCapCheckResult } from "@/types/llm";
import { getFeatureCategory, getLimitForTier, getResetDate } from "./limits";

/**
 * Checks whether the calling user has exceeded their subscription tier's usage cap for a feature.
 * Must be executed prior to calling the LLM API.
 *
 * @param userId Authenticated user ID
 * @param feature Feature tag string (e.g. "tutor_chat", "assessment")
 * @returns UsageCapCheckResult containing allowed status or structured error details.
 */
export async function checkUsageCap(
  userId: string,
  feature: string,
): Promise<UsageCapCheckResult> {
  try {
    const adminSupabase = createAdminClient();

    const { data: subscription, error } = await adminSupabase
      .from("subscriptions")
      .select("tier, status, usage_this_period")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error(
        `[lib/llm/usageCap] Error fetching subscription for user ${userId}:`,
        error,
      );
    }

    const tier = subscription?.tier || "free";
    const usageThisPeriod =
      (subscription?.usage_this_period as Record<string, number>) || {};

    const featureCategory = getFeatureCategory(feature);
    const limit = getLimitForTier(tier, featureCategory);
    const currentUsage = usageThisPeriod[featureCategory] || 0;

    if (limit !== Infinity && currentUsage >= limit) {
      return {
        allowed: false,
        error: "usage_cap_exceeded",
        feature,
        resetDate: getResetDate(),
        limit,
        currentUsage,
      };
    }

    return {
      allowed: true,
      tier,
      currentUsage,
      limit,
    };
  } catch (err) {
    console.error(
      "[lib/llm/usageCap] Unexpected error checking usage cap:",
      err,
    );
    // In case of an unexpected error querying limits, allow request to proceed cleanly
    return {
      allowed: true,
      tier: "free",
      currentUsage: 0,
      limit: Infinity,
    };
  }
}

/**
 * Atomically increments the usage counter for a feature category in subscriptions.usage_this_period.
 * Uses the Postgres RPC function `increment_subscription_usage`.
 *
 * @param userId Authenticated user ID
 * @param feature Feature tag string
 */
export async function incrementUsage(
  userId: string,
  feature: string,
): Promise<void> {
  const featureCategory = getFeatureCategory(feature);

  try {
    const adminSupabase = createAdminClient();

    const { error } = await adminSupabase.rpc("increment_subscription_usage", {
      p_user_id: userId,
      p_feature_key: featureCategory,
    });

    if (error) {
      console.error(
        `[lib/llm/usageCap] Error incrementing subscription usage for user ${userId}, feature "${featureCategory}":`,
        error,
      );
    }
  } catch (err) {
    console.error(
      `[lib/llm/usageCap] Unexpected error incrementing usage counter:`,
      err,
    );
  }
}
