"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export interface ResumeAssessmentBannerProps {
  taskNumber?: number;
  totalTasks?: number;
  onDismiss?: () => void;
}

/**
 * Resume-after-abandonment (Prompt 27) needs to read as reassurance, not a
 * system notice — someone coming back to an unfinished evaluation is
 * already the person most likely to feel behind or judged by it. This is
 * why it leads with "Welcome back" and what was saved, not "Session
 * restored" or similar status-log language, and why it's a warm inline
 * moment rather than a blocking modal — a gate here would read as more
 * exam-like right at the point someone's already hesitant to continue.
 */
export function ResumeAssessmentBanner({
  taskNumber: propTaskNumber,
  totalTasks: propTotalTasks,
  onDismiss: propOnDismiss,
}: ResumeAssessmentBannerProps = {}) {
  const [session, setSession] = useState<{
    current_index: number;
    completed: boolean;
  } | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    if (propTaskNumber !== undefined) return;

    async function checkSession() {
      try {
        const response = await fetch("/api/assessment/session");
        if (response.ok) {
          const json = await response.json();
          if (json.session && !json.session.completed) {
            setSession(json.session);
          }
        }
      } catch (err) {
        console.error("Error checking assessment session:", err);
      }
    }

    checkSession();
  }, [propTaskNumber]);

  if (dismissed) return null;

  // Controlled mode — rendered directly on /assessment as the "welcome
  // back" moment itself, not a dashboard-style notice.
  if (propTaskNumber !== undefined) {
    const total = propTotalTasks || 8;
    const doneCount = propTaskNumber - 1;

    return (
      <Card variant="glow" padding="md" className="relative mb-6 overflow-hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-telemetry-cyan/10 text-telemetry-cyan ring-1 ring-telemetry-cyan/30">
              <span className="text-xl">👋</span>
            </div>
            <div>
              <h4 className="font-mono text-sm font-bold text-white">
                Welcome back
              </h4>
              <p className="mt-0.5 text-xs leading-relaxed text-steel-300">
                Everything you&apos;d already answered is saved —{" "}
                {doneCount > 0 ? (
                  <>
                    <strong className="text-telemetry-cyan">
                      {doneCount} {doneCount === 1 ? "task" : "tasks"} down
                    </strong>
                    , picking up at Task {propTaskNumber} of {total}.
                  </>
                ) : (
                  <>picking up right where you left off.</>
                )}{" "}
                Take your time.
              </p>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => (propOnDismiss ? propOnDismiss() : setDismissed(true))}
            className="shrink-0 self-start sm:self-center"
          >
            Got it
          </Button>
        </div>
      </Card>
    );
  }

  // Self-fetching mode on /dashboard.
  if (!session || session.completed) return null;

  const currentTaskNum = (session.current_index || 0) + 1;

  return (
    <Card variant="glow" padding="none" className="relative overflow-hidden p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-telemetry-cyan/10 text-telemetry-cyan ring-1 ring-telemetry-cyan/30">
            <span className="text-lg">👋</span>
          </div>
          <div>
            <h4 className="font-mono text-sm font-bold text-white">
              Pick up your assessment anytime
            </h4>
            <p className="text-xs text-steel-300">
              You&apos;re saved at{" "}
              <strong className="text-telemetry-cyan">Task {currentTaskNum} of 8</strong>{" "}
              — no rush, it&apos;ll be here.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <Button variant="secondary" size="sm" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
          {/* Styled to match Button's primary variant rather than nesting a
              real <button> inside this <a> — Button has no polymorphic "as"
              prop, and a button-in-anchor creates a confusing double
              keyboard/screen-reader stop for one action. */}
          <Link
            href="/assessment"
            className="rounded-xl bg-telemetry-cyan px-4 py-2 font-mono text-[11px] font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white"
          >
            Resume →
          </Link>
        </div>
      </div>
    </Card>
  );
}
