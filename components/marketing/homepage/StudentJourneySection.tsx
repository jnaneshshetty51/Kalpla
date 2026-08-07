import { StepTimeline } from "./StepTimeline";
import { HOW_IT_WORKS_STEPS } from "./HowItWorksSection";

/**
 * Compact recap of the same 6 steps as HowItWorksSection — titles + one-line
 * summaries only, horizontal on sm:+ so it visually reads as a "big picture"
 * moment before Placement Assistance/Pricing, not a repeat of the earlier
 * detailed timeline.
 */
export function StudentJourneySection() {
  return (
    <section className="px-4 sm:px-6 py-20 border-b border-steel-800 bg-observatory-panel/30">
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <span className="font-mono text-xs font-bold text-telemetry-cyan uppercase tracking-widest">
            The Journey
          </span>
          <h2 className="text-2xl sm:text-3xl font-mono font-bold text-white mt-2">
            Join. Build. Ship. Get hired-ready.
          </h2>
        </div>

        <StepTimeline steps={HOW_IT_WORKS_STEPS} variant="compact" />
      </div>
    </section>
  );
}
