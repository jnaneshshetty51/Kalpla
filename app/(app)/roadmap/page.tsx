"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { RoadmapNodeItem } from "@/lib/roadmap/generate";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { RoadmapSkeleton } from "@/components/ui/Skeleton";
import { ReadinessGauge } from "@/components/ui/ReadinessGauge";

interface RoadmapRecord {
  id: string;
  user_id: string;
  generated_at: string;
  nodes: RoadmapNodeItem[];
}

interface WeekGroup {
  weekNumber: number;
  title: string;
  totalDays: number;
  nodes: RoadmapNodeItem[];
}

export default function RoadmapPage() {
  const [roadmap, setRoadmap] = useState<RoadmapRecord | null>(null);
  const [overallScore, setOverallScore] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/roadmap");
        if (!response.ok) {
          throw new Error(`Failed to load roadmap (${response.status})`);
        }

        const json = await response.json();
        if (isMounted) {
          if (json.roadmap) {
            setRoadmap(json.roadmap);
            setOverallScore(json.overallScore ?? 0);
          } else {
            throw new Error("Invalid roadmap response");
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

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRegenerate = async () => {
    try {
      setIsRegenerating(true);
      const res = await fetch("/api/roadmap/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.roadmap) {
          setRoadmap(json.roadmap);
        }
      }
    } catch (err) {
      console.error("Regenerate roadmap error:", err);
    } finally {
      setIsRegenerating(false);
    }
  };

  if (loading) {
    return <RoadmapSkeleton />;
  }

  if (error || !roadmap || !roadmap.nodes || roadmap.nodes.length === 0) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono telemetry-grid-bg">
        <EmptyState
          icon="🗺️"
          badgeText="Roadmap Uncalibrated"
          title="Complete Your Diagnostic to Generate Your Roadmap"
          description="Your adaptive 90-day learning roadmap relies on your 8-category diagnostic baseline score. Take the 10-minute assessment to calibrate your personalized curriculum timeline."
          action={{
            label: "Take Diagnostic Assessment →",
            href: "/assessment",
          }}
          secondaryAction={{
            label: "Return to Dashboard",
            href: "/dashboard",
          }}
        />
      </div>
    );
  }

  // Group nodes into Week-by-Week buckets based on estimated days
  const weekGroups: WeekGroup[] = [];
  let currentWeekNumber = 1;
  let currentWeekDays = 0;
  let currentWeekNodes: RoadmapNodeItem[] = [];

  const activeNodes = (roadmap.nodes || []).filter((n) => n.status !== "skipped");
  const skippedNodes = (roadmap.nodes || []).filter((n) => n.status === "skipped");

  activeNodes.forEach((node) => {
    const nodeDays = Math.max(1, node.estimated_days || 3);

    if (currentWeekDays + nodeDays > 7 && currentWeekNodes.length > 0) {
      weekGroups.push({
        weekNumber: currentWeekNumber,
        title: `Week ${currentWeekNumber}: ${currentWeekNodes[0]?.node_name} & Core Systems`,
        totalDays: currentWeekDays,
        nodes: currentWeekNodes,
      });

      currentWeekNumber++;
      currentWeekDays = 0;
      currentWeekNodes = [];
    }

    currentWeekNodes.push(node);
    currentWeekDays += nodeDays;
  });

  if (currentWeekNodes.length > 0) {
    weekGroups.push({
      weekNumber: currentWeekNumber,
      title: `Week ${currentWeekNumber}: Advanced System Integration & Capstone`,
      totalDays: currentWeekDays,
      nodes: currentWeekNodes,
    });
  }

  const completedCount = activeNodes.filter((n) => n.status === "completed").length;
  const totalActive = activeNodes.length;
  const progressPercent = totalActive > 0 ? Math.round((completedCount / totalActive) * 100) : 0;
  const totalEstimatedDays = activeNodes.reduce((sum, n) => sum + (n.estimated_days || 0), 0);

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 font-mono pb-24 telemetry-grid-bg">
      {/* Navigation Header */}
      <header className="sticky top-0 z-20 border-b border-steel-800 bg-observatory-panel/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
              Topological Learning Path
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white mt-0.5">
              GenAI Engineering Roadmap Timeline
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRegenerate}
              loading={isRegenerating}
            >
              {isRegenerating ? "Regenerating…" : "Regenerate Path ↺"}
            </Button>
          </div>
        </div>

        {/* Timeline Progress Bar */}
        <div className="h-1 w-full bg-steel-900">
          <div
            className="h-full bg-telemetry-cyan shadow-telemetry-cyan transition-all duration-300"
            style={{ width: `${Math.max(progressPercent, 5)}%` }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 flex flex-col gap-10">
        {/* Roadmap Summary Banner */}
        <Card variant="glow" padding="lg" className="w-full">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-telemetry-cyan">
                Curriculum Overview
              </span>
              <h2 className="text-xl font-bold text-white mt-1">
                90-Day Adaptive Engineering Path
              </h2>
              <p className="text-xs text-steel-400 font-sans mt-1">
                Topologically ordered sequence skipping what you mastered and prioritizing your diagnostic gaps.
              </p>
            </div>

            <div className="flex items-center gap-4 sm:gap-6 font-mono text-xs flex-wrap">
              <div className="rounded-xl border border-steel-800 bg-observatory-base px-4 py-2.5 text-center">
                <span className="block text-[10px] text-steel-400 uppercase font-semibold">Total Duration</span>
                <span className="text-xs font-bold text-telemetry-cyan font-tabular">
                  ~{totalEstimatedDays} Days ({weekGroups.length} Weeks)
                </span>
              </div>

              <div className="rounded-xl border border-steel-800 bg-observatory-base px-4 py-2.5 text-center">
                <span className="block text-[10px] text-steel-400 uppercase font-semibold">Curriculum Progress</span>
                <span className="text-xs font-bold text-precision-emerald font-tabular">
                  {progressPercent}% Completed
                </span>
              </div>

              {/* Same signature readiness visualization used on the
                  dashboard, assessment results, and portfolio — reads the
                  same overallScore computation (lib/dashboard/aggregate.ts)
                  so it can't drift from what those pages show. */}
              <div className="rounded-xl border border-steel-800 bg-observatory-base px-4 py-2 text-center">
                <span className="block text-[10px] text-steel-400 uppercase font-semibold mb-1">Overall Readiness</span>
                <ReadinessGauge score={overallScore} variant="badge" />
              </div>
            </div>
          </div>

          {/* Pre-Skipped Nodes (Earned Credit Banner) */}
          {skippedNodes.length > 0 && (
            <div className="mt-6 pt-5 border-t border-steel-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="mastery">
                    ✓ {skippedNodes.length} Competencies Pre-Mastered
                  </Badge>
                </div>
                <span className="text-[11px] text-steel-400 font-sans">
                  Bypassed via diagnostic assessment score (Score ≥ 80%)
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {skippedNodes.map((sk) => (
                  <span
                    key={sk.skill_node_id}
                    className="rounded-lg border border-precision-emerald/30 bg-precision-emerald/5 px-2.5 py-1 font-mono text-xs text-precision-emerald flex items-center gap-1.5"
                  >
                    <span>✓</span>
                    <span>{sk.node_name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* VERTICAL TIMELINE LAYOUT
            Justification: A typical 90-day GenAI curriculum contains ~26 nodes spanning 12 weeks.
            A vertical timeline allows progressive scrolling on both desktop and mobile devices,
            enables clean milestone connectors, and prevents horizontal scroll clipping. */}
        <div className="flex flex-col gap-12 relative pl-4 sm:pl-8 border-l-2 border-steel-800/80">
          {weekGroups.map((week) => (
            <section key={week.weekNumber} className="relative">
              {/* Timeline Connector Bullet Dot */}
              <div className="absolute -left-[23px] sm:-left-[39px] top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-steel-700 bg-observatory-base font-mono text-[10px] font-bold text-telemetry-cyan">
                {week.weekNumber}
              </div>

              {/* Week Milestone Header */}
              <div className="mb-6 flex items-center justify-between border-b border-steel-800 pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                    Milestone Horizon 0{week.weekNumber}
                  </span>
                  <h3 className="text-base font-bold text-white mt-0.5">{week.title}</h3>
                </div>
                <span className="text-xs font-mono text-steel-400 font-tabular">
                  ~{week.totalDays} Days Commitment
                </span>
              </div>

              {/* Milestone Node Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {week.nodes.map((node) => {
                  const isCurrent = node.status === "available" || node.status === "in_progress";
                  const isCompleted = node.status === "completed";
                  const isLocked = node.status === "locked";

                  const cardContent = (
                    <Card
                      variant={isCurrent ? "glow" : "default"}
                      className={`h-full flex flex-col justify-between transition duration-200 ${
                        isCurrent
                          ? "border-telemetry-cyan/80 bg-observatory-panel/90 telemetry-glow-cyan ring-1 ring-telemetry-cyan/40"
                          : isCompleted
                          ? "border-precision-emerald/30 bg-precision-emerald/5"
                          : isLocked
                          ? "border-steel-800/60 bg-observatory-base/50 opacity-60"
                          : ""
                      }`}
                    >
                      <div>
                        {/* Node Card Header */}
                        <div className="flex items-center justify-between border-b border-steel-800/80 pb-3 mb-3">
                          <div className="flex items-center gap-2">
                            {isCurrent && (
                              <span className="h-2 w-2 rounded-full bg-telemetry-cyan animate-pulse shadow-telemetry-cyan" />
                            )}
                            <Badge
                              variant={
                                isCurrent
                                  ? "info"
                                  : isCompleted
                                  ? "mastery"
                                  : "neutral"
                              }
                              size="sm"
                              dot={false}
                            >
                              {isCurrent
                                ? "CURRENT FOCUS"
                                : isCompleted
                                ? "COMPLETED ✓"
                                : "LOCKED 🔒"}
                            </Badge>
                          </div>

                          <span className="font-mono text-xs text-steel-400 font-tabular">
                            ~{node.estimated_days} Days
                          </span>
                        </div>

                        {/* Node Title & Objective */}
                        <h4
                          className={`text-base font-bold transition ${
                            isCurrent
                              ? "text-white"
                              : isCompleted
                              ? "text-steel-200"
                              : "text-steel-400"
                          }`}
                        >
                          {node.node_name}
                        </h4>
                        <p className="mt-2 text-xs font-sans text-steel-400 leading-relaxed line-clamp-2">
                          {node.learning_objective ||
                            `Master ${node.node_name} concepts, code implementations, and evaluation.`}
                        </p>
                      </div>

                      {/* Card Footer Action */}
                      <div className="mt-6 pt-4 border-t border-steel-800/80 flex items-center justify-between text-xs font-mono">
                        <span className="text-[11px] text-steel-400 font-tabular">
                          Sequence #{node.order}
                        </span>

                        {!isLocked ? (
                          <span className="font-bold text-telemetry-cyan group-hover:underline">
                            Start Skill Module →
                          </span>
                        ) : (
                          <span className="text-[11px] text-steel-400 font-sans italic">
                            Complete prerequisite nodes
                          </span>
                        )}
                      </div>
                    </Card>
                  );

                  return !isLocked ? (
                    <Link
                      key={node.skill_node_id}
                      href={`/learn/${encodeURIComponent(node.skill_node_id)}`}
                      className="group"
                    >
                      {cardContent}
                    </Link>
                  ) : (
                    <div key={node.skill_node_id}>{cardContent}</div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
