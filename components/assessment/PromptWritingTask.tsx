"use client";

import React from "react";
import { TaskComponentProps } from "./MultipleChoiceTask";

/**
 * The live "this is what gets sent" preview is the actual teaching moment
 * of this task type — most candidates have never seen their prompt text
 * rendered as the literal payload a model receives, system instructions
 * and all. Everywhere else in this app that pattern (editor + secondary
 * preview) stacks the preview below as an afterthought; here it runs
 * side-by-side at equal width so the preview reads as a first-class half
 * of the task, not a formality tacked under the input.
 */
export function PromptWritingTask({
  task,
  value,
  onChange,
  disabled = false,
}: TaskComponentProps) {
  const estimatedTokens = Math.ceil((value || "").length / 4);
  const hasContent = !!(value && value.trim());

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Input Editor */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[11px] font-semibold uppercase tracking-wider text-steel-400">
              Write Your Prompt
            </label>
            <span className="font-mono text-[11px] text-telemetry-cyan">
              ~{estimatedTokens} tokens
            </span>
          </div>

          <textarea
            value={value || ""}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. You are a senior software architect. Analyze the following code snippet and identify potential security risks..."
            rows={10}
            className="w-full flex-1 rounded-2xl border border-steel-800 bg-observatory-panel/60 p-4 font-mono text-sm text-steel-50 placeholder-steel-400 transition focus:border-telemetry-cyan focus:outline-none focus:ring-1 focus:ring-telemetry-cyan disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        {/* Live Payload Preview — equal visual weight to the editor, not a
            secondary panel underneath it. */}
        <div
          className={`flex flex-col rounded-2xl border p-5 transition-colors ${
            hasContent
              ? "border-telemetry-cyan/40 bg-observatory-panel telemetry-glow-cyan"
              : "border-steel-800 bg-observatory-panel/40"
          }`}
        >
          <div className="flex items-center justify-between border-b border-steel-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {hasContent && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-precision-emerald opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${hasContent ? "bg-precision-emerald" : "bg-steel-500"}`}
                />
              </span>
              <span className="font-mono text-xs font-bold uppercase tracking-wide text-steel-200">
                Live Model Payload
              </span>
            </div>
            <span className="font-mono text-[10px] text-steel-400">
              This is what actually gets sent
            </span>
          </div>

          <div className="mt-4 flex flex-1 flex-col gap-3 font-mono text-xs">
            <div className="rounded-xl border border-steel-800 bg-observatory-base p-3">
              <span className="font-bold text-calibrated-amber">
                [SYSTEM INSTRUCTIONS]
              </span>
              <p className="mt-1 text-steel-400">
                {task.skill_node?.name
                  ? `You are an expert AI assistant specializing in ${task.skill_node.name}. Follow user guidelines strictly.`
                  : "You are an AI assistant tasked with executing user instructions."}
              </p>
            </div>

            <div className="flex-1 rounded-xl border border-telemetry-cyan/20 bg-observatory-base p-3">
              <span className="font-bold text-telemetry-cyan">
                [USER PROMPT PAYLOAD]
              </span>
              <p className="mt-1 whitespace-pre-wrap text-steel-100">
                {hasContent ? (
                  value
                ) : (
                  <span className="italic text-steel-400">
                    Start typing on the left — your exact words will appear here,
                    formatted the way the model actually receives them.
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
