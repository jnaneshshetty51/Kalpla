import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";
import { SITE_URL } from "@/lib/marketing/siteConfig";
import { PROGRAM_NAME, PROGRAM_DURATION, PRICE_INR, INSTALLMENT_NOTE } from "@/lib/marketing/acceleratorFacts";
import { HeroSection } from "@/components/marketing/homepage/HeroSection";
import { WhyKalplaSection } from "@/components/marketing/homepage/WhyKalplaSection";
import { HowItWorksSection } from "@/components/marketing/homepage/HowItWorksSection";
import { CurriculumPreviewSection } from "@/components/marketing/homepage/CurriculumPreviewSection";
import { AIMentorSection } from "@/components/marketing/homepage/AIMentorSection";
import { BuildRealProductsSection } from "@/components/marketing/homepage/BuildRealProductsSection";
import { StudentJourneySection } from "@/components/marketing/homepage/StudentJourneySection";
import { PlacementAssistanceSection } from "@/components/marketing/homepage/PlacementAssistanceSection";
import { PricingSection } from "@/components/marketing/homepage/PricingSection";

export const metadata: Metadata = {
  title: `Kalpla — ${PROGRAM_NAME}`,
  description: `Become an industry-ready GenAI Engineer with an AI mentor, expert instructors, real-world projects, and placement assistance. ${PROGRAM_DURATION}, ${PRICE_INR}.`,
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Kalpla",
  url: SITE_URL,
  description: `The ${PROGRAM_NAME} — a ${PROGRAM_DURATION} program combining an AI-powered learning platform with real human mentorship, real projects, and placement assistance.`,
};

// No real usage numbers exist yet (pre-launch) — qualitative trust signals
// instead of fabricated stats, per this session's established rule against
// inventing metrics.
const TRUST_SIGNALS = [
  "AI-powered learning",
  "Real-world projects",
  "Weekly mentor sessions",
  "Career coaching",
  "Placement assistance",
];

// No real hiring-partner data exists — text categories only, never a
// specific company name/logo without a confirmed real partnership.
const HIRING_CATEGORIES = ["AI-native startups", "Enterprise SaaS", "Product companies", "IT services firms"];

const FAQS: Array<{ question: string; answer: React.ReactNode }> = [
  {
    question: "How is this different from a course platform?",
    answer:
      "A course platform sells you a fixed sequence of videos and a certificate at the end. Kalpla starts by measuring what you actually know, builds a roadmap around your specific gaps, and replaces the certificate with a public portfolio of projects you actually shipped and had reviewed.",
  },
  {
    question: "What if the AI grading is wrong?",
    answer:
      "Every AI grade ships with a confidence score, not just a number — low-confidence grades are flagged rather than presented as certain. You can request a re-review on project submissions, capped per submission so it's a real second look.",
  },
  {
    question: "Are mock interviews AI or human?",
    answer: (
      <>
        Human. In this cohort, every mock interview is a live conversation with a human mentor — not an
        automated feature. See{" "}
        <Link href="/faq" className="text-telemetry-cyan hover:underline">
          the full FAQ
        </Link>{" "}
        for more.
      </>
    ),
  },
  {
    question: "Do you guarantee a job?",
    answer:
      "No. We provide real placement assistance — resume/portfolio review, mock interviews, and referrals — but no program can guarantee an employment outcome, and we won't claim otherwise.",
  },
];

export default function MarketingLandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c"),
        }}
      />

      <HeroSection />

      {/* TRUST: qualitative signals — no fabricated numbers */}
      <section className="px-4 sm:px-6 py-10 border-b border-steel-800 bg-observatory-panel/20">
        <div className="mx-auto max-w-5xl flex flex-wrap items-center justify-center gap-3">
          {TRUST_SIGNALS.map((signal) => (
            <span
              key={signal}
              className="inline-flex items-center gap-2 rounded-full border border-steel-800 bg-observatory-panel px-3.5 py-1.5 font-mono text-xs font-semibold text-steel-300"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-precision-emerald" aria-hidden="true" />
              {signal}
            </span>
          ))}
        </div>
      </section>

      <WhyKalplaSection />
      <HowItWorksSection />
      <CurriculumPreviewSection />
      <AIMentorSection />
      <BuildRealProductsSection />

      {/* INDUSTRY EXPERTS: generic framing — no fabricated names/photos/companies */}
      <section className="px-4 sm:px-6 py-20 border-b border-steel-800 bg-observatory-panel/40">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-xs font-bold text-telemetry-cyan uppercase tracking-widest">
            Learn From Industry Experts
          </span>
          <h2 className="text-2xl sm:text-3xl font-mono font-bold text-white mt-2">
            Taught by practitioners, not narrators
          </h2>
          <p className="text-sm text-steel-400 font-sans mt-3 leading-relaxed">
            Live classes and architecture sessions are led by engineers who&apos;ve shipped production AI
            systems — not read from a script. Mentor profiles will be published here as the cohort&apos;s
            mentor roster is confirmed.
          </p>
        </div>
      </section>

      <StudentJourneySection />
      <PlacementAssistanceSection />

      {/* HIRING COMPANIES: no confirmed partners yet — text categories, not logos */}
      <section className="px-4 sm:px-6 py-16 border-b border-steel-800 bg-observatory-base">
        <div className="mx-auto max-w-3xl text-center">
          <span className="font-mono text-xs font-bold text-telemetry-cyan uppercase tracking-widest">
            Companies Our Curriculum Prepares You For
          </span>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            {HIRING_CATEGORIES.map((cat) => (
              <span
                key={cat}
                className="rounded-full border border-steel-800 bg-observatory-panel px-4 py-2 font-mono text-xs font-semibold text-steel-300"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      </section>

      <PricingSection />

      {/* FAQ: condensed, same accessible <details> pattern as /faq */}
      <section className="px-4 sm:px-6 py-20 border-t border-steel-800/80">
        <div className="mx-auto max-w-2xl">
          <div className="text-center mb-10">
            <span className="font-mono text-xs font-bold text-telemetry-cyan uppercase tracking-widest">FAQ</span>
            <h2 className="text-2xl sm:text-3xl font-mono font-bold text-white mt-2">Frequently asked questions</h2>
          </div>

          <div className="flex flex-col gap-3">
            {FAQS.map((faq, i) => {
              const panelId = `home-faq-answer-${i}`;
              return (
                <details
                  key={faq.question}
                  className="group rounded-2xl border border-steel-800 bg-observatory-panel/60 p-5 open:border-telemetry-cyan/40 transition"
                >
                  <summary
                    aria-controls={panelId}
                    className="cursor-pointer list-none font-mono text-sm font-semibold text-white marker:content-none"
                  >
                    <span className="flex items-center justify-between gap-4">
                      {faq.question}
                      <span className="shrink-0 text-steel-400 transition group-open:rotate-45" aria-hidden="true">
                        +
                      </span>
                    </span>
                  </summary>
                  <p id={panelId} className="mt-3 text-sm leading-relaxed text-steel-400 font-sans">
                    {faq.answer}
                  </p>
                </details>
              );
            })}
          </div>

          <p className="text-center mt-8">
            <Link href="/faq" className="font-mono text-xs font-semibold text-telemetry-cyan hover:underline">
              View the full FAQ →
            </Link>
          </p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-4 sm:px-6 py-20 bg-observatory-base text-center telemetry-grid-bg border-t border-steel-800">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-mono font-bold text-white">
            Ready to become a GenAI Engineer?
          </h2>
          <p className="mt-3 text-sm text-steel-400 max-w-xl mx-auto font-sans">
            Join India&apos;s AI-native career platform and build the skills companies are hiring for.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <AuthAwareCTA
                signedOutHref="/signup"
                signedOutLabel="Apply Now →"
                signedInHref="/dashboard"
                signedInLabel="Go to your console dashboard →"
                className="rounded-xl bg-telemetry-cyan px-8 py-4 font-mono text-sm font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white text-center"
              />
              <Link
                href="/faq"
                className="rounded-xl border border-steel-700 bg-observatory-panel px-8 py-4 font-mono text-sm font-semibold text-steel-200 hover:bg-steel-800 transition text-center"
              >
                Book a Career Consultation
              </Link>
            </div>
            <p className="font-mono text-xs text-steel-400">
              {PRICE_INR} · {INSTALLMENT_NOTE} ·{" "}
              <Link href="/refund" className="text-telemetry-cyan hover:underline">
                refund policy
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
