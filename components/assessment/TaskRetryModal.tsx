"use client";

import React, { useState, useEffect, useRef } from "react";
import { AssessmentTaskItem } from "@/types/assessment";
import { TaskRenderer } from "./TaskRenderer";
import { UsageCapExceededNotice, UsageCapExceededDetails } from "@/components/billing/UsageCapNotice";
import { Button } from "@/components/ui/Button";

export interface TaskRetryModalProps {
  skillNodeId: string;
  skillNodeName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCompetencyScore: number) => void;
}

export function TaskRetryModal({
  skillNodeId,
  skillNodeName,
  isOpen,
  onClose,
  onSuccess,
}: TaskRetryModalProps) {
  const [task, setTask] = useState<AssessmentTaskItem | null>(null);
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [capExceeded, setCapExceeded] = useState<UsageCapExceededDetails | null>(null);
  const [submissionResult, setSubmissionResult] = useState<{
    ai_score: number;
    ai_feedback: Record<string, unknown>;
    competency_score: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen || !skillNodeId) return;

    async function fetchTask() {
      try {
        setLoading(true);
        setError(null);
        setSubmissionResult(null);
        setValue("");

        const response = await fetch(
          `/api/assessment/task?skill_node_id=${encodeURIComponent(skillNodeId)}`,
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch task (${response.status})`);
        }

        const data = await response.json();
        if (data.task) {
          setTask(data.task);
        } else {
          throw new Error("Task data not found");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    fetchTask();
  }, [isOpen, skillNodeId]);

  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmitAttempt = async () => {
    if (!task) return;

    try {
      setSubmitting(true);
      setError(null);
      setCapExceeded(null);

      const response = await fetch("/api/assessment/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: task.id,
          response: value,
        }),
      });

      if (response.status === 429) {
        setCapExceeded(await response.json());
        return;
      }

      if (!response.ok) {
        throw new Error(`Submission failed (${response.status})`);
      }

      const json = await response.json();
      setSubmissionResult({
        ai_score: json.ai_score,
        ai_feedback: json.ai_feedback || {},
        competency_score: json.competency_score,
      });

      if (typeof json.competency_score === "number") {
        onSuccess(json.competency_score);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-observatory-base/80 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-retry-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-steel-800 bg-observatory-panel shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-steel-800/80 bg-observatory-base/60 px-6 py-5">
          <div>
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-telemetry-cyan">
              Practice & Retake Task
            </span>
            <h3 id="task-retry-modal-title" className="text-lg font-bold text-white">
              {skillNodeName}
            </h3>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close practice task dialog"
            className="rounded-full p-2 text-steel-400 transition hover:bg-steel-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-telemetry-cyan focus:ring-offset-2 focus:ring-offset-observatory-panel"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div
              className="flex flex-col items-center justify-center py-12 text-steel-400"
              role="status"
              aria-live="polite"
            >
              <div
                className="h-8 w-8 animate-spin rounded-full border-4 border-telemetry-cyan border-t-transparent"
                aria-hidden="true"
              ></div>
              <p className="mt-3 text-xs">Loading practice task...</p>
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-vulnerability-crimson/30 bg-vulnerability-crimson/10 p-4 text-center text-sm text-vulnerability-crimson"
            >
              {error}
            </div>
          ) : submissionResult ? (
            /* Submission Results Feedback View */
            <div className="flex flex-col gap-6" role="status">
              <div className="flex items-center justify-between rounded-2xl border border-precision-emerald/30 bg-precision-emerald/10 p-6">
                <div>
                  <span className="text-xs font-mono font-semibold uppercase text-precision-emerald">
                    Retake Graded
                  </span>
                  <h4 className="text-2xl font-bold text-white">
                    Attempt Score: {submissionResult.ai_score}%
                  </h4>
                </div>
                <div className="text-right">
                  <span className="text-xs text-steel-400">
                    Updated Node Score
                  </span>
                  <div className="text-xl font-bold text-telemetry-cyan">
                    {submissionResult.competency_score}%
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-steel-800 bg-observatory-base p-4 text-sm text-steel-200">
                <span className="font-semibold text-telemetry-cyan">
                  AI Feedback:{" "}
                </span>
                <p className="mt-1">
                  {String(
                    submissionResult.ai_feedback?.summary ||
                      "Attempt evaluated successfully.",
                  )}
                </p>
              </div>
            </div>
          ) : task ? (
            /* Task Renderer View */
            <div className="flex flex-col gap-6">
              {capExceeded && <UsageCapExceededNotice details={capExceeded} />}

              <div className="rounded-xl border border-steel-800/80 bg-observatory-base/60 p-5">
                <h4 className="text-sm font-semibold text-steel-100">
                  {task.prompt}
                </h4>
              </div>

              <TaskRenderer
                task={task}
                value={value}
                onChange={setValue}
                disabled={submitting || !!capExceeded}
              />
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-steel-800/80 bg-observatory-base/60 px-6 py-4">
          {submissionResult ? (
            <Button onClick={onClose}>Done & Update Results ✓</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitAttempt}
                disabled={submitting || !value.trim()}
                loading={submitting}
              >
                {submitting ? "Grading Attempt..." : "Submit New Attempt ↺"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
