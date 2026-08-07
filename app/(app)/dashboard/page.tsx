"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { DashboardAggregateResponse } from "@/lib/dashboard/aggregate";
import { ResumeAssessmentBanner } from "@/components/assessment/ResumeAssessmentBanner";
import { DailyTask } from "@/lib/coach/generateDailyTasks";
import { ReadinessGauge } from "@/components/ui/ReadinessGauge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DashboardSkeleton } from "@/components/ui/Skeleton";

interface CoachTaskLog {
  id: string;
  date: string;
  tasks: (DailyTask & { done?: boolean })[];
  completed: boolean;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardAggregateResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [coachLog, setCoachLog] = useState<CoachTaskLog | null>(null);
  const [coachLoading, setCoachLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadCoachTasks() {
      try {
        const res = await fetch("/api/dashboard/coach-tasks");
        if (res.ok) {
          const json = await res.json();
          if (isMounted) setCoachLog(json.log);
        }
      } finally {
        if (isMounted) setCoachLoading(false);
      }
    }
    loadCoachTasks();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggleTask = async (index: number, currentlyDone: boolean) => {
    if (!coachLog) return;
    // Optimistic update.
    setCoachLog((prev) =>
      prev
        ? {
            ...prev,
            tasks: prev.tasks.map((t, i) => (i === index ? { ...t, done: !currentlyDone } : t)),
          }
        : prev,
    );
    const res = await fetch("/api/dashboard/coach-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_index: index, done: !currentlyDone }),
    });
    if (res.ok) {
      const json = await res.json();
      setCoachLog(json.log);
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch single consolidated server-side dashboard aggregation payload
        const response = await fetch("/api/dashboard");
        if (!response.ok) {
          throw new Error(`Failed to load dashboard payload (${response.status})`);
        }

        const json = await response.json();
        if (isMounted) {
          if (json.dashboard) {
            setData(json.dashboard);
          } else {
            throw new Error("Invalid dashboard payload received");
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono">
        <Card variant="bordered" padding="lg" className="max-w-md text-center">
          <h2 className="text-lg font-bold text-vulnerability-crimson">
            Dashboard Telemetry Error
          </h2>
          <p className="mt-2 text-xs text-steel-400 font-sans leading-relaxed">
            {error || "Unable to retrieve consolidated dashboard payload."}
          </p>
          <Button
            variant="primary"
            className="mt-6 w-full"
            onClick={() => window.location.reload()}
          >
            Retry Loading Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const {
    overallScore,
    readinessBadge,
    isAssessmentPending,
    streak,
    next_step,
    recent_submissions,
    categories,
    nodeCounts,
    upcomingSessions = [],
  } = data;

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 font-mono pb-24 telemetry-grid-bg">
      {/* Navigation Header */}
      <header className="border-b border-steel-800 bg-observatory-panel/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
              {readinessBadge}
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white mt-0.5">
              Engineer Console Dashboard
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Restrained Telemetry Streak Indicator */}
            <div className="flex items-center gap-2 rounded-xl border border-calibrated-amber/30 bg-calibrated-amber/10 px-3 py-1.5 text-xs font-bold text-calibrated-amber">
              <span className="text-sm">⚡</span>
              <span className="font-tabular">
                {streak.current_streak_days} Day Streak ({streak.total_active_days} Active Days)
              </span>
            </div>

            <Link
              href="/roadmap"
              className="text-xs font-mono text-steel-300 hover:text-white transition underline hidden sm:inline"
            >
              Roadmap Timeline →
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 pt-8 flex flex-col gap-8">
        {/* Incomplete Assessment Session Banner */}
        <ResumeAssessmentBanner />

        {/* DISTINCT PRE-ASSESSMENT EMPTY STATE */}
        {isAssessmentPending ? (
          <Card variant="glow" padding="lg" className="w-full">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex flex-col gap-3 max-w-2xl">
                <Badge variant="gap">
                  Diagnostic Baseline Uncalibrated
                </Badge>
                <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                  Complete Your Skill Diagnostic to Unlock Dashboard Telemetry
                </h2>
                <p className="text-xs sm:text-sm font-sans text-steel-300 leading-relaxed">
                  Welcome to Kalpla! To calibrate your 8-category competency matrix and generate your adaptive 90-day learning roadmap, complete your 10-minute diagnostic assessment.
                </p>
              </div>

              <Link
                href="/assessment"
                className="w-full md:w-auto shrink-0 rounded-xl bg-telemetry-cyan px-8 py-4 font-mono text-sm font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white text-center"
              >
                Begin Baseline Diagnostic →
              </Link>
            </div>

            {/* Feature Highlights Grid */}
            <div className="mt-8 pt-6 border-t border-steel-800 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
              <div className="rounded-xl border border-steel-800 bg-observatory-base p-4">
                <span className="text-telemetry-cyan font-bold block mb-1">01 • Diagnostic Evaluation</span>
                <p className="text-steel-400 font-sans text-[11px]">
                  10 targeted questions analyzing vector search, RAG, tool calling, and fine-tuning.
                </p>
              </div>
              <div className="rounded-xl border border-steel-800 bg-observatory-base p-4">
                <span className="text-precision-emerald font-bold block mb-1">02 • Adaptive Skip Logic</span>
                <p className="text-steel-400 font-sans text-[11px]">
                  Topological sequence that skips what you&apos;ve mastered and targets your exact gaps.
                </p>
              </div>
              <div className="rounded-xl border border-steel-800 bg-observatory-base p-4">
                <span className="text-calibrated-amber font-bold block mb-1">03 • Verified Portfolio</span>
                <p className="text-steel-400 font-sans text-[11px]">
                  Auto-generates public case studies from real server-graded RAG and agent code projects.
                </p>
              </div>
            </div>
          </Card>
        ) : (
          /* STANDARD ASSESSED DASHBOARD VIEW */
          <>
            {/* HERO GRID: Overall Readiness Gauge + Prominent Today's Focus Card */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              {/* Prominent "Today's Focus" Next Best Action Card (8 Columns) */}
              <div className="lg:col-span-8 flex">
                <Card variant="glow" padding="lg" className="w-full flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-steel-800 pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-precision-emerald animate-pulse" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">
                          Today&apos;s Focus — Primary Action
                        </span>
                      </div>
                      {next_step && (
                        <Badge variant="info">
                          ~{next_step.estimated_days} Days to Complete
                        </Badge>
                      )}
                    </div>

                    {next_step ? (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-telemetry-cyan bg-telemetry-cyan/10 px-2.5 py-1 rounded border border-telemetry-cyan/20">
                          {next_step.category || "GenAI Engineering"}
                        </span>
                        <h2 className="text-2xl font-bold text-white mt-3">
                          {next_step.node_name}
                        </h2>
                        <p className="text-xs sm:text-sm font-sans text-steel-300 mt-2 leading-relaxed">
                          {next_step.action_description}
                        </p>

                        <div className="mt-4 p-3.5 rounded-xl bg-observatory-base border border-steel-800 text-xs font-mono text-steel-300">
                          <span className="text-steel-400 font-bold uppercase tracking-wider block mb-1">
                            Learning Objective
                          </span>
                          {next_step.learning_objective}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs font-sans text-steel-400 mt-4">
                        Your curriculum roadmap is complete! Review your mastered skill nodes below.
                      </p>
                    )}
                  </div>

                  {/* DIRECT ACTION BUTTON (Not just a link) */}
                  <div className="mt-6 pt-4 border-t border-steel-800">
                    <Link
                      href={next_step?.target_url || "/roadmap"}
                      className="inline-flex items-center justify-center rounded-xl bg-telemetry-cyan px-7 py-3.5 font-mono text-sm font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white text-center"
                    >
                      {next_step?.action_label || "View Learning Roadmap →"}
                    </Link>
                  </div>
                </Card>
              </div>

              {/* Overall Readiness Gauge (4 Columns) */}
              <div className="lg:col-span-4 flex">
                <Card variant="bordered" padding="lg" className="w-full flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-steel-800 pb-3 mb-4">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Readiness Gauge
                      </span>
                      <Badge variant={overallScore >= 70 ? "mastery" : "gap"}>
                        {overallScore}%
                      </Badge>
                    </div>

                    <div className="flex flex-col items-center my-4">
                      <ReadinessGauge
                        score={overallScore}
                        benchmark={70}
                        variant="radial"
                        size="md"
                        label="Production Benchmark (70%)"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-steel-800 flex flex-col gap-2 font-mono text-xs">
                    <div className="flex items-center justify-between text-steel-300">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-precision-emerald" />
                        Mastered
                      </span>
                      <span className="font-bold text-white font-tabular">{nodeCounts.mastered} / {nodeCounts.total}</span>
                    </div>

                    <div className="flex items-center justify-between text-steel-300">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-telemetry-cyan" />
                        In Progress
                      </span>
                      <span className="font-bold text-white font-tabular">{nodeCounts.in_progress}</span>
                    </div>

                    <div className="flex items-center justify-between text-steel-300">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-calibrated-amber" />
                        Needs Focus
                      </span>
                      <span className="font-bold text-white font-tabular">{nodeCounts.needs_focus}</span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            {/* Daily Coach Tasks Log */}
            {!coachLoading && coachLog && coachLog.tasks.length > 0 && (
              <Card variant="bordered" padding="md">
                <div className="flex items-center justify-between border-b border-steel-800 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Today&apos;s Daily Coach Tasks
                    </span>
                  </div>
                  <span className="text-xs text-steel-400 font-mono font-tabular">
                    {coachLog.tasks.filter((t) => t.done).length} / {coachLog.tasks.length} Completed
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {coachLog.tasks.map((task, idx) => (
                    <label
                      key={idx}
                      className={`flex items-start gap-3 rounded-xl border p-3.5 text-xs transition cursor-pointer font-mono ${
                        task.done
                          ? "border-precision-emerald/30 bg-precision-emerald/5 text-steel-400"
                          : "border-steel-800 bg-observatory-base text-steel-200 hover:border-steel-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!!task.done}
                        onChange={() => handleToggleTask(idx, !!task.done)}
                        className="mt-0.5 h-4 w-4 rounded accent-telemetry-cyan"
                      />
                      <div>
                        <span className={`font-bold ${task.done ? "line-through text-steel-400" : "text-white"}`}>
                          {task.title}
                        </span>{" "}
                        <span className="text-steel-400 font-tabular">(~{task.estimated_minutes} min)</span>
                        <p className="mt-0.5 text-steel-400 font-sans">{task.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </Card>
            )}

            {/* Upcoming Live Sessions */}
            {upcomingSessions.length > 0 && (
              <Card variant="bordered" padding="md">
                <div className="flex items-center justify-between border-b border-steel-800 pb-3 mb-4">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Upcoming Sessions</span>
                  <Link href="/live-sessions" className="text-xs text-telemetry-cyan hover:underline font-mono">
                    View all →
                  </Link>
                </div>
                <div className="flex flex-col gap-3">
                  {upcomingSessions.map((session) => (
                    <Link
                      key={session.id}
                      href="/live-sessions"
                      className="flex items-center justify-between gap-3 rounded-xl border border-steel-800 bg-observatory-base p-3.5 text-xs font-mono hover:border-steel-700 transition"
                    >
                      <div>
                        <span className="font-bold text-white">{session.title}</span>
                        <p className="mt-0.5 text-steel-400">
                          {new Date(session.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      </div>
                      <Badge variant="info" size="sm" dot={false}>{session.session_type.replace("_", " ")}</Badge>
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {/* Recent Submissions */}
            {recent_submissions.length > 0 && (
              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-steel-800 pb-3">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Recent Code Execution Activity
                  </span>
                  <span className="text-xs text-steel-400 font-mono">
                    Latest 5 Submissions
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {recent_submissions.map((sub) => (
                    <Card key={sub.id} variant="default" padding="sm" className="font-mono text-xs">
                      <span className="text-[10px] text-telemetry-cyan uppercase font-bold">
                        {sub.category}
                      </span>
                      <h4 className="font-bold text-white mt-1 truncate">
                        {sub.task_name}
                      </h4>
                      <div className="mt-3 flex items-center justify-between border-t border-steel-800 pt-2 text-[11px]">
                        <span className="text-steel-400">
                          {new Date(sub.created_at).toLocaleDateString()}
                        </span>
                        <Badge variant={sub.ai_score && sub.ai_score >= 80 ? "mastery" : "info"} size="sm">
                          {sub.ai_score !== null ? `${sub.ai_score}%` : "Graded"}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* PER-CATEGORY PROGRESS LIST BELOW THE FOLD (Consistent with Assessment Results) */}
            <section className="flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-steel-800 pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                    Competency Telemetry
                  </span>
                  <h2 className="text-lg font-bold text-white mt-0.5">
                    Skill Domain Progress Breakdown
                  </h2>
                </div>
                <span className="text-xs text-steel-400 font-mono font-tabular">
                  8 Categories • 26 Skill Nodes
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {categories.map((catGroup, idx) => (
                  <Card key={catGroup.category} variant="default">
                    {/* Category Header */}
                    <div className="flex items-center justify-between border-b border-steel-800 pb-3 mb-4">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-steel-800 text-xs font-bold text-telemetry-cyan border border-steel-700">
                          0{idx + 1}
                        </span>
                        <h3 className="text-sm font-bold text-white">
                          {catGroup.category}
                        </h3>
                      </div>
                      <Badge variant={catGroup.averageScore >= 80 ? "mastery" : catGroup.averageScore >= 50 ? "gap" : "vulnerability"}>
                        Avg {catGroup.averageScore}%
                      </Badge>
                    </div>

                    {/* Skill Node Score Bars */}
                    <div className="flex flex-col gap-3.5">
                      {catGroup.nodes.map((node) => (
                        <div key={node.id} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-steel-200">{node.name}</span>
                              <span className="text-[10px] text-steel-400 font-mono">
                                L{node.difficulty}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  node.status === "mastered"
                                    ? "mastery"
                                    : node.status === "in_progress"
                                    ? "gap"
                                    : "vulnerability"
                                }
                                size="sm"
                                dot={false}
                              >
                                {node.score}%
                              </Badge>
                            </div>
                          </div>

                          {/* Progress Bar Vector */}
                          <div className="h-2 w-full rounded-full bg-observatory-base border border-steel-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                node.score >= 80
                                  ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-telemetry-emerald"
                                  : node.score >= 50
                                  ? "bg-gradient-to-r from-amber-500 to-yellow-400 shadow-telemetry-amber"
                                  : "bg-gradient-to-r from-rose-600 to-rose-400"
                              }`}
                              style={{ width: `${Math.max(node.score, 4)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
