"use client";

import React from "react";
import { TaskComponentProps } from "./MultipleChoiceTask";

/** Light and quick, same as multiple-choice — a plain textarea, no rubric
 * ceremony or word-count pressure beyond a small ambient counter. */
export function ShortAnswerTask({
  value,
  onChange,
  disabled = false,
}: TaskComponentProps) {
  const wordCount = value
    ? value.trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <div className="flex flex-1 flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <label className="font-mono text-[11px] font-semibold uppercase tracking-wider text-steel-400">
          A sentence or two is plenty
        </label>
        <span className="font-mono text-[11px] text-steel-400">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>
      </div>

      <textarea
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your answer here..."
        rows={6}
        className="w-full flex-1 rounded-2xl border border-steel-800 bg-observatory-panel/60 p-4 text-sm text-steel-50 placeholder-steel-400 transition focus:border-telemetry-cyan focus:outline-none focus:ring-1 focus:ring-telemetry-cyan disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}
