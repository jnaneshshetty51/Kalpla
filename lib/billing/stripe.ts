import Stripe from "stripe";

let stripeClient: Stripe | null = null;

/**
 * Lazily-constructed Stripe client. Throws a clear error if
 * STRIPE_SECRET_KEY isn't configured, rather than constructing a client
 * that would fail confusingly on first real API call.
 */
export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured — billing features are unavailable.");
  }

  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export type BillableTier = "pro" | "premium";

/**
 * Maps our internal tier names to Stripe Price IDs (configured per-plan in
 * the Stripe dashboard). Both must be set via env for checkout to work.
 */
export function getPriceIdForTier(tier: BillableTier): string {
  const priceId =
    tier === "pro" ? process.env.STRIPE_PRICE_ID_PRO : process.env.STRIPE_PRICE_ID_PREMIUM;

  if (!priceId) {
    throw new Error(`Missing Stripe price ID env var for tier "${tier}".`);
  }
  return priceId;
}

/** Reverse lookup: Stripe Price ID -> our internal tier name, used when syncing webhook events. */
export function getTierForPriceId(priceId: string): BillableTier | null {
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_ID_PREMIUM) return "premium";
  return null;
}
