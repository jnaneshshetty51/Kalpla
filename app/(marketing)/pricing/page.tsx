import Link from "next/link";
import type { Metadata } from "next";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";
import { TIER_LIMITS } from "@/lib/llm/limits";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const metadata: Metadata = {
  title: "Kalpla Pricing — Free, Pro, and Premium tiers",
  description: "Compare Kalpla's free, Pro, and Premium plans and their monthly usage limits.",
};

/**
 * Every number below reads from lib/llm/limits.ts's TIER_LIMITS — the same
 * config lib/llm/usageCap.ts enforces server-side (Prompt 81) — so this
 * page can't silently drift from what's actually enforced. Only the
 * english labels/descriptions and the dollar amounts are hand-written
 * here: this codebase has no source of truth for the latter (the actual
 * charge amount lives in Stripe's dashboard against STRIPE_PRICE_ID_PRO/
 * PREMIUM, not in application code), so we deliberately don't fabricate a
 * "$29/mo"-style figure that could drift from what Stripe actually charges.
 */
const FEATURE_ROWS: Array<{ label: string; key: keyof (typeof TIER_LIMITS)["free"]; note?: string }> = [
  { label: "AI tutor messages / month", key: "tutor" },
  { label: "Assessment gradings / month", key: "assessment", note: "includes the initial assessment + retakes" },
  { label: "Roadmap generations / month", key: "roadmap" },
  { label: "Mock interviews / month", key: "mock_interview", note: "coming soon" },
  { label: "Other AI features / month", key: "default", note: "hints, reference solutions, project reviews" },
];

function formatLimit(value: number): string {
  return value === Infinity ? "Unlimited" : String(value);
}

const TIERS: Array<{
  id: keyof typeof TIER_LIMITS;
  name: string;
  price: string;
  priceNote: string;
  highlight: boolean;
  cta: { label: string; href: string };
}> = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    priceNote: "forever",
    highlight: false,
    cta: { label: "Take the free assessment", href: "/signup" },
  },
  {
    id: "pro",
    name: "Pro",
    price: "Paid",
    priceNote: "billed monthly via Stripe — see checkout for the current price",
    highlight: true,
    cta: { label: "Upgrade to Pro", href: "/billing" },
  },
  {
    id: "premium",
    name: "Premium",
    price: "Paid",
    priceNote: "unlimited usage across every feature",
    highlight: false,
    cta: { label: "Upgrade to Premium", href: "/billing" },
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="border-b border-steel-800 bg-observatory-base px-4 sm:px-6 py-16 sm:py-20 text-center telemetry-grid-bg">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-telemetry-cyan">Pricing</span>
        <h1 className="mx-auto mt-3 max-w-2xl text-3xl sm:text-4xl font-mono font-bold text-white">
          Start free, upgrade when the caps get in your way
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-steel-400 font-sans">
          The free tier is enough to complete the assessment, get a roadmap, and start learning. Upgrade
          for higher limits and (soon) mock interviews.
        </p>
      </section>

      <section className="px-4 sm:px-6 py-16">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3">
          {TIERS.map((tier) => (
            <Card key={tier.id} variant={tier.highlight ? "glow" : "default"}>
              {tier.highlight && (
                <Badge variant="info" dot={false} className="mb-3">
                  Most popular
                </Badge>
              )}
              <h2 className="font-mono text-lg font-bold text-white">{tier.name}</h2>
              <p className="mt-2 font-mono text-2xl font-extrabold text-white">{tier.price}</p>
              <p className="mt-1 text-xs text-steel-400 font-sans">{tier.priceNote}</p>

              <ul className="mt-6 flex flex-col gap-3">
                {FEATURE_ROWS.map((row) => (
                  <li key={row.key} className="flex items-start justify-between gap-3 text-xs font-sans">
                    <span className="text-steel-400">
                      {row.label}
                      {row.note && <span className="block text-[10px] text-steel-400">{row.note}</span>}
                    </span>
                    <span className="shrink-0 font-mono font-semibold text-steel-200">
                      {formatLimit(TIER_LIMITS[tier.id][row.key])}
                    </span>
                  </li>
                ))}
              </ul>

              {tier.id === "free" ? (
                <AuthAwareCTA
                  signedOutHref={tier.cta.href}
                  signedOutLabel={tier.cta.label}
                  signedInHref="/dashboard"
                  signedInLabel="Go to your dashboard →"
                  className={`mt-6 block w-full rounded-xl px-4 py-2.5 text-center font-mono text-sm font-semibold transition ${
                    tier.highlight
                      ? "bg-telemetry-cyan text-observatory-base shadow-telemetry-cyan hover:bg-white"
                      : "border border-steel-700 bg-observatory-base text-steel-200 hover:bg-steel-800"
                  }`}
                />
              ) : (
                <Link
                  href={tier.cta.href}
                  className={`mt-6 block w-full rounded-xl px-4 py-2.5 text-center font-mono text-sm font-semibold transition ${
                    tier.highlight
                      ? "bg-telemetry-cyan text-observatory-base shadow-telemetry-cyan hover:bg-white"
                      : "border border-steel-700 bg-observatory-base text-steel-200 hover:bg-steel-800"
                  }`}
                >
                  {tier.cta.label}
                </Link>
              )}
            </Card>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-steel-400 font-sans">
          All limits reset monthly. Upgrading or managing your plan happens on the{" "}
          <Link href="/billing" className="text-telemetry-cyan hover:underline">
            billing page
          </Link>{" "}
          once you&apos;re signed in.
        </p>
      </section>
    </>
  );
}
