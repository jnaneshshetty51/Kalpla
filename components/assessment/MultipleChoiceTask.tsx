"use client";

import React from "react";
import { AssessmentTaskItem } from "@/types/assessment";

export interface TaskComponentProps {
  task: AssessmentTaskItem;
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}

/**
 * Multiple-choice and short-answer are deliberately the "light and quick"
 * task types (per the assessment-runner design brief) — a single tap,
 * immediate visual confirmation, no multi-step ceremony. Kept intentionally
 * simpler/lower-contrast than the coding task's IDE treatment so the
 * relative weight of each task type telegraphs how much effort it needs.
 */
export function MultipleChoiceTask({
  task,
  value,
  onChange,
  disabled = false,
}: TaskComponentProps) {
  const options =
    task.rubric?.options && Array.isArray(task.rubric.options)
      ? (task.rubric.options as string[])
      : [];

  return (
    <div className="flex flex-col gap-3">
      <label className="font-mono text-[11px] font-semibold uppercase tracking-wider text-steel-400">
        Pick one — quick tap, no need to overthink it
      </label>
      <div className="flex flex-col gap-2.5">
        {options.map((option, optIdx) => {
          const isSelected = value === option;
          const letter = String.fromCharCode(65 + optIdx);

          return (
            <button
              key={optIdx}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option)}
              className={`group flex w-full items-center rounded-2xl border p-3.5 text-left text-sm transition-all duration-150 ${
                isSelected
                  ? "border-telemetry-cyan bg-telemetry-cyan/10 text-white"
                  : "border-steel-800 bg-observatory-panel/60 text-steel-300 hover:border-steel-700 hover:bg-observatory-hover"
              } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
            >
              <span
                className={`mr-3.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold transition ${
                  isSelected
                    ? "border-telemetry-cyan bg-telemetry-cyan text-observatory-base"
                    : "border-steel-700 bg-observatory-base text-steel-400 group-hover:border-steel-500 group-hover:text-steel-200"
                }`}
              >
                {letter}
              </span>
              <span className="flex-1 font-medium">{option}</span>
              {isSelected && (
                <span className="ml-3 shrink-0 font-mono text-[11px] font-bold text-telemetry-cyan">
                  ✓ Selected
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
