import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ — Kalpla",
  description: "Answers to common questions about how Kalpla works, AI grading, and billing.",
};

const FAQS: Array<{ question: string; answer: React.ReactNode }> = [
  {
    question: "How is this different from a course platform?",
    answer: (
      <>
        A course platform sells you a fixed sequence of videos and a certificate at the end that says
        you watched them. Kalpla starts by measuring what you actually know with a real assessment,
        builds a roadmap around your specific gaps (not everyone&apos;s), and replaces the certificate
        with a public portfolio of projects you actually shipped and had reviewed. There&apos;s no
        &quot;course order&quot; to follow — the system adapts to you, and what you end up with is
        proof of work, not a PDF.
      </>
    ),
  },
  {
    question: "What if the AI grading is wrong?",
    answer: (
      <>
        Every AI grade ships with a confidence score, not just a number — low-confidence grades are
        flagged rather than presented as certain. For project submissions specifically, you can request
        a re-review if you think the review missed something (capped per submission, so it&apos;s a
        real second look, not an infinite retry loop). Assessment tasks also let you retake once your
        free monthly retake resets, so a single bad grade doesn&apos;t permanently cap your score.
      </>
    ),
  },
  {
    question: "Can I cancel anytime?",
    answer: (
      <>
        Yes. Manage or cancel your subscription anytime from the{" "}
        <Link href="/billing" className="text-telemetry-cyan hover:underline">
          billing page
        </Link>
        , which hands off to Stripe&apos;s own billing portal — we never store your card details
        ourselves. Cancelling stops future charges; you keep access through the end of the period you
        already paid for.
      </>
    ),
  },
  {
    question: "I'm a complete beginner — will this make sense to me?",
    answer: (
      <>
        The assessment includes an experience-level signal, and the AI tutor is built to explain a
        concept a different way if the first explanation didn&apos;t land, rather than assuming you
        got it. That said, this isn&apos;t a &quot;zero to hero&quot; intro-to-programming course —
        it assumes basic coding literacy and focuses specifically on GenAI engineering skills on top
        of that.
      </>
    ),
  },
  {
    question: "Is my code or project data private?",
    answer: (
      <>
        Your submissions and workspace code are scoped to your account. The only content you make
        public is what you explicitly choose to publish to your portfolio — nothing is published
        automatically.
      </>
    ),
  },
  {
    question: "What happens when I hit my monthly usage cap?",
    answer: (
      <>
        You&apos;ll see a heads-up once you cross 80% of a monthly limit (tutor messages, hints,
        etc.), well before you actually hit it, so you&apos;re never surprised mid-task. Hitting 100%
        shows a clear upgrade prompt instead of a raw error — your account and data are never affected,
        you just can&apos;t make more of that specific type of AI call until the next reset (or an
        upgrade).
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <>
      <section className="border-b border-steel-800 bg-observatory-base px-4 sm:px-6 py-16 sm:py-20 text-center telemetry-grid-bg">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-telemetry-cyan">FAQ</span>
        <h1 className="mx-auto mt-3 max-w-2xl text-3xl sm:text-4xl font-mono font-bold text-white">
          Frequently asked questions
        </h1>
      </section>

      <section className="px-4 sm:px-6 py-16">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {FAQS.map((faq, i) => {
            const panelId = `faq-answer-${i}`;
            return (
              // Native <details>/<summary> instead of a hand-rolled button+useState
              // accordion: <summary> is a real, keyboard-operable control with an
              // implicit ARIA role of "button" whose expanded/collapsed state the
              // browser derives automatically from the parent's `open` attribute —
              // the W3C ARIA Authoring Practices lists this as an accepted native
              // disclosure pattern. It also lets this page stay a Server Component
              // (Next.js doesn't allow `export const metadata` from a "use client"
              // file, which a useState-driven trigger would require). aria-controls
              // + a matching id are added explicitly below for extra clarity.
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
      </section>
    </>
  );
}
