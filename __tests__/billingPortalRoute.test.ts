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

const mockIsStripeConfigured = vi.fn();
const mockPortalSessionsCreate = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({
  isStripeConfigured: () => mockIsStripeConfigured(),
  getStripeClient: () => ({
    billingPortal: {
      sessions: {
        create: (params: unknown) => mockPortalSessionsCreate(params),
      },
    },
  }),
}));

import { POST } from "@/app/api/billing/portal/route";

function req() {
  return new Request("http://localhost/api/billing/portal", { method: "POST" });
}

describe("app/api/billing/portal/route.ts (Prompt 82 — Stripe Customer Portal session creation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "user-1", email: "user@example.com" } });
    mockIsStripeConfigured.mockReturnValue(true);
    // Default: an existing paid subscriber with a Stripe customer id.
    mockFrom.mockImplementation((table: string) => {
      if (table !== "subscriptions") {
        throw new Error(`Unexpected table access in portal test: "${table}"`);
      }
      return makeSubscriptionSelectChain({ data: { stripe_customer_id: "cus_1" }, error: null });
    });
    mockPortalSessionsCreate.mockResolvedValue({ url: "https://billing.stripe.com/portal_abc" });
  });

  it("returns 401 when unauthenticated, without touching the DB or Stripe", async () => {
    mockGetServerUser.mockResolvedValue({ user: null });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockPortalSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 503 when Stripe isn't configured on this deployment", async () => {
    mockIsStripeConfigured.mockReturnValue(false);
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(mockPortalSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when the user has no subscriptions row at all", async () => {
    mockFrom.mockImplementation(() => makeSubscriptionSelectChain({ data: null, error: null }));
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(mockPortalSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when the subscriptions row exists but has no stripe_customer_id (never checked out)", async () => {
    mockFrom.mockImplementation(() =>
      makeSubscriptionSelectChain({ data: { stripe_customer_id: null }, error: null }),
    );
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(mockPortalSessionsCreate).not.toHaveBeenCalled();
  });

  it("creates a portal session with the resolved customer id and return_url, returning its url", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBe("https://billing.stripe.com/portal_abc");

    expect(mockPortalSessionsCreate).toHaveBeenCalledTimes(1);
    expect(mockPortalSessionsCreate).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "http://localhost/billing",
    });
  });

  it("surfaces a Stripe API error as a 500 JSON response instead of crashing uncaught", async () => {
    mockPortalSessionsCreate.mockRejectedValue(new Error("Stripe: rate limited"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/rate limited/i);
  });
});
