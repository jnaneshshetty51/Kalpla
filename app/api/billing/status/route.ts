import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TIER_LIMITS } from "@/lib/llm/limits";
import { isStripeConfigured } from "@/lib/billing/stripe";

/**
 * Feeds the /billing page's plan summary and usage meters (Prompt 83).
 */
export async function GET() {
  try {
    const { user } = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing session" },
        { status: 401 },
      );
    }

    const adminSupabase = createAdminClient();
    const { data: subscription } = await adminSupabase
      .from("subscriptions")
      .select("tier, status, usage_this_period, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const tier = subscription?.tier || "free";
    const usage = (subscription?.usage_this_period as Record<string, number>) || {};
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;

    const categories = ["tutor", "assessment", "roadmap", "mock_interview", "default"] as const;
    const meters = categories.map((category) => {
      const limit = limits[category];
      const used = usage[category] || 0;
      return {
        category,
        used,
        limit: limit === Infinity ? null : limit,
        percentUsed: limit === Infinity || limit === 0 ? 0 : Math.round((used / limit) * 100),
      };
    });

    return NextResponse.json({
      tier,
      status: subscription?.status || "active",
      meters,
      stripe_configured: isStripeConfigured(),
    });
  } catch (err) {
    console.error("Error in GET /api/billing/status:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
