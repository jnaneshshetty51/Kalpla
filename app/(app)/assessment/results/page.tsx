"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AssessmentResultsResponse } from "@/types/results";
import { TaskRetryModal } from "@/components/assessment/TaskRetryModal";
import { ReadinessGauge } from "@/components/ui/ReadinessGauge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AILoadingState } from "@/components/ui/Skeleton";
import { useUser } from "@/components/providers/AuthProvider";

export default function AssessmentResultsPage() {
  const { user, loading: authLoading } = useUser();
  const [data, setData] = useState<AssessmentResultsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Retake node modal state
  const [retryNode, setRetryNode] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    async function fetchResults() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/assessment/results");
        if (!response.ok) {
          if (response.status === 401) {
            // Signed-out user — handled gracefully in the render block below
            setError("UNAUTHORIZED");
            return;
          }
          throw new Error(`Failed to load diagnostic results (${response.status})`);
        }

        const json: AssessmentResultsResponse = await response.json();
        setData(json);

        // Automatically trigger roadmap generation in background right after assessment results load
        fetch("/api/roadmap/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }).catch((err) => console.warn("Background roadmap auto-generation:", err));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      fetchResults();
    }
  }, [authLoading]);

  const handleScoreUpdate = (nodeId: string, newScore: number) => {
    if (!data) return;

    const roundedScore = Math.round(newScore * 10) / 10;
    let totalScoreSum = 0;
    let totalNodesCount = 0;

    const updatedCategories = data.categories.map((catGroup) => {
      let catScoreSum = 0;

      const updatedNodes = catGroup.nodes.map((node) => {
        if (node.id === nodeId) {
          const status =
            roundedScore >= 80
              ? ("mastered" as const)
              : roundedScore >= 40
              ? ("in_progress" as const)
              : ("needs_focus" as const);

          catScoreSum += roundedScore;
          totalScoreSum += roundedScore;
          totalNodesCount++;
          return { ...node, score: roundedScore, status };
        }

        catScoreSum += node.score;
        totalScoreSum += node.score;
        totalNodesCount++;
        return node;
      });

      const avg =
        updatedNodes.length > 0
          ? Math.round((catScoreSum / updatedNodes.length) * 10) / 10
          : 0;

      return {
        ...catGroup,
        averageScore: avg,
        nodes: updatedNodes,
      };
    });

    const newOverallScore =
      totalNodesCount > 0
        ? Math.round((totalScoreSum / totalNodesCount) * 10) / 10
        : 0;

    setData({
      ...data,
      overallScore: newOverallScore,
      categories: updatedCategories,
    });

    // Re-trigger background roadmap generation after score update
    fetch("/api/roadmap/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch((err) => console.warn("Background roadmap re-generation:", err));
  };

  // Loading State
  if (loading || authLoading) {
    return (
      <AILoadingState
        title="Grading Your Assessment Submission"
        subtitle="Evaluating 8 competency categories &amp; synthesizing AI gap diagnostic summary…"
        icon="🎯"
      />
    );
  }

  // Graceful Signed-Out Handling
  if (error === "UNAUTHORIZED" || !user) {
    return (
      <div className="flex min-h-[75vh] flex-col items-center justify-center bg-observatory-base px-4 py-16 text-steel-50 font-mono telemetry-grid-bg">
        <Card variant="glow" padding="lg" className="w-full max-w-lg text-center flex flex-col items-center gap-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-telemetry-cyan/20 border border-telemetry-cyan/40 text-2xl text-telemetry-cyan">
            🎯
          </div>

          <div>
            <Badge variant="info" className="mb-2">
              Diagnostic Complete
            </Badge>
            <h1 className="text-xl font-bold text-white">
              Save Your Assessment &amp; Launch Roadmap
            </h1>
            <p className="text-xs text-steel-400 font-sans mt-2 leading-relaxed">
              Your 8-category skill diagnostic has been evaluated. Create a free account to save your competency vector and generate your personalized 90-day roadmap.
            </p>
          </div>

          <div className="w-full bg-observatory-base p-4 rounded-2xl border border-steel-800 text-left text-xs space-y-2">
            <div className="flex items-center justify-between text-steel-300">
              <span>GenAI Baseline Competency:</span>
              <span className="text-telemetry-cyan font-bold font-tabular">Evaluated</span>
            </div>
            <div className="flex items-center justify-between text-steel-300">
              <span>Target Benchmark:</span>
              <span className="text-precision-emerald font-bold font-tabular">70% Production Target</span>
            </div>
            <div className="flex items-center justify-between text-steel-300">
              <span>Personalized Roadmap:</span>
              <span className="text-calibrated-amber font-bold font-tabular">Ready to Generate</span>
            </div>
          </div>

          <Link
            href="/signup?redirectTo=/roadmap"
            className="w-full rounded-xl bg-telemetry-cyan px-6 py-3.5 font-mono text-sm font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white text-center"
          >
            Create Free Account &amp; Start Roadmap →
          </Link>

          <p className="text-[11px] text-steel-400 font-sans">
            Already have an account?{" "}
            <Link href="/login?redirectTo=/roadmap" className="text-telemetry-cyan hover:underline font-mono">
              Log in to load results
            </Link>
          </p>
        </Card>
      </div>
    );
  }

  // Error State
  if (error || !data) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono">
        <Card variant="bordered" padding="lg" className="max-w-md text-center">
          <h2 className="text-lg font-bold text-vulnerability-crimson">
            Telemetry Read Error
          </h2>
          <p className="mt-2 text-xs text-steel-400 font-sans leading-relaxed">
            {error || "Unable to retrieve assessment diagnostic results."}
          </p>
          <Button
            variant="primary"
            className="mt-6 w-full"
            onClick={() => window.location.reload()}
          >
            Retry Loading Telemetry
          </Button>
        </Card>
      </div>
    );
  }

  // Calculate weakest category for motivating gap focus callout
  const sortedCategories = [...data.categories].sort((a, b) => a.averageScore - b.averageScore);
  const weakestCategory = sortedCategories[0];

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 font-mono pb-20 telemetry-grid-bg">
      {/* Top Header */}
      <header className="border-b border-steel-800 bg-observatory-panel/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
              Diagnostic Evaluation Complete
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white mt-0.5">
              GenAI Engineering Telemetry Matrix
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/assessment"
              className="text-xs font-mono text-steel-400 hover:text-white transition underline"
            >
              Retake Assessment ↺
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 pt-8 flex flex-col gap-10">
        {/* HERO SECTION: Overall Readiness Gauge + AI Diagnostic Insight */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Overall Readiness Gauge Hero Panel */}
          <div className="lg:col-span-5">
            <Card variant="glow" padding="lg" className="w-full">
              <div className="flex items-center justify-between border-b border-steel-800 pb-3 mb-6">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Baseline Readiness Score
                </span>
                <Badge
                  variant={
                    data.overallScore >= 80
                      ? "mastery"
                      : data.overallScore >= 70
                      ? "info"
                      : "gap"
                  }
                >
                  {data.overallScore >= 80
                    ? "MASTERED"
                    : data.overallScore >= 70
                    ? "PRO READY"
                    : "GAP DETECTED"}
                </Badge>
              </div>

              <div className="flex flex-col items-center my-4">
                <ReadinessGauge
                  score={data.overallScore}
                  benchmark={70}
                  variant="radial"
                  size="lg"
                  label="Production Benchmark (70%)"
                  animateReveal
                />
              </div>

              <div className="mt-6 pt-4 border-t border-steel-800 flex items-center justify-between text-xs">
                <span className="text-steel-400">Production Benchmark:</span>
                <span className="font-bold text-white font-tabular">70.0% Target</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-steel-400">Target Gap Delta:</span>
                <span
                  className={`font-bold font-tabular ${
                    data.overallScore >= 70
                      ? "text-precision-emerald"
                      : "text-calibrated-amber"
                  }`}
                >
                  {data.overallScore >= 70
                    ? `+${Math.round(data.overallScore - 70)}% Over Target`
                    : `-${Math.round(70 - data.overallScore)}% Gap to Close`}
                </span>
              </div>
            </Card>
          </div>

          {/* Right: AI Diagnostic Insight Summary & UNMISSABLE SINGLE PRIMARY CTA */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {/* AI Diagnostic Summary Box */}
            <Card variant="bordered" padding="lg" className="bg-observatory-panel/90 border-telemetry-cyan/40">
              <div className="flex items-center gap-2 border-b border-steel-800 pb-3 mb-3 text-telemetry-cyan">
                <span className="h-2 w-2 rounded-full bg-telemetry-cyan shadow-telemetry-cyan" />
                <h2 className="text-xs font-bold uppercase tracking-wider">
                  AI Diagnostic Analysis &amp; Focus Area
                </h2>
              </div>
              <p className="text-xs sm:text-sm font-sans text-steel-200 leading-relaxed">
                {data.aiSummary}
              </p>

              {weakestCategory && (
                <div className="mt-4 p-3 rounded-xl bg-observatory-base border border-calibrated-amber/40 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-calibrated-amber font-bold">⚠️ Priority Focus Area:</span>
                    <span className="text-white font-bold">{weakestCategory.category}</span>
                  </div>
                  <Badge variant="gap" size="sm">
                    Avg {weakestCategory.averageScore}%
                  </Badge>
                </div>
              )}
            </Card>

            {/* UNMISSABLE SINGLE PRIMARY CTA CARD */}
            <Card variant="default" padding="lg" className="bg-gradient-to-br from-observatory-panel via-steel-900 to-observatory-panel border-telemetry-cyan/60 text-center flex flex-col items-center gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                  Next Execution Action
                </span>
                <h2 className="text-xl font-bold text-white mt-1">
                  Ready to Close Your Competency Gaps?
                </h2>
                <p className="text-xs text-steel-400 font-sans mt-1 max-w-md mx-auto">
                  We have built a custom 90-day learning roadmap prioritizing your lowest-scoring skills first.
                </p>
              </div>

              {/* SINGLE CLEAR UNMISSABLE PRIMARY CTA */}
              <Link
                href="/roadmap"
                className="w-full max-w-md rounded-xl bg-telemetry-cyan py-4 font-mono text-sm font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white text-center"
              >
                Start Your Adaptive Roadmap →
              </Link>

              <span className="text-[11px] text-steel-400 font-sans">
                Skips what you know • Prioritizes {weakestCategory?.category || "growth areas"} first
              </span>
            </Card>
          </div>
        </div>

        {/* 8 TOP-LEVEL CATEGORY SCORE BREAKDOWN GRID */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-steel-800 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                8-Domain Breakdown
              </span>
              <h2 className="text-lg font-bold text-white mt-0.5">
                Detailed Skill Node Telemetry Matrix
              </h2>
            </div>
            <span className="text-xs text-steel-400 hidden sm:inline">
              Click &quot;Retake ↺&quot; on any node to re-evaluate
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data.categories.map((catGroup, idx) => {
              const isWeak = catGroup.averageScore < 70;
              return (
                <Card
                  key={catGroup.category}
                  variant={isWeak ? "bordered" : "default"}
                  className={`motion-pop-in ${isWeak ? "border-calibrated-amber/30" : ""}`}
                  style={{ animationDelay: `${Math.min(idx, 7) * 60}ms` }}
                >
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
                    <Badge variant={catGroup.averageScore >= 80 ? "mastery" : isWeak ? "gap" : "info"}>
                      Avg {catGroup.averageScore}%
                    </Badge>
                  </div>

                  {/* Skill Node Score Bars */}
                  <div className="flex flex-col gap-3.5">
                    {catGroup.nodes.map((node) => (
                      <div key={node.id} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs">
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
                            <button
                              onClick={() => setRetryNode({ id: node.id, name: node.name })}
                              className="text-[10px] font-mono text-steel-400 hover:text-telemetry-cyan transition underline"
                            >
                              Retake ↺
                            </button>
                          </div>
                        </div>

                        {/* ReadinessGauge Linear Segment */}
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
              );
            })}
          </div>
        </section>

        {/* BOTTOM SINGLE CTA CLOSE CARD */}
        <section className="mt-6">
          <Card variant="glow" padding="lg" className="text-center flex flex-col items-center gap-4">
            <h2 className="text-xl font-bold text-white">
              Stop Guessing. Start Closing Your GenAI Skill Gaps.
            </h2>
            <p className="text-xs text-steel-400 font-sans max-w-md">
              Launch your adaptive roadmap now to access structured lessons, AI tutor guidance, and production project rubrics.
            </p>
            <Link
              href="/roadmap"
              className="w-full max-w-md rounded-xl bg-telemetry-cyan py-3.5 font-mono text-sm font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white text-center"
            >
              Start Your Adaptive Roadmap →
            </Link>
          </Card>
        </section>
      </main>

      {/* Task Retry Modal */}
      {retryNode && (
        <TaskRetryModal
          skillNodeId={retryNode.id}
          skillNodeName={retryNode.name}
          isOpen={!!retryNode}
          onClose={() => setRetryNode(null)}
          onSuccess={(newScore) => handleScoreUpdate(retryNode.id, newScore)}
        />
      )}
    </div>
  );
}
