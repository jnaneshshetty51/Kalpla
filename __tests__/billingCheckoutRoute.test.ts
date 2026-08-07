import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

function makeSubscriptionSelectChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  return chain;
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => mockFrom(table) }),
}));

// The route builds its Stripe API call params from three helpers exported by
// @/lib/billing/stripe. We mock this module directly (rather than the
// `stripe` npm package) so no real network call ever happens, and so we can
// assert exactly what params the route builds — that's the route's own
// logic, not Stripe's SDK behavior.
const mockIsStripeConfigured = vi.fn();
const mockGetPriceIdForTier = vi.fn();
const mockSessionsCreate = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({
  isStripeConfigured: () => mockIsStripeConfigured(),
  getPriceIdForTier: (tier: string) => mockGetPriceIdForTier(tier),
  getStripeClient: () => ({
    checkout: {
      sessions: {
        create: (params: unknown) => mockSessionsCreate(params),
      },
    },
  }),
}));

import { POST } from "@/app/api/billing/checkout/route";

function req(body: unknown) {
  return new Request("http://localhost/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("app/api/billing/checkout/route.ts (Prompt 82 — Stripe Checkout session creation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "user-1", email: "user@example.com" } });
    mockIsStripeConfigured.mockReturnValue(true);
    mockGetPriceIdForTier.mockImplementation((tier: string) =>
      tier === "pro" ? "price_pro_test" : "price_premium_test",
    );
    // Default: user has no subscriptions row / no Stripe customer id yet.
    mockFrom.mockImplementation((table: string) => {
      if (table !== "subscriptions") {
        throw new Error(`Unexpected table access in checkout test: "${table}"`);
      }
      return makeSubscriptionSelectChain({ data: null, error: null });
    });
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session_abc" });
  });

  it("returns 401 when unauthenticated, without touching the DB or Stripe", async () => {
    mockGetServerUser.mockResolvedValue({ user: null });
    const res = await POST(req({ tier: "pro" }));
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 503 when Stripe isn't configured on this deployment", async () => {
    mockIsStripeConfigured.mockReturnValue(false);
    const res = await POST(req({ tier: "pro" }));
    expect(res.status).toBe(503);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed JSON body", async () => {
    const badReq = new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      body: "{not valid json",
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid 'tier' value", async () => {
    const res = await POST(req({ tier: "enterprise" }));
    expect(res.status).toBe(400);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("first-time buyer with no Stripe customer id yet: uses customer_email, not customer", async () => {
    const res = await POST(req({ tier: "pro" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBe("https://checkout.stripe.com/session_abc");

    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.customer_email).toBe("user@example.com");
    expect(params.customer).toBeUndefined();
    expect(params.mode).toBe("subscription");
    expect(params.line_items).toEqual([{ price: "price_pro_test", quantity: 1 }]);
    expect(params.client_reference_id).toBe("user-1");
    expect(params.metadata).toEqual({ user_id: "user-1", tier: "pro" });
    expect(params.subscription_data).toEqual({ metadata: { user_id: "user-1", tier: "pro" } });
    expect(params.success_url).toBe("http://localhost/billing?checkout=success");
    expect(params.cancel_url).toBe("http://localhost/billing?checkout=cancelled");
  });

  it("returning subscriber with an existing Stripe customer id: reuses it instead of customer_email", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table !== "subscriptions") {
        throw new Error(`Unexpected table access in checkout test: "${table}"`);
      }
      return makeSubscriptionSelectChain({ data: { stripe_customer_id: "cus_existing_1" }, error: null });
    });

    const res = await POST(req({ tier: "premium" }));
    expect(res.status).toBe(200);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.customer).toBe("cus_existing_1");
    expect(params.customer_email).toBeUndefined();
    expect(params.line_items).toEqual([{ price: "price_premium_test", quantity: 1 }]);
    expect(params.metadata).toEqual({ user_id: "user-1", tier: "premium" });
  });

  it("surfaces a Stripe API error as a 500 JSON response instead of crashing uncaught", async () => {
    mockSessionsCreate.mockRejectedValue(new Error("Stripe: card issuer unreachable"));
    const res = await POST(req({ tier: "pro" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/card issuer unreachable/i);
  });
});
