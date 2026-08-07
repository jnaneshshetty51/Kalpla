export interface TimelineStep {
  step: number;
  title: string;
  summary: string;
  detail?: string[];
}

export interface StepTimelineProps {
  steps: TimelineStep[];
  /**
   * "full" mirrors app/(marketing)/how-it-works/page.tsx's vertical
   * numbered-circle timeline (title + summary + detail bullets). "compact"
   * drops the detail bullets and lays horizontally on sm:+ so it reads as a
   * quick recap rather than a repeat of the full timeline elsewhere on the
   * same page.
   */
  variant?: "full" | "compact";
}

export function StepTimeline({ steps, variant = "full" }: StepTimelineProps) {
  if (variant === "compact") {
    return (
      <div className="flex flex-col sm:flex-row sm:items-start gap-8 sm:gap-4">
        {steps.map((s, i) => (
          <div key={s.step} className="flex sm:flex-col items-start sm:items-center gap-4 sm:gap-3 sm:flex-1 sm:text-center">
            <div className="flex sm:flex-row items-center gap-2 shrink-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-telemetry-cyan font-mono text-xs font-bold text-observatory-base shadow-telemetry-cyan">
                {s.step}
              </span>
              {i < steps.length - 1 && (
                <>
                  <div className="hidden sm:block h-px flex-1 bg-steel-800 min-w-[16px]" />
                  <div className="sm:hidden w-px h-6 bg-steel-800 ml-[17px]" />
                </>
              )}
            </div>
            <div>
              <h3 className="font-mono text-sm font-bold text-white">{s.title}</h3>
              <p className="mt-1 text-xs text-steel-400 font-sans leading-relaxed">{s.summary}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {steps.map((s, i) => (
        <div key={s.step} className="relative flex gap-5">
          <div className="flex flex-col items-center">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-telemetry-cyan font-mono text-sm font-bold text-observatory-base shadow-telemetry-cyan">
              {s.step}
            </span>
            {i < steps.length - 1 && <div className="mt-2 w-px flex-1 bg-steel-800" />}
          </div>
          <div className="pb-2">
            <h3 className="font-mono text-lg font-bold text-white">{s.title}</h3>
            <p className="mt-1.5 text-sm text-steel-300 font-sans">{s.summary}</p>
            {s.detail && s.detail.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {s.detail.map((d) => (
                  <li key={d} className="flex gap-2 text-xs leading-relaxed text-steel-400 font-sans">
                    <span className="mt-0.5 text-telemetry-cyan" aria-hidden="true">→</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
