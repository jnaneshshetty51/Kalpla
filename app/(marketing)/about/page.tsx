import type { Metadata } from "next";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";

export const metadata: Metadata = {
  title: "About Kalpla",
  description: "Why Kalpla exists, and why it's built as a career operating system rather than a course catalog.",
};

export default function AboutPage() {
  return (
    <>
      <section className="border-b border-steel-800 bg-observatory-base px-4 sm:px-6 py-16 sm:py-20 text-center telemetry-grid-bg">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-telemetry-cyan">About</span>
        <h1 className="mx-auto mt-3 max-w-2xl text-3xl sm:text-4xl font-mono font-bold text-white">
          A career operating system, not a course catalog
        </h1>
      </section>

      <section className="px-4 sm:px-6 py-16">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 text-sm leading-relaxed text-steel-300 font-sans">
          <p>
            Kalpla started from a specific frustration: every &quot;learn GenAI engineering&quot;
            course we tried taught the same fixed sequence of videos to everyone, regardless of what
            you already knew, and ended with a certificate that proved nothing except that you clicked
            play through to the end. Meanwhile, the actual skill of GenAI engineering — building
            retrieval pipelines that don&apos;t hallucinate, agents that don&apos;t loop forever,
            evaluations that catch regressions before users do — was something you could only really
            prove by shipping it.
          </p>
          <p>
            So we built the thing we wished existed: a system that starts by measuring what you
            actually know, builds a path around the gaps that are specific to you, teaches through an
            AI tutor rather than a fixed video queue, and — this is the part that matters most — ends
            with real projects you built and had reviewed, not a PDF. A portfolio you can point a
            hiring manager at and say &quot;I built this, here&apos;s the score, here&apos;s the code.&quot;
          </p>
          <p>
            We think about Kalpla less as a course platform and more as a career operating system: the
            thing that sits underneath your job search and tells you, honestly, what you&apos;re ready
            for and what you&apos;re not yet — and then closes that gap instead of just flagging it.
            That&apos;s a different job than &quot;deliver video content,&quot; and it&apos;s why the
            assessment, the roadmap, the tutor, the project ladder, and the portfolio are one connected
            system instead of four separate products bolted together.
          </p>
          <p>
            We&apos;re early, and GenAI engineering itself is still a moving target — the skill areas
            that matter today weren&apos;t fully formed two years ago, and they&apos;ll keep shifting.
            That&apos;s a feature of building this as a system rather than a fixed curriculum: it can
            adapt as the field does, instead of going stale the way a recorded course does the moment
            the underlying tools change.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-2xl border-t border-steel-800/80 pt-10 text-center">
          <h2 className="font-mono text-lg font-bold text-white">Want to see where you actually stand?</h2>
          <div className="mt-5">
            <AuthAwareCTA
              signedOutHref="/signup"
              signedOutLabel="Take the free skill assessment →"
              signedInHref="/dashboard"
              signedInLabel="Go to your dashboard →"
              className="inline-block rounded-xl bg-telemetry-cyan px-6 py-3 font-mono text-sm font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white"
            />
          </div>
        </div>
      </section>
    </>
  );
}
