import Link from "next/link";
import type { Metadata } from "next";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";

export const metadata: Metadata = {
  title: "How Kalpla Works — Assessment to Portfolio",
  description:
    "The full journey from a free skill assessment to a personalized roadmap, an AI tutor, a real project ladder, and a verified public portfolio.",
};

const STEPS = [
  {
    step: 1,
    title: "Take the free skill assessment",
    summary: "A mix of multiple-choice, short-answer, and live-code tasks across the core GenAI engineering skill areas.",
    details: [
      "Covers tokenization & context windows, transformer architecture, prompting, RAG, agents, evaluation, and more.",
      "AI-graded within minutes, with a confidence score attached to every grade — not a black box.",
      "Produces a competency score per skill node, not just a single pass/fail number.",
    ],
  },
  {
    step: 2,
    title: "Get a personalized roadmap",
    summary: "Your lowest-scoring skill areas are sequenced first, respecting real prerequisite dependencies.",
    details: [
      "The roadmap is a dependency graph, not a flat list — you won't be asked to learn agents before you understand prompting.",
      "Regenerates as your competency scores change, so it never goes stale.",
      "Every node links straight to the lesson and tutor context for that specific gap.",
    ],
  },
  {
    step: 3,
    title: "Learn with an AI tutor",
    summary: "A Socratic tutor grounded in the actual lesson content for the skill node you're on.",
    details: [
      "Ask questions in plain language and get answers grounded in the specific concept you're stuck on.",
      "Can re-explain a concept a different way if the first explanation didn't land.",
      "Checks your understanding before moving you forward, instead of assuming a lesson read is a lesson learned.",
    ],
  },
  {
    step: 4,
    title: "Build real projects",
    summary: "A ladder of RAG and agent projects that unlock as your prerequisite skills clear a competency threshold.",
    details: [
      "Real specs with test cases — not toy exercises. Think: a working RAG chatbot, an agent tool router, an eval harness.",
      "AI code review against the project's actual rubric, with hints available if you get stuck (usage-capped, not unlimited).",
      "A reflection prompt after each submission turns the project into something you can actually talk about in an interview.",
    ],
  },
  {
    step: 5,
    title: "Publish a verified portfolio",
    summary: "A public page showing your real competency scores and shipped projects — not a certificate of attendance.",
    details: [
      "Recruiters and hiring managers see live competency scores, not a static PDF.",
      "Each published project can include an AI-generated case study summarizing what you built and why.",
      "Nothing on the portfolio is self-reported — every score traces back to a graded assessment or a reviewed submission.",
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="border-b border-steel-800 bg-observatory-base px-4 sm:px-6 py-16 sm:py-20 text-center telemetry-grid-bg">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-telemetry-cyan">The Journey</span>
        <h1 className="mx-auto mt-3 max-w-2xl text-3xl sm:text-4xl font-mono font-bold text-white">
          From your first assessment to a verified portfolio
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-steel-400 font-sans">
          No fixed course order. No certificate at the end. Just a system that finds your gaps and proves you closed them.
        </p>
      </section>

      <section className="px-4 sm:px-6 py-16">
        <div className="mx-auto flex max-w-3xl flex-col gap-10">
          {STEPS.map((s, i) => (
            <div key={s.step} className="relative flex gap-5">
              <div className="flex flex-col items-center">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-telemetry-cyan font-mono text-sm font-bold text-observatory-base shadow-telemetry-cyan">
                  {s.step}
                </span>
                {i < STEPS.length - 1 && <div className="mt-2 w-px flex-1 bg-steel-800" />}
              </div>
              <div className="pb-2">
                <h2 className="font-mono text-lg font-bold text-white">{s.title}</h2>
                <p className="mt-1.5 text-sm text-steel-300 font-sans">{s.summary}</p>
                <ul className="mt-4 flex flex-col gap-2">
                  {s.details.map((d) => (
                    <li key={d} className="flex gap-2 text-xs leading-relaxed text-steel-400 font-sans">
                      <span className="mt-0.5 text-telemetry-cyan" aria-hidden="true">→</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-steel-800/80 px-4 sm:px-6 py-16 text-center">
        <h2 className="font-mono text-xl font-bold text-white">Ready to see your own skill breakdown?</h2>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <AuthAwareCTA
            signedOutHref="/signup"
            signedOutLabel="Take the free skill assessment →"
            signedInHref="/dashboard"
            signedInLabel="Go to your dashboard →"
            className="rounded-xl bg-telemetry-cyan px-6 py-3 font-mono text-sm font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white"
          />
          <Link
            href="/pricing"
            className="rounded-xl border border-steel-700 bg-observatory-panel px-6 py-3 font-mono text-sm font-semibold text-steel-200 transition hover:bg-steel-800"
          >
            View pricing
          </Link>
        </div>
      </section>
    </>
  );
}
