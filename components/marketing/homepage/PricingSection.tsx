import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";
import { PROGRAM_NAME, PROGRAM_DURATION, PRICE_INR, INSTALLMENT_NOTE } from "@/lib/marketing/acceleratorFacts";

const INCLUDES = [
  `${PROGRAM_DURATION}, project-based curriculum`,
  "AI Mentor — 24/7 tutoring & code review",
  "Weekly live sessions with human mentors",
  "3 real, reviewed projects",
  "Verified public portfolio",
  "2 live mock interviews",
  "Placement assistance",
];

export function PricingSection() {
  return (
    <section className="px-4 sm:px-6 py-20 bg-observatory-base">
      <div className="mx-auto max-w-lg text-center">
        <span className="font-mono text-xs font-bold text-telemetry-cyan uppercase tracking-widest">
          Pricing
        </span>
        <h2 className="text-2xl sm:text-3xl font-mono font-bold text-white mt-2">
          One program. One price.
        </h2>

        <Card variant="glow" className="mt-8 text-left">
          <Badge variant="info" dot={false} className="mb-3">
            Founding Cohort
          </Badge>
          <h3 className="font-mono text-lg font-bold text-white">{PROGRAM_NAME}</h3>

          <ul className="mt-5 flex flex-col gap-2.5">
            {INCLUDES.map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs font-mono text-steel-300">
                <span className="text-precision-emerald shrink-0" aria-hidden="true">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 pt-5 border-t border-steel-800">
            <p className="font-mono text-3xl font-extrabold text-white">{PRICE_INR}</p>
            <p className="mt-1 text-xs text-steel-400 font-sans">{INSTALLMENT_NOTE} · founding-cohort pricing, future cohorts priced higher</p>
          </div>

          <AuthAwareCTA
            signedOutHref="/signup"
            signedOutLabel="Apply Now →"
            signedInHref="/dashboard"
            signedInLabel="Go to your dashboard →"
            className="mt-6 block w-full rounded-xl bg-telemetry-cyan px-4 py-3 text-center font-mono text-sm font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white"
          />

          <p className="mt-3 text-center text-[11px] text-steel-500 font-sans">
            <Link href="/refund" className="text-telemetry-cyan hover:underline">
              Full refund &amp; cancellation policy →
            </Link>
          </p>
        </Card>
      </div>
    </section>
  );
}
