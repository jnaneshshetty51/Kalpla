import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient, isStripeConfigured, getPriceIdForTier, BillableTier } from "@/lib/billing/stripe";

/**
 * Creates a Stripe Checkout session for upgrading to a paid tier (Prompt
 * 82). subscriptions.tier/status are NOT set here — they're only ever
 * synced from the webhook handler once Stripe confirms the subscription is
 * actually active, so a user can't grant themselves a paid tier just by
 * hitting this endpoint.
 */
export async function POST(request: Request) {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Billing is not configured on this deployment." },
        { status: 503 },
      );
    }

    let body: { tier?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { tier } = body;
    if (tier !== "pro" && tier !== "premium") {
      return NextResponse.json({ error: "Invalid 'tier': expected 'pro' or 'premium'" }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const { data: subscription } = await adminSupabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const stripe = getStripeClient();
    const baseUrl = new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: getPriceIdForTier(tier as BillableTier), quantity: 1 }],
      // Reuse an existing Stripe customer if we already have one for this
      // user (from a prior subscription), otherwise let Stripe create one
      // and we'll capture its ID from the webhook.
      ...(subscription?.stripe_customer_id
        ? { customer: subscription.stripe_customer_id }
        : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata: { user_id: user.id, tier },
      subscription_data: { metadata: { user_id: user.id, tier } },
      success_url: `${baseUrl}/billing?checkout=success`,
      cancel_url: `${baseUrl}/billing?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Error in POST /api/billing/checkout:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
