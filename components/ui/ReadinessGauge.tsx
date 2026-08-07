"use client";

import React, { useEffect, useState } from "react";
import { computeReadinessGaugeStatus } from "@/lib/ui/readinessGaugeStatus";

export interface ReadinessGaugeProps {
  score: number; // 0 to 100
  benchmark?: number; // Target benchmark (default 70 for Production Ready)
  variant?: "linear" | "radial" | "badge";
  label?: string;
  showDelta?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  /**
   * Opt-in count-up-on-mount, for the one place this score is a genuine
   * reveal (assessment results, right after grading) rather than routine
   * status telemetry. Everywhere else — the header stat, the dashboard,
   * the design-system reference — the gauge should just display its value,
   * not re-animate on every render; re-triggering this on a page someone
   * checks repeatedly would read as noise, not a moment.
   */
  animateReveal?: boolean;
}

export function ReadinessGauge({
  score,
  benchmark = 70,
  variant = "linear",
  label = "Readiness Score",
  showDelta = true,
  size = "md",
  className = "",
  animateReveal = false,
}: ReadinessGaugeProps) {
  // Starts at 0 and steps up to the real score one tick after mount, so the
  // existing transition-all on the fill bar/arc — previously a no-op,
  // since React painted the final width on first render with nothing to
  // transition from — has something to animate. Only engaged when
  // animateReveal is set; otherwise displayScore just tracks score
  // directly, no extra render in between. Under prefers-reduced-motion the
  // global transition-duration override in globals.css collapses this to
  // instant, so the score still lands correctly.
  const [revealedScore, setRevealedScore] = useState(0);

  useEffect(() => {
    if (!animateReveal) return;
    const raf = requestAnimationFrame(() => setRevealedScore(score));
    return () => cancelAnimationFrame(raf);
  }, [animateReveal, score]);

  const displayScore = animateReveal ? revealedScore : score;
  const { normalizedScore, delta, isMastered, isProdReady, isFoundational, statusLabel } =
    computeReadinessGaugeStatus(displayScore, benchmark);

  // Color mappings
  const primaryColorClass = isMastered
    ? "text-precision-emerald"
    : isProdReady
    ? "text-telemetry-cyan"
    : isFoundational
    ? "text-calibrated-amber"
    : "text-vulnerability-crimson";

  const bgGradient = isMastered
    ? "from-emerald-500 to-teal-400"
    : isProdReady
    ? "from-telemetry-cyan to-cyan-400"
    : isFoundational
    ? "from-amber-500 to-yellow-400"
    : "from-rose-600 to-rose-400";

  const glowShadow = isMastered
    ? "shadow-telemetry-emerald"
    : isProdReady
    ? "shadow-telemetry-cyan"
    : isFoundational
    ? "shadow-telemetry-amber"
    : "";

  // Shared accessible identity for all three variants — a sighted user
  // reads the score from the visual (arc position, fill width, or badge
  // text), so a screen reader needs the equivalent as a single meter
  // announcement rather than piecing it together from decorative SVG
  // paths and repeated text nodes.
  const meterProps = {
    role: "meter" as const,
    "aria-valuenow": normalizedScore,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuetext": `${normalizedScore}%, ${statusLabel.toLowerCase()}, target ${benchmark}%`,
    "aria-label": label || "Readiness score",
  };

  // -------------------------------------------------------------
  // Variant 1: BADGE
  // -------------------------------------------------------------
  if (variant === "badge") {
    return (
      <div
        {...meterProps}
        className={`inline-flex items-center gap-1.5 rounded-full border border-steel-800 bg-observatory-panel px-2.5 py-1 font-mono text-xs ${className}`}
      >
        <span className={`h-2 w-2 rounded-full ${primaryColorClass.replace("text-", "bg-")}`} aria-hidden="true" />
        <span className="font-bold font-tabular text-steel-50" aria-hidden="true">{normalizedScore}%</span>
        <span className="text-[10px] text-steel-400 font-semibold uppercase" aria-hidden="true">{statusLabel}</span>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Variant 2: RADIAL (SVG Arc Gauge)
  // -------------------------------------------------------------
  if (variant === "radial") {
    const strokeWidth = size === "sm" ? 6 : size === "lg" ? 10 : 8;
    const radius = size === "sm" ? 28 : size === "lg" ? 48 : 38;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (normalizedScore / 100) * circumference;
    const benchmarkDashoffset = circumference - (benchmark / 100) * circumference;

    const dimensions = (radius + strokeWidth) * 2;

    return (
      <div {...meterProps} className={`flex flex-col items-center justify-center font-mono ${className}`}>
        <div className="relative flex items-center justify-center">
          <svg
            width={dimensions}
            height={dimensions}
            className="transform -rotate-90"
            aria-hidden="true"
          >
            {/* Background ring */}
            <circle
              cx={dimensions / 2}
              cy={dimensions / 2}
              r={radius}
              stroke="#1E293B"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Benchmark tick line */}
            <circle
              cx={dimensions / 2}
              cy={dimensions / 2}
              r={radius}
              stroke="#64748B"
              strokeWidth={strokeWidth}
              strokeDasharray={`2 ${circumference - 2}`}
              strokeDashoffset={benchmarkDashoffset}
              fill="transparent"
              className="opacity-60"
            />
            {/* Progress Arc */}
            <circle
              cx={dimensions / 2}
              cy={dimensions / 2}
              r={radius}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className={`transition-all duration-700 ease-out ${primaryColorClass}`}
            />
          </svg>

          {/* Center score text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">
            <span className={`font-bold font-tabular leading-none ${primaryColorClass} ${
              size === "sm" ? "text-xs" : size === "lg" ? "text-2xl" : "text-lg"
            }`}>
              {normalizedScore}%
            </span>
          </div>
        </div>

        {label && (
          <span className="text-[11px] text-steel-400 mt-1 font-semibold uppercase tracking-wider" aria-hidden="true">
            {label}
          </span>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // Variant 3: LINEAR (Hero Vector Progress Bar)
  // -------------------------------------------------------------
  return (
    <div {...meterProps} className={`flex flex-col gap-2 font-mono w-full ${className}`}>
      {/* Header Readout — visually rich (delta, benchmark scale), but the
          container's aria-valuetext already states the equivalent as one
          sentence, so the graphical breakdown is hidden from AT rather
          than read out tick-by-tick. */}
      <div className="flex items-baseline justify-between gap-4" aria-hidden="true">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-steel-300">
            {label}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-2xl font-black font-tabular ${primaryColorClass}`}>
              {normalizedScore}%
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ${
                isProdReady
                  ? "bg-telemetry-cyan/10 text-telemetry-cyan border border-telemetry-cyan/30"
                  : "bg-calibrated-amber/10 text-calibrated-amber border border-calibrated-amber/30"
              }`}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        {showDelta && (
          <div className="text-right">
            <span
              className={`text-xs font-bold font-tabular ${
                delta >= 0 ? "text-precision-emerald" : "text-calibrated-amber"
              }`}
            >
              {delta >= 0 ? `+${delta}%` : `${delta}%`}
            </span>
            <p className="text-[10px] text-steel-400">
              vs {benchmark}% Target
            </p>
          </div>
        )}
      </div>

      {/* Progress Track & Benchmark Indicator */}
      <div className="relative w-full" aria-hidden="true">
        {/* Track background */}
        <div className="h-3 w-full rounded-full bg-observatory-base border border-steel-800 overflow-hidden relative">
          {/* Milestone grid ticks */}
          <div className="absolute inset-0 flex justify-between px-2 pointer-events-none opacity-20">
            <span className="h-full w-[1px] bg-steel-400" />
            <span className="h-full w-[1px] bg-steel-400" />
            <span className="h-full w-[1px] bg-steel-400" />
            <span className="h-full w-[1px] bg-steel-400" />
          </div>

          {/* Animated Fill Bar */}
          <div
            className={`h-full rounded-full bg-gradient-to-r ${bgGradient} ${glowShadow} transition-all duration-700 ease-out`}
            style={{ width: `${normalizedScore}%` }}
          />
        </div>

        {/* Target Benchmark Vertical Marker */}
        <div
          className="absolute -top-1 bottom-0 w-0.5 bg-steel-400 z-10 flex flex-col items-center"
          style={{ left: `${benchmark}%` }}
        >
          <div className="h-2 w-2 rounded-full bg-steel-300 -mt-1 shadow-sm" />
        </div>
      </div>

      {/* Track Footer Ticks */}
      <div className="flex justify-between text-[10px] text-steel-400 pt-0.5" aria-hidden="true">
        <span>0%</span>
        <span>40% Foundational</span>
        <span className="font-semibold text-steel-300">{benchmark}% Target</span>
        <span>100%</span>
      </div>
    </div>
  );
}
