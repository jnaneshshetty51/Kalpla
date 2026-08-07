"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AssessmentTaskItem } from "@/types/assessment";
import { TaskRenderer } from "@/components/assessment/TaskRenderer";
import { ResumeAssessmentBanner } from "@/components/assessment/ResumeAssessmentBanner";
import { UsageCapExceededNotice, UsageCapExceededDetails } from "@/components/billing/UsageCapNotice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

/**
 * No time-remaining or pacing indicator anywhere on this page — a
 * deliberate omission, not an oversight. The brief for this page is
 * explicitly to feel low-pressure despite being an evaluation, and a
 * countdown (even a soft one) is the single fastest way to make an
 * assessment feel like an exam: it shifts attention from "answer this
 * well" to "answer this fast." Nothing here is actually time-limited
 * server-side (grading and roadmap generation don't care how long a
 * session took), so a timer would be manufacturing pressure that doesn't
 * correspond to any real constraint. If pacing data ever becomes genuinely
 * useful (e.g. flagging questions someone's stuck on to offer a hint),
 * that's a "based on real dwell time" affordance to revisit — not a
 * ticking clock.
 */
export default function AssessmentPage() {
  const [tasks, setTasks] = useState<AssessmentTaskItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [isGrading, setIsGrading] = useState<boolean>(false);
  const [showResumeBanner, setShowResumeBanner] = useState<boolean>(false);
  const [capExceeded, setCapExceeded] = useState<UsageCapExceededDetails | null>(null);

  // Load tasks and restore session state
  useEffect(() => {
    async function initAssessment() {
      try {
        setLoading(true);
        setError(null);

        // Fetch task list
        const tasksRes = await fetch("/api/assessment/tasks");
        if (!tasksRes.ok) {
          throw new Error(
            `Failed to load assessment tasks (${tasksRes.status})`,
          );
        }

        const tasksData = await tasksRes.json();
        if (tasksData.tasks && Array.isArray(tasksData.tasks)) {
          setTasks(tasksData.tasks);
        } else {
          throw new Error("Invalid task data received from server");
        }

        // Restore active session if incomplete
        try {
          const sessionRes = await fetch("/api/assessment/session");
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            if (sessionData.session && !sessionData.session.completed) {
              const savedIdx = sessionData.session.current_index || 0;
              const savedAnswers = sessionData.session.answers || {};
              setCurrentIndex(savedIdx);
              setAnswers(savedAnswers);
              if (savedIdx > 0) {
                setShowResumeBanner(true);
              }
            }
          }
        } catch (sessionErr) {
          console.warn("Session restore fallback:", sessionErr);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    initAssessment();
  }, []);

  // Helper to persist session state
  const saveSessionState = async (
    idx: number,
    currentAnswers: Record<string, string>,
    completedStatus = false,
  ) => {
    try {
      await fetch("/api/assessment/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_index: idx,
          answers: currentAnswers,
          completed: completedStatus,
        }),
      });
    } catch (err) {
      console.warn("Auto-save session failed:", err);
    }
  };

  const currentTask = tasks[currentIndex];
  const progressPercent =
    tasks.length > 0
      ? Math.round(((currentIndex + 1) / tasks.length) * 100)
      : 0;
  const isCodeTask = currentTask?.type === "code";
  const isLastTask = currentIndex >= tasks.length - 1;

  const handleAnswerChange = (val: string) => {
    if (!currentTask) return;
    const updatedAnswers = {
      ...answers,
      [currentTask.id]: val,
    };
    setAnswers(updatedAnswers);
    saveSessionState(currentIndex, updatedAnswers, false);
  };

  // Grades the current task via the real submit endpoint before advancing.
  // Best-effort: most grading failures shouldn't strand the user
  // mid-assessment (matches the existing soft-fail philosophy of
  // saveSessionState above) — their answer is already persisted in session
  // state regardless. A usage-cap block is the one exception (Prompt 84):
  // that's user-actionable, so it's surfaced and returned to the caller
  // rather than silently swallowed.
  const submitCurrentTask = async (): Promise<boolean> => {
    if (!currentTask) return true;
    try {
      const response = await fetch("/api/assessment/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: currentTask.id,
          response: answers[currentTask.id] || "",
        }),
      });
      if (response.status === 429) {
        setCapExceeded(await response.json());
        return false;
      }
      setCapExceeded(null);
      return true;
    } catch (err) {
      console.warn("Task grading failed, continuing anyway:", err);
      return true;
    }
  };

  const handleNext = async () => {
    if (currentIndex >= tasks.length - 1) return;
    setIsGrading(true);
    const ok = await submitCurrentTask();
    setIsGrading(false);
    if (!ok) return; // capped — stay on this task, notice is shown below
    const nextIdx = currentIndex + 1;
    setCurrentIndex(nextIdx);
    saveSessionState(nextIdx, answers, false);
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      saveSessionState(prevIdx, answers, false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setIsGrading(true);
    const ok = await submitCurrentTask();
    setIsGrading(false);
    setIsSubmitting(false);
    if (!ok) return; // capped — notice is shown below, don't mark completed
    await saveSessionState(currentIndex, answers, true);
    setIsCompleted(true);
  };

  if (loading) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4 text-steel-50">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-telemetry-cyan border-t-transparent" />
          <p className="font-mono text-xs text-steel-400">
            Loading your assessment...
          </p>
        </div>
      </div>
    );
  }

  if (error || tasks.length === 0) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4 text-steel-50">
        <div className="max-w-md rounded-2xl border border-vulnerability-crimson/30 bg-observatory-panel p-8 text-center">
          <h2 className="font-mono text-lg font-bold text-vulnerability-crimson">
            Couldn&apos;t load the assessment
          </h2>
          <p className="mt-2 text-sm text-steel-300">
            {error || "No assessment tasks found."}
          </p>
          <Button variant="primary" className="mt-6" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4 text-steel-50">
        <div className="max-w-lg rounded-3xl border border-precision-emerald/30 bg-observatory-panel p-8 text-center telemetry-glow-cyan">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-precision-emerald/15 text-precision-emerald ring-1 ring-precision-emerald/40">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mt-6 font-mono text-2xl font-bold text-white">
            Nice work — that&apos;s the full assessment
          </h2>
          <p className="mt-2 text-sm text-steel-300">
            Every answer&apos;s been recorded and is being evaluated across all 8 GenAI
            engineering competency domains.
          </p>
          <div className="mt-8">
            <Link
              href="/assessment/results"
              className="block w-full rounded-xl bg-telemetry-cyan px-6 py-3 font-mono text-sm font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white"
            >
              See your results →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col text-steel-50">
      {/* Slim persistent progress strip — deliberately not a second full
          header. AppShell above already carries branding/nav/account, so
          this only needs to answer one question at a glance: how far
          through am I. */}
      <div className="sticky top-[63px] z-30 border-b border-steel-800 bg-observatory-panel/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-2.5">
          <span className="font-mono text-xs font-semibold text-steel-200">
            Task {currentIndex + 1} of {tasks.length}
          </span>
          <span className="font-mono text-[11px] text-steel-400">
            {progressPercent}% complete
          </span>
        </div>
        <div className="h-[3px] w-full bg-steel-900">
          <div
            className="h-full bg-telemetry-cyan shadow-telemetry-cyan transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Main Task Container — widens for the coding task so the Monaco
          editor gets real room to breathe instead of a cramped column. */}
      <main className={`mx-auto flex w-full flex-1 flex-col p-6 transition-all ${isCodeTask ? "max-w-5xl" : "max-w-3xl"}`}>
        {showResumeBanner && (
          <ResumeAssessmentBanner
            taskNumber={currentIndex + 1}
            totalTasks={tasks.length}
            onDismiss={() => setShowResumeBanner(false)}
          />
        )}

        <div className="flex flex-1 flex-col rounded-3xl border border-steel-800 bg-observatory-panel p-6 sm:p-8">
          {/* Category & Difficulty Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info" size="sm">{currentTask.category}</Badge>
            <Badge variant="neutral" size="sm" dot={false}>{currentTask.skill_node.name}</Badge>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-steel-400">
              {currentTask.type.replace("_", " ")}
            </span>
          </div>

          {/* Task Prompt */}
          <div className="mt-5 rounded-2xl border border-steel-800/80 bg-observatory-base p-5">
            <h2 className="text-base font-semibold leading-relaxed text-steel-50">
              {currentTask.prompt}
            </h2>
          </div>

          {/* Per-task-type renderer */}
          <div className="mt-6 flex flex-1 flex-col">
            <TaskRenderer
              task={currentTask}
              value={answers[currentTask.id] || ""}
              onChange={handleAnswerChange}
            />
          </div>
        </div>

        {capExceeded && (
          <div className="mt-6">
            <UsageCapExceededNotice details={capExceeded} />
          </div>
        )}

        {/* Footer Navigation */}
        <footer className="mt-6 flex flex-col gap-2">
          {isCodeTask && (
            <p className="text-right font-mono text-[11px] text-steel-400">
              {isLastTask ? "Submitting" : "Continuing"} sends whatever&apos;s currently in the editor — Run above is just for testing.
            </p>
          )}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handlePrevious}
              disabled={currentIndex === 0 || isGrading}
            >
              ← Previous
            </Button>

            {!isLastTask ? (
              <Button variant="primary" onClick={handleNext} disabled={isGrading} loading={isGrading}>
                {isGrading ? "Saving..." : "Next Task →"}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={isSubmitting || isGrading}
                loading={isSubmitting || isGrading}
              >
                {isGrading ? "Saving..." : isSubmitting ? "Submitting..." : "Submit Assessment ✓"}
              </Button>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}
