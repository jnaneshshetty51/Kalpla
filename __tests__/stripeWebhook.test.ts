import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake but well-formed credentials — constructEvent/generateTestHeaderString
// are pure local HMAC-SHA256 operations, no network call, so these never
// need to be real Stripe test-mode keys.
process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_for_signature_tests";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fake_secret_for_signature_tests";
process.env.STRIPE_PRICE_ID_PRO = "price_pro_test";
process.env.STRIPE_PRICE_ID_PREMIUM = "price_premium_test";

const upsertCalls: unknown[] = [];
const updateCalls: Array<{ payload: unknown; eqField: string; eqValue: string }> = [];

function makeSubscriptionsTable() {
  return {
    upsert: vi.fn((payload: unknown) => {
      upsertCalls.push(payload);
      return Promise.resolve({ data: null, error: null });
    }),
    update: vi.fn((payload: unknown) => ({
      eq: vi.fn((field: string, value: string) => {
        updateCalls.push({ payload, eqField: field, eqValue: value });
        return Promise.resolve({ data: null, error: null });
      }),
    })),
  };
}

const mockFrom = vi.fn((table: string) => {
  if (table !== "subscriptions") {
    throw new Error(`Unexpected table access in webhook test: "${table}"`);
  }
  return makeSubscriptionsTable();
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => mockFrom(table) }),
}));

import { getStripeClient } from "@/lib/billing/stripe";

describe("app/api/billing/webhook/route.ts (Prompt 82 — signature verification is security-critical)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertCalls.length = 0;
    updateCalls.length = 0;
  });

  it("rejects a request with no stripe-signature header, before ever touching the database", async () => {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const req = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      body: JSON.stringify({ type: "checkout.session.completed" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects a forged/invalid signature and never writes to subscriptions", async () => {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const payload = JSON.stringify({
      id: "evt_fake",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", metadata: { user_id: "attacker" }, items: { data: [] } } },
    });
    const req = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": "t=1234567890,v1=deadbeefdeadbeefdeadbeefdeadbeef" },
      body: payload,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid signature/i);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects a genuinely-signed-but-then-tampered payload (body no longer matches what was signed)", async () => {
    const stripe = getStripeClient();
    const originalPayload = JSON.stringify({
      id: "evt_x",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_789" } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: originalPayload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });

    // An attacker (or a proxy that re-serialized the body) changes the bytes
    // after the signature was computed over the original payload.
    const tamperedPayload = JSON.stringify({
      id: "evt_x",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_999_stolen" } },
    });

    const { POST } = await import("@/app/api/billing/webhook/route");
    const req = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: tamperedPayload,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("accepts a genuinely-signed checkout.session.completed event and creates the subscription row", async () => {
    const stripe = getStripeClient();
    const payload = JSON.stringify({
      id: "evt_checkout_1",
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "user-xyz",
          customer: "cus_999",
          subscription: null,
          metadata: { user_id: "user-xyz", tier: "premium" },
        },
      },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });

    const { POST } = await import("@/app/api/billing/webhook/route");
    const req = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);

    expect(mockFrom).toHaveBeenCalledWith("subscriptions");
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toMatchObject({
      user_id: "user-xyz",
      status: "active",
      stripe_customer_id: "cus_999",
    });
  });

  it("accepts a genuinely-signed customer.subscription.updated event and syncs the tier from the Stripe price id", async () => {
    const stripe = getStripeClient();
    const payload = JSON.stringify({
      id: "evt_sub_updated_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          status: "active",
          customer: "cus_123",
          metadata: { user_id: "user-abc" },
          items: { data: [{ price: { id: "price_pro_test" } }] },
        },
      },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });

    const { POST } = await import("@/app/api/billing/webhook/route");
    const req = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toMatchObject({
      user_id: "user-abc",
      tier: "pro",
      status: "active",
      stripe_subscription_id: "sub_123",
    });
  });

  it("processes a genuinely-signed customer.subscription.deleted event by downgrading to free/canceled", async () => {
    const stripe = getStripeClient();
    const payload = JSON.stringify({
      id: "evt_sub_deleted_1",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_456" } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });

    const { POST } = await import("@/app/api/billing/webhook/route");
    const req = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toMatchObject({ tier: "free", status: "canceled" });
    expect(updateCalls[0].eqField).toBe("stripe_subscription_id");
    expect(updateCalls[0].eqValue).toBe("sub_456");
  });

  it("returns 503 and refuses to process (never verifies, never writes) when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    const original = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      const { POST } = await import("@/app/api/billing/webhook/route");
      const req = new Request("http://localhost/api/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=anything" },
        body: "{}",
      });
      const res = await POST(req);
      expect(res.status).toBe(503);
      expect(mockFrom).not.toHaveBeenCalled();
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = original;
    }
  });
});
