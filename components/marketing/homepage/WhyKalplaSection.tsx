import { ReadinessGauge } from "@/components/ui/ReadinessGauge";

/**
 * Reframed version of the platform's existing "Signature Diagnostic"
 * section (formerly app/(marketing)/page.tsx:206-259) — same layout and
 * signature ReadinessGauge visual, recontextualized from "diagnostic vs.
 * traditional courseware" to "project-verified vs. video-certificate
 * platforms" per the single-flagship-product positioning.
 */
export function WhyKalplaSection() {
  return (
    <section className="px-4 sm:px-6 py-20 border-b border-steel-800 bg-observatory-panel/40">
      <div className="mx-auto max-w-5xl">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="font-mono text-xs font-bold text-telemetry-cyan uppercase tracking-widest">
            Why Kalpla
          </span>
          <h2 className="text-2xl sm:text-3xl font-mono font-bold text-white mt-2">
            A career transformation, not a video library
          </h2>
          <p className="text-sm text-steel-400 font-sans mt-3 leading-relaxed">
            Most &quot;AI courses&quot; end in a certificate of attendance. Kalpla ends in verified, scored, shippable work — the kind a hiring manager can actually inspect.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="flex flex-col gap-5 font-mono text-xs">
            <div className="rounded-2xl border border-steel-800 bg-observatory-panel p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white">Traditional Course Platform</span>
                <span className="text-vulnerability-crimson font-bold">Watch &amp; Forget</span>
              </div>
              <p className="text-steel-400 font-sans text-xs leading-relaxed">
                Watch videos → take quizzes → get a certificate → done. No verification that you can actually build anything, and nothing to show for it beyond a PDF.
              </p>
            </div>

            <div className="rounded-2xl border border-telemetry-cyan/40 bg-telemetry-cyan/5 p-5 telemetry-glow-cyan">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-telemetry-cyan">Kalpla Accelerator</span>
                <span className="text-precision-emerald font-bold">Verified</span>
              </div>
              <p className="text-steel-300 font-sans text-xs leading-relaxed">
                AI assessment → personal roadmap → AI mentor + human classes → real projects → public portfolio → mock interviews → placement assistance → career.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center p-6 rounded-3xl border border-steel-800 bg-observatory-base">
            <ReadinessGauge
              score={84}
              benchmark={70}
              variant="radial"
              size="lg"
              label="Production Ready Benchmark Target"
            />
            <div className="mt-6 text-center font-mono text-xs">
              <p className="text-precision-emerald font-bold">Real competency scores, not self-reported skills</p>
              <p className="text-steel-400 text-[11px] mt-1">Every score traces back to a graded assessment or a reviewed submission</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
