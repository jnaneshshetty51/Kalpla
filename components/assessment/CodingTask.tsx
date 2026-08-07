"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { TaskComponentProps } from "./MultipleChoiceTask";
import {
  executePythonCode,
  PyodideExecutionResult,
} from "@/lib/pyodide/loader";

// Same Monaco integration the real project workspace uses (Prompt 55) —
// reused here rather than a plain textarea so the assessment's coding task
// gets genuine syntax highlighting, not an imitation of it, and so a
// candidate's first code editor in the app doesn't feel like a downgrade
// from the one they'll use later on real projects.
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const DEFAULT_STARTER_CODE = `# Write your Python solution here
def solution():
    message = "Hello from Pyodide WASM!"
    print("Executing Python script...")
    return message

# Test your function
print("Result:", solution())
`;

export function CodingTask({
  value,
  onChange,
  disabled = false,
}: TaskComponentProps) {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [hasRunOnce, setHasRunOnce] = useState<boolean>(false);
  const [execResult, setExecResult] = useState<PyodideExecutionResult | null>(
    null,
  );

  const currentCode = value && value.trim() ? value : DEFAULT_STARTER_CODE;

  const handleRunCode = async () => {
    try {
      setIsRunning(true);
      const result = await executePythonCode(currentCode);
      setExecResult(result);
      setHasRunOnce(true);
    } catch (err) {
      console.error("Pyodide execution error:", err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleResetCode = () => {
    onChange(DEFAULT_STARTER_CODE);
    setExecResult(null);
    setHasRunOnce(false);
  };

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* Editor Header Bar */}
      <div className="flex items-center justify-between rounded-t-2xl border border-steel-800 bg-observatory-panel px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-vulnerability-crimson/70" aria-hidden="true" />
          <span className="h-3 w-3 rounded-full bg-calibrated-amber/70" aria-hidden="true" />
          <span className="h-3 w-3 rounded-full bg-precision-emerald/70" aria-hidden="true" />
          <span className="ml-2 font-mono text-xs text-steel-300">
            solution.py
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetCode}
            disabled={disabled || isRunning}
            className="font-mono text-[11px] text-steel-400 transition hover:text-steel-200"
          >
            Reset
          </button>
          <span className="rounded border border-telemetry-cyan/30 bg-telemetry-cyan/10 px-2 py-0.5 font-mono text-[10px] font-medium text-telemetry-cyan">
            Pyodide WASM 0.26
          </span>
        </div>
      </div>

      {/* Monaco Editor Body */}
      <div
        className="h-72 shrink-0 overflow-hidden rounded-b-2xl border border-t-0 border-steel-800 shadow-inner"
        role="group"
        aria-label="Python code editor, solution.py"
      >
        <MonacoEditor
          height="100%"
          language="python"
          theme="vs-dark"
          value={currentCode}
          onChange={(v) => onChange(v || "")}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            readOnly: disabled || isRunning,
            scrollBeyondLastLine: false,
            padding: { top: 12 },
          }}
        />
      </div>

      {/* Run — deliberately the lighter/secondary action here. Fast,
          informal, try-it-out; it never advances or grades the task. The
          real submit action lives in the page footer and only reads
          whatever is currently in the editor, so a candidate can Run as
          many times as they want without any risk of that counting as
          their final answer. */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleRunCode}
          disabled={disabled || isRunning}
          className="flex items-center gap-2 rounded-xl border border-steel-700 bg-observatory-panel px-4 py-2 font-mono text-xs font-semibold text-steel-200 transition hover:border-telemetry-cyan/50 hover:text-telemetry-cyan disabled:opacity-50"
        >
          {isRunning ? (
            <>
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-steel-400 border-t-transparent" />
              <span>Running...</span>
            </>
          ) : (
            <>
              <span className="text-precision-emerald">▶</span>
              <span>Run — just testing, doesn&apos;t submit anything</span>
            </>
          )}
        </button>

        <span className="font-mono text-[11px] text-steel-400">
          Client-side Python (WASM) — nothing leaves your browser until you submit
        </span>
      </div>

      {/* Output Console — visually separated from the editor so "what I
          wrote" and "what happened when it ran" never blur together. */}
      <div
        role="log"
        aria-label="Code execution output"
        aria-live="polite"
        className={`rounded-2xl border font-mono text-xs transition ${
          !execResult
            ? "border-steel-800 bg-observatory-panel/40"
            : execResult.isError
              ? "border-vulnerability-crimson/30 bg-vulnerability-crimson/5"
              : "border-precision-emerald/30 bg-observatory-panel"
        }`}
      >
        <div className="flex items-center justify-between border-b border-steel-800/80 px-4 py-2.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-steel-400">
            Output Console
          </span>
          {execResult && (
            <span
              className={`font-mono text-[10px] ${execResult.isError ? "text-vulnerability-crimson" : "text-precision-emerald"}`}
            >
              {execResult.isError ? "Failed" : "Success"} · {execResult.executionTimeMs}ms
            </span>
          )}
        </div>

        <div className="p-4">
          {!hasRunOnce && (
            <span className="italic text-steel-400">
              Nothing run yet — hit Run above to try your code out.
            </span>
          )}

          {execResult && (
            <div className="flex flex-col gap-2.5">
              {execResult.stdout && (
                <div>
                  <span className="text-[10px] text-steel-400">stdout</span>
                  <pre className="mt-1 whitespace-pre-wrap text-steel-200">
                    {execResult.stdout}
                  </pre>
                </div>
              )}

              {execResult.result && (
                <div>
                  <span className="text-[10px] text-steel-400">return value</span>
                  <pre className="mt-1 whitespace-pre-wrap text-precision-emerald">
                    {execResult.result}
                  </pre>
                </div>
              )}

              {execResult.stderr && (
                <div>
                  <span className="text-[10px] text-vulnerability-crimson">
                    stderr / error
                  </span>
                  <pre className="mt-1 whitespace-pre-wrap text-rose-300">
                    {execResult.stderr}
                  </pre>
                </div>
              )}

              {!execResult.stdout && !execResult.stderr && !execResult.result && (
                <span className="italic text-steel-400">
                  Ran successfully with no output.
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
