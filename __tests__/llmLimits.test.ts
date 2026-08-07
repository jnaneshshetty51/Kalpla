import { describe, it, expect } from "vitest";
import { getFeatureCategory, getLimitForTier, getResetDate, TIER_LIMITS } from "@/lib/llm/limits";

describe("lib/llm/limits.ts — feature-category mapping and tier limit resolution", () => {
  describe("getFeatureCategory", () => {
    it("maps any feature tag containing 'tutor' to the tutor category", () => {
      expect(getFeatureCategory("tutor_chat")).toBe("tutor");
      expect(getFeatureCategory("tutor_chat_cache_lookup")).toBe("tutor");
    });

    it("maps any feature tag containing 'assessment' to the assessment category", () => {
      expect(getFeatureCategory("initial_assessment")).toBe("assessment");
      expect(getFeatureCategory("assessment_grading")).toBe("assessment");
    });

    it("maps any feature tag containing 'roadmap' to the roadmap category", () => {
      expect(getFeatureCategory("skill_roadmap")).toBe("roadmap");
      expect(getFeatureCategory("roadmap_generation")).toBe("roadmap");
    });

    it("maps mock_interview tags to their own category", () => {
      expect(getFeatureCategory("mock_interview")).toBe("mock_interview");
    });

    it("pools every unrecognized feature tag into 'default' rather than giving it an invisible untiered bucket", () => {
      // Real regression this guards against: workspace_hint and friends
      // were each silently getting a separate 50/month bucket the billing
      // page never displayed.
      expect(getFeatureCategory("workspace_hint")).toBe("default");
      expect(getFeatureCategory("reference_solution")).toBe("default");
      expect(getFeatureCategory("daily_coach")).toBe("default");
      expect(getFeatureCategory("portfolio_case_study")).toBe("default");
      expect(getFeatureCategory("sandbox_embeddings")).toBe("default");
    });

    it("is case-insensitive", () => {
      expect(getFeatureCategory("TUTOR_CHAT")).toBe("tutor");
    });
  });

  describe("getLimitForTier", () => {
    it("resolves the exact configured limit for a known tier/category pair", () => {
      expect(getLimitForTier("free", "tutor")).toBe(30);
      expect(getLimitForTier("pro", "assessment")).toBe(100);
      expect(getLimitForTier("premium", "roadmap")).toBe(Infinity);
    });

    it("falls back to the tier's 'default' bucket for an unrecognized category", () => {
      expect(getLimitForTier("free", "some_unmapped_category")).toBe(TIER_LIMITS.free.default);
    });

    it("falls back to the free tier's config entirely for an unrecognized tier string", () => {
      expect(getLimitForTier("nonexistent_tier", "tutor")).toBe(TIER_LIMITS.free.tutor);
    });

    it("mock_interview is 0 on free tier — blocks even though the feature isn't shipped yet", () => {
      expect(getLimitForTier("free", "mock_interview")).toBe(0);
    });
  });

  describe("getResetDate", () => {
    it("returns the first day of next UTC month at midnight", () => {
      const reset = new Date(getResetDate());
      const now = new Date();
      expect(reset.getUTCDate()).toBe(1);
      expect(reset.getUTCHours()).toBe(0);
      expect(reset.getUTCMinutes()).toBe(0);
      expect(reset.getTime()).toBeGreaterThan(now.getTime());
    });
  });
});
