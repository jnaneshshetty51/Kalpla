export interface FeatureLimits {
  assessment: number;
  tutor: number;
  roadmap: number;
  default: number;
  [key: string]: number;
}

/**
 * Subscription tier limits configuration.
 * Defines maximum allowed LLM calls / messages per billing period for each tier.
 */
export const TIER_LIMITS: Record<string, FeatureLimits> = {
  free: {
    assessment: 5,
    tutor: 30,
    roadmap: 3,
    default: 50,
  },
  pro: {
    assessment: 100,
    tutor: 1000,
    roadmap: 50,
    default: 2000,
  },
  premium: {
    assessment: Infinity,
    tutor: Infinity,
    roadmap: Infinity,
    default: Infinity,
  },
};

/**
 * Maps a feature string tag (e.g. "tutor_chat", "initial_assessment", "skill_roadmap")
 * to its corresponding usage category key.
 */
export function getFeatureCategory(feature: string): string {
  const normalized = feature.toLowerCase();

  if (normalized.includes("tutor")) return "tutor";
  if (normalized.includes("assessment")) return "assessment";
  if (normalized.includes("roadmap")) return "roadmap";

  return normalized || "default";
}

/**
 * Calculates the next billing period reset date (first day of the next UTC month).
 */
export function getResetDate(): string {
  const now = new Date();
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return nextMonth.toISOString();
}

/**
 * Resolves the numerical usage limit for a given tier and feature category.
 */
export function getLimitForTier(tier: string, featureCategory: string): number {
  const tierConfig = TIER_LIMITS[tier] || TIER_LIMITS.free;
  const limit = tierConfig[featureCategory] ?? tierConfig.default ?? 50;
  return limit;
}
