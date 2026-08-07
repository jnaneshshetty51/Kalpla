export interface FeatureLimits {
  assessment: number;
  tutor: number;
  roadmap: number;
  /** Not shipped yet — defined now so the tier model doesn't need a schema
   * change the day this feature lands (Prompt 81). Free tier gets none;
   * checkUsageCap will correctly block with usage_cap_exceeded even before
   * the feature exists, which is harmless since nothing calls this
   * category yet. */
  mock_interview: number;
  default: number;
  [key: string]: number;
}

/**
 * Subscription tier limits configuration.
 * Defines maximum allowed LLM calls / messages per billing period for each tier.
 */
export const TIER_LIMITS: Record<string, FeatureLimits> = {
  free: {
    assessment: 9, // 8 diagnostic tasks + 1 free retake per month
    tutor: 30,
    roadmap: 3,
    mock_interview: 0,
    default: 50,
  },
  pro: {
    assessment: 100,
    tutor: 1000,
    roadmap: 50,
    mock_interview: 4,
    default: 2000,
  },
  premium: {
    assessment: Infinity,
    tutor: Infinity,
    roadmap: Infinity,
    mock_interview: Infinity,
    default: Infinity,
  },
};

/**
 * Maps a feature string tag (e.g. "tutor_chat", "initial_assessment", "skill_roadmap")
 * to its corresponding usage category key. Every tag that isn't one of the
 * explicitly-tiered categories above (hints, reference solutions, submission
 * review, daily coach tasks, portfolio case studies, sandbox calls, ...)
 * pools into "default" — returning the raw feature string here instead would
 * give each of those features its own untiered, invisible-on-/billing cap
 * (discovered live: workspace_hint and friends were each silently getting a
 * separate 50/month bucket that the billing meters never displayed).
 */
export function getFeatureCategory(feature: string): string {
  const normalized = feature.toLowerCase();

  if (normalized.includes("tutor")) return "tutor";
  if (normalized.includes("assessment")) return "assessment";
  if (normalized.includes("roadmap")) return "roadmap";
  if (normalized.includes("mock_interview")) return "mock_interview";

  return "default";
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
