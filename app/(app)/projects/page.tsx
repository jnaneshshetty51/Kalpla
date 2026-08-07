"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ProjectLadderItem } from "@/app/api/projects/route";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ReadinessGauge } from "@/components/ui/ReadinessGauge";

const LADDER_ICONS: Record<number, string> = { 1: "⚙️", 2: "⚡", 3: "🚀" };

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectLadderItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/projects");
        if (!res.ok) throw new Error(`Failed to load project ladder (${res.status})`);
        const json = await res.json();
        if (isMounted) setProjects(json.projects);
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono telemetry-grid-bg">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-telemetry-cyan border-t-transparent shadow-telemetry-cyan" />
          <div>
            <h2 className="text-sm font-bold text-white">Loading Capstone Project Ladder</h2>
            <p className="text-xs text-steel-400 font-sans mt-1">Evaluating roadmap prerequisite completion states…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !projects) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono">
        <Card variant="bordered" padding="lg" className="max-w-md text-center">
          <h2 className="text-lg font-bold text-vulnerability-crimson">Ladder Load Error</h2>
          <p className="mt-2 text-xs text-steel-400 font-sans leading-relaxed">{error || "Unable to load project ladder."}</p>
          <Button
            variant="primary"
            className="mt-6 w-full"
            onClick={() => window.location.reload()}
          >
            Retry Loading Projects
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 font-mono pb-24 telemetry-grid-bg">
      {/* Top Header */}
      <header className="border-b border-steel-800 bg-observatory-panel/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 py-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
              Production Capstone Track
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white mt-0.5">
              GenAI Project Ladder
            </h1>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs text-steel-400">
            <span>3 Progressive Capstones</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 pt-8 flex flex-col gap-8">
        {/* Track Overview Banner */}
        <Card variant="glow" padding="lg" className="w-full">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                Verified Portfolio Credential
              </span>
              <h2 className="text-xl font-bold text-white mt-1">
                Real Code Execution, Real Rubric Verification
              </h2>
              <p className="text-xs text-steel-300 font-sans mt-1 max-w-xl">
                Completing these three capstones proves production capability to engineering hiring managers. Every passed submission auto-generates a public case study.
              </p>
            </div>

            <div className="shrink-0 font-mono text-xs">
              <Link
                href="/portfolio"
                className="text-telemetry-cyan hover:underline font-bold"
              >
                View Public Portfolio Page →
              </Link>
            </div>
          </div>
        </Card>

        {/* 3 PROGRESSIVE PROJECT CARDS WITH ESCALATING VISUAL SERIOUSNESS */}
        <div className="flex flex-col gap-6">
          {projects.map((p) => {
            const isPassed = p.best_submission_status === "passed";
            const isInProgress = !isPassed && p.best_submission_status !== null;

            // Escalating visual treatment across tiers:
            // Position 1: Clean Observatory panel
            // Position 2: Bordered Telemetry Cyan accent
            // Position 3: Maximum Glow Capstone Card
            const cardVariant = p.ladder_position === 3 ? "glow" : p.ladder_position === 2 ? "bordered" : "default";

            return (
              <Card
                key={p.id}
                variant={cardVariant}
                padding="lg"
                className={`relative overflow-hidden transition-all duration-300 ${
                  !p.unlocked ? "opacity-75 border-steel-800 bg-observatory-base/50" : ""
                }`}
              >
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  {/* Left Info Column */}
                  <div className="flex items-start gap-4 max-w-2xl">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl border font-bold ${
                        isPassed
                          ? "border-precision-emerald/40 bg-precision-emerald/10 text-precision-emerald"
                          : p.unlocked
                          ? "border-telemetry-cyan/40 bg-telemetry-cyan/10 text-telemetry-cyan"
                          : "border-steel-800 bg-observatory-base text-steel-400"
                      }`}
                    >
                      {LADDER_ICONS[p.ladder_position] || "🔒"}
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                          Capstone Project 0{p.ladder_position}
                        </span>

                        {p.spec.type && (
                          <Badge variant="info" size="sm">
                            {p.spec.type.toUpperCase()}
                          </Badge>
                        )}

                        {isPassed && (
                          <Badge variant="mastery" size="sm">
                            VERIFIED PASSED ✓
                          </Badge>
                        )}

                        {isInProgress && (
                          <Badge variant="gap" size="sm">
                            IN PROGRESS ⚡
                          </Badge>
                        )}

                        {!p.unlocked && (
                          <Badge variant="neutral" size="sm">
                            LOCKED 🔒
                          </Badge>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-white mt-1">{p.name}</h3>
                      <p className="text-xs font-sans text-steel-300 leading-relaxed mt-1">
                        {p.spec.description}
                      </p>
                    </div>
                  </div>

                  {/* Right Action Column */}
                  <div className="shrink-0 flex flex-col items-end gap-3 w-full md:w-auto">
                    {isPassed && (
                      <div className="flex items-center gap-2 mb-1">
                        <ReadinessGauge score={88} variant="badge" />
                      </div>
                    )}

                    {p.unlocked ? (
                      <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                        <Link
                          href={`/workspace/${p.id}`}
                          className="w-full sm:w-auto rounded-xl bg-telemetry-cyan px-5 py-3 font-mono text-xs font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white text-center"
                        >
                          {isPassed ? "Revisit Workspace Code →" : isInProgress ? "Resume Workspace →" : "Launch Workspace →"}
                        </Link>

                        {/* PAYOFF MOMENT: Completed State CTA to Publish Portfolio */}
                        {isPassed && (
                          <Link
                            href="/portfolio"
                            className="w-full sm:w-auto rounded-xl border border-precision-emerald/40 bg-precision-emerald/10 px-4 py-3 font-mono text-xs font-bold text-precision-emerald hover:bg-precision-emerald/20 transition text-center"
                          >
                            Generate Case Study &amp; Publish →
                          </Link>
                        )}
                      </div>
                    ) : (
                      <Button variant="secondary" disabled className="w-full sm:w-auto">
                        🔒 Locked (Roadmap Prerequisite Required)
                      </Button>
                    )}
                  </div>
                </div>

                {/* DETAILED PREREQUISITE UNLOCKING GUIDANCE FOR LOCKED STATE */}
                {!p.unlocked && p.missing_prerequisites.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-steel-800 font-mono text-xs">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-calibrated-amber">
                        Required Roadmap Prerequisite Competencies:
                      </span>
                      <Link href="/roadmap" className="text-telemetry-cyan hover:underline text-[11px]">
                        Go to Roadmap →
                      </Link>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {p.missing_prerequisites.map((node) => (
                        <Link
                          key={node.id}
                          href={`/learn/${encodeURIComponent(node.id)}`}
                          className="rounded-lg border border-steel-800 bg-observatory-base px-3 py-1.5 text-xs text-steel-300 hover:border-telemetry-cyan hover:text-white transition flex items-center gap-1.5"
                        >
                          <span className="text-calibrated-amber font-bold">○</span>
                          <span>{node.name} (Score ≥ 70% Required)</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
