"use client";

import React, { useState, useEffect, useRef, use, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { executeInSandbox, preloadSandbox, SandboxExecutionResult } from "@/lib/sandbox/pyodide";
import { runProjectTests, TestCaseResult } from "@/lib/sandbox/testRunner";
import {
  UsageCapExceededNotice,
  UsageWarningBanner,
  UsageCapExceededDetails,
  UsageWarningDetails,
} from "@/components/billing/UsageCapNotice";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface TestCase {
  function: string;
  input: unknown[];
  expected_output: unknown;
}

interface ProjectSpec {
  type: "rag" | "agent" | "general";
  description: string;
  requirements: string[];
  test_cases: TestCase[];
}

interface ProjectData {
  id: string;
  name: string;
  tier: string;
  spec: ProjectSpec;
  starter_template: string;
  has_reference_solution: boolean;
}

interface HintEntry {
  level: number;
  hint: string;
}

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.project;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [code, setCode] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<SandboxExecutionResult | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestCaseResult[] | null>(null);
  const allTestsPassed = testResults !== null && testResults.every((t) => t.passed);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ submissionId: string } | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [reflection, setReflection] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [hints, setHints] = useState<HintEntry[]>([]);
  const [isFetchingHint, setIsFetchingHint] = useState(false);
  const [hintsUsedTotal, setHintsUsedTotal] = useState(0);
  const [hintCapExceeded, setHintCapExceeded] = useState<UsageCapExceededDetails | null>(null);
  const [hintUsageWarning, setHintUsageWarning] = useState<UsageWarningDetails | null>(null);

  const [isLoadingReference, setIsLoadingReference] = useState(false);
  const [referenceSolution, setReferenceSolution] = useState<string | null>(null);
  const [showReference, setShowReference] = useState(false);

  const [rightPanelTab, setRightPanelTab] = useState<"hints" | "tests" | "reference">("hints");

  // Below sm, the desktop 3-pane split (editor | console | 384px side
  // panel) can't coexist — the side panel alone is wider than most phone
  // viewports. Mobile instead shows one full-width pane at a time via this
  // switcher, so the editor and hints/tests both get genuinely usable
  // space instead of being squeezed into a sliver.
  const [mobileView, setMobileView] = useState<"editor" | "console" | "panel">("editor");

  const consoleBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    preloadSandbox().catch(() => {});
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadProject() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/workspace/${encodeURIComponent(projectId)}`);
        if (!response.ok) {
          throw new Error(`Failed to load project (${response.status})`);
        }
        const json = await response.json();
        if (!isMounted) return;
        setProject(json.project);
        setCode(json.resume_code || json.project.starter_template || "");
        setHintsUsedTotal(json.hints_used_total || 0);
        if (json.latest_submission?.metadata?.test_results) {
          setTestResults(json.latest_submission.metadata.test_results);
        }
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadProject();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  useEffect(() => {
    consoleBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [runResult, isRunning]);

  const handleRun = useCallback(async () => {
    if (isRunning || !project) return;
    setIsRunning(true);
    setRunResult(null);
    try {
      const result = await executeInSandbox(code, { projectId: project.id });
      setRunResult(result);
    } finally {
      setIsRunning(false);
    }
  }, [code, isRunning, project]);

  const handleRunTests = useCallback(async () => {
    if (isTesting || !project) return;
    setIsTesting(true);
    setRightPanelTab("tests");
    try {
      const results = await runProjectTests(code, project.spec.test_cases, project.id);
      setTestResults(results);
    } finally {
      setIsTesting(false);
    }
  }, [code, isTesting, project]);

  const handleSubmit = async () => {
    if (isSubmitting || !project || !reflection.trim()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const results = await runProjectTests(code, project.spec.test_cases, project.id);
      setTestResults(results);

      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          code,
          reflection: reflection.trim(),
          test_results: results,
        }),
      });

      if (response.ok) {
        const json = await response.json();
        setSubmitResult({ submissionId: json.submission.id });
        setShowSubmitModal(false);
      } else {
        const errJson = await response.json();
        setSubmitError(errJson.error || "Submission failed.");
      }
    } catch (err) {
      console.error("Submit error:", err);
      setSubmitError("Submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestHint = async () => {
    if (isFetchingHint || !project) return;
    setIsFetchingHint(true);
    setRightPanelTab("hints");
    setHintCapExceeded(null);
    try {
      const nextLevel = Math.min(hints.length + 1, 3);
      const response = await fetch("/api/workspace/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id, code, level: nextLevel }),
      });
      if (response.status === 429) {
        setHintCapExceeded(await response.json());
        return;
      }
      if (response.ok) {
        const json = await response.json();
        setHints((prev) => [...prev, { level: nextLevel, hint: json.hint }]);
        setHintsUsedTotal((prev) => prev + 1);
        setHintUsageWarning(json.usageWarning || null);
      }
    } finally {
      setIsFetchingHint(false);
    }
  };

  const handleShowReference = async () => {
    if (isLoadingReference || !project) return;
    setRightPanelTab("reference");
    if (referenceSolution) {
      setShowReference(true);
      return;
    }
    setIsLoadingReference(true);
    try {
      const response = await fetch("/api/workspace/reference-solution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id }),
      });
      if (response.ok) {
        const json = await response.json();
        setReferenceSolution(json.reference_solution);
        setShowReference(true);
      }
    } finally {
      setIsLoadingReference(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono telemetry-grid-bg">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-telemetry-cyan border-t-transparent shadow-telemetry-cyan" />
          <div>
            <h2 className="text-sm font-bold text-white">Initializing IDE Code Sandbox</h2>
            <p className="text-xs text-steel-400 font-sans mt-1">Loading Python runtime environment &amp; project specifications…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono">
        <Card variant="bordered" padding="lg" className="max-w-md text-center">
          <h2 className="text-lg font-bold text-vulnerability-crimson">Workspace Load Error</h2>
          <p className="mt-2 text-xs text-steel-400 font-sans leading-relaxed">{error || "Unable to load project workspace."}</p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-xl bg-telemetry-cyan px-5 py-2.5 font-mono text-xs font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white"
          >
            ← Back to Dashboard
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-observatory-base text-steel-50 font-mono overflow-hidden">
      {/* IDE Top Navigation Bar */}
      <header className="flex items-center justify-between gap-3 flex-wrap border-b border-steel-800 bg-observatory-panel/90 px-4 sm:px-6 py-3 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/projects" className="shrink-0 text-xs font-mono text-steel-400 hover:text-telemetry-cyan transition underline">
            ← <span className="hidden sm:inline">Projects</span>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                {project.spec.type} Project
              </span>
              <span className="text-steel-400">•</span>
              <span className="text-[10px] text-steel-400 font-mono">{project.tier}</span>
            </div>
            <h1 className="text-base font-bold text-white leading-tight mt-0.5 truncate">{project.name}</h1>
          </div>
        </div>

        {/* DISTINCT VISUAL WEIGHT FOR RUN VS SUBMIT BUTTONS (Matches Assessment convention from Prompt 6) */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Secondary Action Weight: Run Code */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRun}
            disabled={isRunning}
            loading={isRunning}
          >
            {isRunning ? "Running…" : <>▶ <span className="hidden sm:inline">Run Code</span></>}
          </Button>

          {/* Test Action */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRunTests}
            disabled={isTesting}
            loading={isTesting}
          >
            {isTesting ? "Testing…" : <>✓ <span className="hidden sm:inline">Run Tests</span></>}
          </Button>

          {/* Primary Action Weight: Submit Project */}
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowSubmitModal(true)}
            disabled={isSubmitting || !!submitResult}
          >
            {submitResult ? "Submitted ✓" : <>🚀 <span className="hidden sm:inline">Submit Project </span>→</>}
          </Button>
        </div>
      </header>

      {/* Mobile pane switcher — replaces the 3-pane split below sm */}
      <div className="flex sm:hidden border-b border-steel-800 bg-observatory-panel/60 shrink-0" role="tablist" aria-label="Workspace view">
        {(["editor", "console", "panel"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={mobileView === v}
            onClick={() => setMobileView(v)}
            className={`flex-1 py-2.5 text-center text-xs font-mono font-bold transition ${
              mobileView === v ? "border-b-2 border-telemetry-cyan text-telemetry-cyan bg-telemetry-cyan/5" : "text-steel-400 hover:text-white"
            }`}
          >
            {v === "editor" ? "📝 Code" : v === "console" ? "▶ Output" : "💡 Hints & Tests"}
          </button>
        ))}
      </div>

      {/* Main IDE Workspace Split Pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left File Explorer Panel */}
        <div className="w-48 shrink-0 border-r border-steel-800 bg-observatory-panel/50 p-3 font-mono text-xs hidden sm:block">
          <span className="text-[10px] font-bold uppercase tracking-widest text-steel-400 block mb-2">
            Project Explorer
          </span>
          <div className="flex items-center gap-2 rounded-xl bg-telemetry-cyan/10 border border-telemetry-cyan/30 px-3 py-2 text-xs font-bold text-telemetry-cyan">
            <span>🐍</span> solution.py
          </div>
        </div>

        {/* Center: Monaco Editor + Console Below */}
        <div className={`${mobileView === "panel" ? "hidden" : "flex"} sm:flex flex-1 flex-col overflow-hidden`}>
          {/* Monaco Editor Container — full-height standalone pane on
              mobile (mobileView === "editor"); stacked above the console
              on sm+ regardless of mobileView. */}
          <div
            className={`${mobileView === "editor" ? "flex" : "hidden"} sm:flex flex-1 overflow-hidden relative`}
            role="group"
            aria-label="Python code editor"
          >
            <MonacoEditor
              height="100%"
              language="python"
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value || "")}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "monospace",
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>

          {/* CLEARLY SEPARATED OUTPUT CONSOLE (stdout, stderr, test pass/fail visuals) —
              takes the full pane on mobile when selected, fixed h-48 strip on sm+. */}
          <div
            className={`${mobileView === "console" ? "flex flex-1" : "hidden"} sm:flex sm:h-48 sm:flex-none sm:shrink-0 border-t border-steel-800 bg-observatory-base p-4 font-mono text-xs overflow-y-auto flex-col justify-between`}
            role="log"
            aria-label="Execution output console"
          >
            <div className="flex items-center justify-between border-b border-steel-800/80 pb-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-telemetry-cyan shadow-telemetry-cyan" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-steel-400">
                  Execution Output Console
                </span>
              </div>
              <span className="text-[10px] text-steel-400 font-mono">Pyodide WebAssembly Sandbox</span>
            </div>

            {isRunning && <div className="text-telemetry-cyan font-bold animate-pulse">Executing code in WebAssembly sandbox…</div>}

            {runResult && (
              <div className="space-y-1.5 leading-relaxed">
                {runResult.timedOut && (
                  <div className="text-vulnerability-crimson font-bold">⏱ Execution Timed Out ({runResult.stderr})</div>
                )}
                {!runResult.timedOut && runResult.stdout && (
                  <pre className="whitespace-pre-wrap text-steel-200 text-xs font-mono">{runResult.stdout}</pre>
                )}
                {!runResult.timedOut && runResult.stderr && (
                  <pre className="whitespace-pre-wrap text-vulnerability-crimson font-mono text-xs">{runResult.stderr}</pre>
                )}
                {!runResult.timedOut && runResult.result && (
                  <div className="text-precision-emerald font-bold font-mono">→ Output: {runResult.result}</div>
                )}
                {runResult.truncated && (
                  <div className="text-calibrated-amber font-bold">[output truncated — buffer cap reached]</div>
                )}
                <div className="text-[10px] text-steel-400 font-tabular pt-1 border-t border-steel-800/50">
                  Execution Time: {runResult.executionTimeMs}ms
                </div>
              </div>
            )}
            <div ref={consoleBottomRef} />
          </div>
        </div>

        {/* Right Panel: Hints / Test Results / Reference Solution — full
            width standalone pane on mobile (mobileView === "panel"), fixed
            384px sidebar on sm+ regardless of mobileView. */}
        <div
          className={`${mobileView === "panel" ? "flex" : "hidden"} sm:flex w-full sm:w-96 shrink-0 sm:border-l border-steel-800 bg-observatory-panel/60 flex-col overflow-hidden`}
        >
          {/* Tab Selection Header */}
          <div className="flex border-b border-steel-800 font-mono text-xs">
            {(["hints", "tests", "reference"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightPanelTab(tab)}
                className={`flex-1 py-3 text-center font-bold capitalize transition ${
                  rightPanelTab === tab
                    ? "border-b-2 border-telemetry-cyan text-telemetry-cyan bg-telemetry-cyan/5"
                    : "text-steel-400 hover:text-white"
                }`}
              >
                {tab === "hints" ? "AI Hints" : tab === "tests" ? "Test Suite" : "Reference"}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 font-mono text-xs">
            {/* ESCALATING AI HINT PANEL (Considered reveal matching cost/pedagogy rules) */}
            {rightPanelTab === "hints" && (
              <div className="flex flex-col gap-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-steel-400 block mb-1">
                    Project Requirements
                  </span>
                  <ul className="flex flex-col gap-1.5 text-xs text-steel-300 font-sans list-disc pl-4">
                    {project.spec.requirements.map((req, i) => (
                      <li key={i}>{req}</li>
                    ))}
                  </ul>
                </div>

                {/* Escalated Hints Stream */}
                {hints.map((h) => (
                  <Card key={h.level} variant="bordered" padding="sm" className="border-telemetry-cyan/40 bg-observatory-base">
                    <div className="flex items-center justify-between border-b border-steel-800 pb-1.5 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-telemetry-cyan">
                        {h.level === 1 ? "Level 1 • Conceptual Nudge" : h.level === 2 ? "Level 2 • Code Pointer" : "Level 3 • Guided Solution"}
                      </span>
                      <Badge variant="info" size="sm">Revealed</Badge>
                    </div>
                    <p className="text-xs font-sans text-steel-200 leading-relaxed">{h.hint}</p>
                  </Card>
                ))}

                {hintCapExceeded ? (
                  <UsageCapExceededNotice details={hintCapExceeded} />
                ) : (
                  <>
                    {/* Considered Reveal Action Button */}
                    <Button
                      variant="secondary"
                      onClick={handleRequestHint}
                      disabled={isFetchingHint || hints.length >= 3}
                      loading={isFetchingHint}
                      className="w-full justify-center text-calibrated-amber border-calibrated-amber/40 hover:bg-calibrated-amber/10"
                    >
                      {isFetchingHint
                        ? "Synthesizing Hint…"
                        : hints.length >= 3
                        ? "Maximum 3 Hints Revealed"
                        : `💡 Reveal Level ${hints.length + 1} Hint (${hints.length === 0 ? "Nudge" : hints.length === 1 ? "Specific Pointer" : "Guided Solution"}) →`}
                    </Button>

                    <span className="text-[10px] text-steel-400 text-center block">
                      {hintsUsedTotal} hint{hintsUsedTotal === 1 ? "" : "s"} revealed for this project total.
                    </span>

                    {hintUsageWarning && <UsageWarningBanner warning={hintUsageWarning} />}
                  </>
                )}
              </div>
            )}

            {/* TEST RESULTS TAB (Scannable Pass/Fail Badges) */}
            {rightPanelTab === "tests" && (
              <div className="flex flex-col gap-3">
                {isTesting && <div className="text-xs text-telemetry-cyan font-bold animate-pulse">Running test suite against WebAssembly sandbox…</div>}
                {!isTesting && testResults === null && (
                  <p className="text-xs text-steel-400 font-sans">
                    Click &quot;Run Tests&quot; in the header bar to evaluate your solution against test cases.
                  </p>
                )}
                {testResults?.map((t, i) => (
                  <Card
                    key={i}
                    variant="bordered"
                    padding="sm"
                    className={t.passed ? "border-precision-emerald/40 bg-precision-emerald/5" : "border-vulnerability-crimson/40 bg-vulnerability-crimson/5"}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono font-bold text-steel-100 truncate max-w-[65%]">
                        {t.function}()
                      </span>
                      <Badge variant={t.passed ? "mastery" : "vulnerability"} size="sm" dot={false}>
                        {t.passed ? "PASS ✓" : "FAIL ✗"}
                      </Badge>
                    </div>

                    {!t.passed && (
                      <div className="mt-2 font-mono text-[11px] text-vulnerability-crimson bg-observatory-base p-2 rounded border border-vulnerability-crimson/30">
                        Expected: {JSON.stringify(t.expected)} <br />
                        Got: {t.error || JSON.stringify(t.actual)}
                      </div>
                    )}
                  </Card>
                ))}
                {testResults && (
                  <div className="mt-2 text-xs font-bold text-white flex items-center justify-between border-t border-steel-800 pt-2 font-tabular">
                    <span>Test Suite Status:</span>
                    <span className={allTestsPassed ? "text-precision-emerald" : "text-calibrated-amber"}>
                      {testResults.filter((t) => t.passed).length} / {testResults.length} Passed
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* REFERENCE SOLUTION TAB */}
            {rightPanelTab === "reference" && (
              <div className="flex flex-col gap-3">
                {!allTestsPassed && !showReference && (
                  <p className="text-xs text-steel-400 font-sans">
                    Pass all test cases first to unlock the reference architectural solution.
                  </p>
                )}
                {allTestsPassed && !showReference && (
                  <Button
                    variant="primary"
                    onClick={handleShowReference}
                    loading={isLoadingReference}
                    className="w-full justify-center"
                  >
                    {isLoadingReference ? "Retrieving Solution…" : "Unlock Alternate Reference Solution →"}
                  </Button>
                )}
                {showReference && referenceSolution && (
                  <div className="relative overflow-hidden rounded-xl border border-steel-800 bg-observatory-base p-3 font-mono text-[11px] text-precision-emerald">
                    <pre className="overflow-x-auto whitespace-pre-wrap">
                      <code>{referenceSolution}</code>
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SUBMIT REFLECTION MODAL */}
      {showSubmitModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowSubmitModal(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowSubmitModal(false);
          }}
        >
          <Card
            variant="glow"
            padding="lg"
            className="w-full max-w-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-reflection-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="submit-reflection-title" className="text-lg font-bold text-white font-mono">
              Project Submission Reflection
            </h3>
            <p className="mt-1 text-xs text-steel-400 font-sans leading-relaxed">
              Every project submission requires a brief written reflection on your engineering tradeoffs and what was hardest to implement.
            </p>
            <label htmlFor="submission-reflection" className="sr-only">
              Submission reflection
            </label>
            <textarea
              id="submission-reflection"
              autoFocus
              rows={5}
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="What architectural trade-offs did you make? What was hardest about this implementation?"
              className="mt-4 w-full rounded-xl border border-steel-800 bg-observatory-base p-3.5 font-mono text-xs text-white placeholder-steel-400 focus:border-telemetry-cyan focus:outline-none"
            />
            {submitError && <p className="mt-2 text-xs text-vulnerability-crimson font-mono">{submitError}</p>}
            <div className="mt-6 flex justify-end gap-3 font-mono">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowSubmitModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting || !reflection.trim()}
                loading={isSubmitting}
              >
                {isSubmitting ? "Submitting…" : "Confirm Project Submission →"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
