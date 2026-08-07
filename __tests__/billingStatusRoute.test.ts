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
vi.mock("@/lib/billing/stripe", () => ({
  isStripeConfigured: () => mockIsStripeConfigured(),
}));

// TIER_LIMITS itself is exercised by __tests__/llmLimits.test.ts. Mocking it
// here with small, hand-picked numbers decouples this test from the real
// tier limits (which may change) and keeps it focused purely on the route's
// own meter-shaping logic (percentUsed math, Infinity -> null, tier
// fallback), matching what /lib/llm/limits actually exports (TIER_LIMITS —
// this route does not use getFeatureCategory/getLimitForTier).
vi.mock("@/lib/llm/limits", () => ({
  TIER_LIMITS: {
    free: { tutor: 10, assessment: 5, roadmap: 2, mock_interview: 0, default: 20 },
    pro: { tutor: 100, assessment: 50, roadmap: 20, mock_interview: 4, default: 200 },
    premium: {
      tutor: Infinity,
      assessment: Infinity,
      roadmap: Infinity,
      mock_interview: Infinity,
      default: Infinity,
    },
  },
}));

import { GET } from "@/app/api/billing/status/route";

describe("app/api/billing/status/route.ts (Prompt 83 — /billing page plan summary + usage meters)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "user-1", email: "user@example.com" } });
    mockIsStripeConfigured.mockReturnValue(true);
    // Default: no subscriptions row at all.
    mockFrom.mockImplementation((table: string) => {
      if (table !== "subscriptions") {
        throw new Error(`Unexpected table access in status test: "${table}"`);
      }
      return makeSubscriptionSelectChain({ data: null, error: null });
    });
  });

  it("returns 401 when unauthenticated, without touching the DB", async () => {
    mockGetServerUser.mockResolvedValue({ user: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("defaults to the free tier with zeroed usage when the user has no subscriptions row (matches usageCap.ts convention)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tier).toBe("free");
    expect(json.status).toBe("active");

    const tutorMeter = json.meters.find((m: { category: string }) => m.category === "tutor");
    expect(tutorMeter).toEqual({ category: "tutor", used: 0, limit: 10, percentUsed: 0 });
  });

  it("shapes usage meters correctly for a free-tier subscriber with partial usage", async () => {
    mockFrom.mockImplementation(() =>
      makeSubscriptionSelectChain({
        data: {
          tier: "free",
          status: "active",
          usage_this_period: { tutor: 5, assessment: 5 },
          updated_at: "2026-08-01T00:00:00Z",
        },
        error: null,
      }),
    );
    const res = await GET();
    const json = await res.json();
    expect(json.tier).toBe("free");

    const tutorMeter = json.meters.find((m: { category: string }) => m.category === "tutor");
    expect(tutorMeter).toEqual({ category: "tutor", used: 5, limit: 10, percentUsed: 50 });

    const assessmentMeter = json.meters.find((m: { category: string }) => m.category === "assessment");
    expect(assessmentMeter).toEqual({ category: "assessment", used: 5, limit: 5, percentUsed: 100 });
  });

  it("shapes usage meters correctly for a paid pro subscriber", async () => {
    mockFrom.mockImplementation(() =>
      makeSubscriptionSelectChain({
        data: {
          tier: "pro",
          status: "active",
          usage_this_period: { tutor: 25 },
          updated_at: "2026-08-01T00:00:00Z",
        },
        error: null,
      }),
    );
    const res = await GET();
    const json = await res.json();
    expect(json.tier).toBe("pro");

    const tutorMeter = json.meters.find((m: { category: string }) => m.category === "tutor");
    expect(tutorMeter).toEqual({ category: "tutor", used: 25, limit: 100, percentUsed: 25 });
  });

  it("reports Infinity tier limits as a null limit and 0 percentUsed (premium subscriber)", async () => {
    mockFrom.mockImplementation(() =>
      makeSubscriptionSelectChain({
        data: {
          tier: "premium",
          status: "active",
          usage_this_period: { tutor: 999 },
          updated_at: "2026-08-01T00:00:00Z",
        },
        error: null,
      }),
    );
    const res = await GET();
    const json = await res.json();
    expect(json.tier).toBe("premium");

    const tutorMeter = json.meters.find((m: { category: string }) => m.category === "tutor");
    expect(tutorMeter).toEqual({ category: "tutor", used: 999, limit: null, percentUsed: 0 });
  });

  it("surfaces the caller's real subscription status instead of hardcoding 'active'", async () => {
    mockFrom.mockImplementation(() =>
      makeSubscriptionSelectChain({
        data: { tier: "pro", status: "past_due", usage_this_period: {}, updated_at: "2026-08-01T00:00:00Z" },
        error: null,
      }),
    );
    const res = await GET();
    const json = await res.json();
    expect(json.status).toBe("past_due");
  });

  it("reflects whether Stripe is configured on this deployment", async () => {
    mockIsStripeConfigured.mockReturnValue(false);
    const res = await GET();
    const json = await res.json();
    expect(json.stripe_configured).toBe(false);
  });

  it("returns 500 instead of crashing when the DB throws unexpectedly", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("connection refused");
    });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
