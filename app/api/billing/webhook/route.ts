import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient, getTierForPriceId } from "@/lib/billing/stripe";

/**
 * Stripe webhook handler (Prompt 82) — the ONLY place subscriptions.tier/
 * status are ever written from a payment event. Signature verification is
 * not optional here: without it, anyone who discovers this URL could POST
 * a fake "subscription active" event and grant themselves a paid tier for
 * free. Every code path below either verifies the signature first or
 * rejects the request — there is no path that trusts the parsed body
 * before constructEvent() has succeeded.
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[api/billing/webhook] STRIPE_WEBHOOK_SECRET not configured — refusing all webhook events.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // Raw body text is required for signature verification — request.json()
  // would parse-and-discard the exact bytes Stripe signed.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[api/billing/webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.user_id;
        if (!userId) {
          console.error("[api/billing/webhook] checkout.session.completed missing user_id reference");
          break;
        }

        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

        let tier: "pro" | "premium" = "pro";
        if (subscriptionId) {
          const stripe = getStripeClient();
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items.data[0]?.price.id;
          tier = (priceId && getTierForPriceId(priceId)) || (session.metadata?.tier as "pro" | "premium") || "pro";
        }

        await adminSupabase.from("subscriptions").upsert(
          {
            user_id: userId,
            tier,
            status: "active",
            stripe_customer_id: customerId || null,
            stripe_subscription_id: subscriptionId || null,
          },
          { onConflict: "user_id" },
        );
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.user_id;
        const priceId = subscription.items.data[0]?.price.id;
        const tier = (priceId && getTierForPriceId(priceId)) || "pro";

        if (userId) {
          await adminSupabase.from("subscriptions").upsert(
            {
              user_id: userId,
              tier,
              status: subscription.status,
              stripe_customer_id:
                typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
              stripe_subscription_id: subscription.id,
            },
            { onConflict: "user_id" },
          );
        } else {
          // Fall back to matching by stripe_subscription_id if metadata is
          // ever missing (e.g. subscription updated directly in the
          // Stripe dashboard rather than via our checkout flow).
          await adminSupabase
            .from("subscriptions")
            .update({ tier, status: subscription.status })
            .eq("stripe_subscription_id", subscription.id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await adminSupabase
          .from("subscriptions")
          .update({ tier: "free", status: "canceled" })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      default:
        // Unhandled event types are fine to ignore — Stripe sends many
        // event types we don't need to act on.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[api/billing/webhook] Error processing event ${event.type}:`, err);
    // Still 200 the request once the signature is verified and we've
    // logged the failure — a 500 here would make Stripe retry an event our
    // handler is deterministically failing on, and Stripe's own retry
    // schedule already covers transient failures via its dashboard.
    return NextResponse.json({ received: true, processingError: true });
  }
}
