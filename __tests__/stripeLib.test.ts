import { describe, it, expect, beforeEach, vi } from "vitest";

// lib/billing/stripe.ts caches a module-level Stripe client singleton, so
// each test gets a fresh module instance (vi.resetModules + dynamic import)
// rather than sharing state across configured/unconfigured-env test cases.
describe("lib/billing/stripe.ts", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID_PRO;
    delete process.env.STRIPE_PRICE_ID_PREMIUM;
  });

  describe("getStripeClient / isStripeConfigured", () => {
    it("throws a clear error when STRIPE_SECRET_KEY is not configured", async () => {
      const { getStripeClient } = await import("@/lib/billing/stripe");
      expect(() => getStripeClient()).toThrow(/STRIPE_SECRET_KEY is not configured/);
    });

    it("constructs and caches a client when STRIPE_SECRET_KEY is configured", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_for_unit_tests";
      const { getStripeClient } = await import("@/lib/billing/stripe");

      const client1 = getStripeClient();
      const client2 = getStripeClient();
      expect(client1).toBeDefined();
      expect(client2).toBe(client1); // same cached instance, not reconstructed
    });

    it("isStripeConfigured reflects whether STRIPE_SECRET_KEY is set", async () => {
      const { isStripeConfigured: isConfiguredWithoutKey } = await import("@/lib/billing/stripe");
      expect(isConfiguredWithoutKey()).toBe(false);

      vi.resetModules();
      process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_for_unit_tests";
      const { isStripeConfigured: isConfiguredWithKey } = await import("@/lib/billing/stripe");
      expect(isConfiguredWithKey()).toBe(true);
    });
  });

  describe("getPriceIdForTier", () => {
    it("returns the configured price ID for 'pro'", async () => {
      process.env.STRIPE_PRICE_ID_PRO = "price_pro_test";
      const { getPriceIdForTier } = await import("@/lib/billing/stripe");
      expect(getPriceIdForTier("pro")).toBe("price_pro_test");
    });

    it("returns the configured price ID for 'premium'", async () => {
      process.env.STRIPE_PRICE_ID_PREMIUM = "price_premium_test";
      const { getPriceIdForTier } = await import("@/lib/billing/stripe");
      expect(getPriceIdForTier("premium")).toBe("price_premium_test");
    });

    it("throws when the tier's price ID env var is missing", async () => {
      const { getPriceIdForTier } = await import("@/lib/billing/stripe");
      expect(() => getPriceIdForTier("pro")).toThrow(/Missing Stripe price ID env var for tier "pro"/);
    });
  });

  describe("getTierForPriceId", () => {
    it("resolves a known Pro price ID back to 'pro'", async () => {
      process.env.STRIPE_PRICE_ID_PRO = "price_pro_test";
      process.env.STRIPE_PRICE_ID_PREMIUM = "price_premium_test";
      const { getTierForPriceId } = await import("@/lib/billing/stripe");
      expect(getTierForPriceId("price_pro_test")).toBe("pro");
    });

    it("resolves a known Premium price ID back to 'premium'", async () => {
      process.env.STRIPE_PRICE_ID_PRO = "price_pro_test";
      process.env.STRIPE_PRICE_ID_PREMIUM = "price_premium_test";
      const { getTierForPriceId } = await import("@/lib/billing/stripe");
      expect(getTierForPriceId("price_premium_test")).toBe("premium");
    });

    it("returns null for an unrecognized price ID, rather than guessing a tier", async () => {
      process.env.STRIPE_PRICE_ID_PRO = "price_pro_test";
      process.env.STRIPE_PRICE_ID_PREMIUM = "price_premium_test";
      const { getTierForPriceId } = await import("@/lib/billing/stripe");
      expect(getTierForPriceId("price_totally_unknown")).toBeNull();
    });
  });
});
