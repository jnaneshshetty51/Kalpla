"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

interface QueueEntry {
  id: string;
  user_id: string;
  ai_score: number;
  ai_feedback: { summary?: string; criteriaBreakdown?: Array<{ criterion: string; met: boolean }> };
  confidence: number;
  created_at: string;
  response: { answer?: string };
  tasks: { prompt?: string; type?: string; skill_node_id?: string } | null;
}

export default function GradingReviewPage() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overrideScore, setOverrideScore] = useState<string>("");
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const res = await fetch("/api/admin/grading-review");
      if (!cancelled && res.ok) {
        const data = await res.json();
        setQueue(data.queue || []);
        if (data.queue?.length > 0) {
          setActiveId(data.queue[0].id); // Auto-open first entry for fast workflow
        }
      }
      if (!cancelled) setLoading(false);
    }
    run();
    return () => { cancelled = true; };
  }, []);

  const handleAction = async (entryId: string, action: "approve" | "override") => {
    setProcessing(entryId);
    try {
      const body: Record<string, unknown> = { entryId, action };
      if (action === "override") body.overrideScore = parseFloat(overrideScore);

      const res = await fetch("/api/admin/grading-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setQueue((prev) => {
          const nextQueue = prev.filter((e) => e.id !== entryId);
          if (nextQueue.length > 0 && activeId === entryId) {
            setActiveId(nextQueue[0].id);
          } else if (nextQueue.length === 0) {
            setActiveId(null);
          }
          return nextQueue;
        });
        setOverrideScore("");
      }
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 font-mono pb-20">
      <header className="border-b border-steel-800 bg-observatory-panel/90 px-6 sm:px-8 py-5 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
              Admin QA Workflow
            </span>
            <h1 className="text-xl font-bold text-white mt-0.5">Grading Review &amp; Override Queue</h1>
            <p className="text-xs text-steel-400 font-sans mt-0.5">
              {queue.length} pending submission{queue.length === 1 ? "" : "s"} requiring manual rubric validation or score adjustment
            </p>
          </div>

          <Badge variant={queue.length > 0 ? "gap" : "mastery"}>
            {queue.length > 0 ? `${queue.length} IN QUEUE` : "QUEUE CLEAR ✓"}
          </Badge>
        </div>
      </header>

      <main className="p-6 sm:p-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-telemetry-cyan border-t-transparent shadow-telemetry-cyan" />
          </div>
        ) : queue.length === 0 ? (
          <EmptyState
            icon="✅"
            badgeText="Queue Completely Processed"
            title="Grading Review Queue is Clear"
            description="All low-confidence and ambiguous submission reviews have been processed and validated. New flagged submissions will automatically appear here."
            action={{
              label: "Return to Admin Home",
              href: "/admin/ai-cost",
            }}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {queue.map((entry) => {
              const isOpen = activeId === entry.id;
              const isProcessing = processing === entry.id;
              const task = Array.isArray(entry.tasks) ? entry.tasks[0] : entry.tasks;

              return (
                <Card
                  key={entry.id}
                  variant={isOpen ? "bordered" : "default"}
                  padding="none"
                  className={`overflow-hidden transition ${isOpen ? "border-telemetry-cyan/50 bg-observatory-panel" : "border-steel-800 bg-observatory-base"}`}
                >
                  {/* High-density summary header row */}
                  <button
                    type="button"
                    onClick={() => setActiveId(isOpen ? null : entry.id)}
                    className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 border-b border-steel-800/80 hover:bg-telemetry-cyan/5 transition"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <Badge variant={entry.ai_score >= 70 ? "mastery" : "vulnerability"} size="sm">
                        AI SCORE: {entry.ai_score}%
                      </Badge>
                      <span className="text-xs font-bold text-white truncate min-w-0">
                        {task?.prompt
                          ? task.prompt.substring(0, 75) + (task.prompt.length > 75 ? "…" : "")
                          : "Assessment Submission"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-xs text-steel-400">
                      <span className="font-tabular text-[11px]">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </span>
                      <span>{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {/* Expanded side-by-side review workflow */}
                  {isOpen && (
                    <div className="p-5 flex flex-col gap-5 border-t border-steel-800/50">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Left Panel: Student Code / Answer Submission */}
                        <div className="rounded-xl border border-steel-800 bg-observatory-base p-4 font-mono text-xs">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan block mb-2">
                            Student Answer / Code Response
                          </span>
                          <pre className="whitespace-pre-wrap text-steel-200 leading-relaxed font-mono max-h-64 overflow-y-auto p-2 bg-black/40 rounded border border-steel-800/50">
                            {entry.response?.answer || "No response content available."}
                          </pre>
                        </div>

                        {/* Right Panel: AI Score & Criteria Reasoning */}
                        <div className="rounded-xl border border-steel-800 bg-observatory-base p-4 font-mono text-xs flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between border-b border-steel-800 pb-2 mb-2">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-steel-400">
                                AI Evaluator Reasoning
                              </span>
                              <span className="text-xs font-extrabold text-telemetry-cyan font-tabular">
                                Score: {entry.ai_score}%
                              </span>
                            </div>
                            <p className="text-xs font-sans text-steel-300 leading-relaxed mb-3">
                              {entry.ai_feedback?.summary || "No automated summary provided."}
                            </p>

                            {entry.ai_feedback?.criteriaBreakdown && (
                              <div className="flex flex-col gap-1.5 pt-2 border-t border-steel-800/60">
                                {entry.ai_feedback.criteriaBreakdown.map((criterion, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-[11px]">
                                    <span className="text-steel-400 truncate max-w-[75%]">{criterion.criterion}</span>
                                    <Badge variant={criterion.met ? "mastery" : "vulnerability"} size="sm" dot={false}>
                                      {criterion.met ? "MET ✓" : "UNMET ✗"}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Immediate Approve / Override Control Bar (One-click admin processing) */}
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-steel-800">
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleAction(entry.id, "approve")}
                            loading={isProcessing}
                            disabled={isProcessing}
                          >
                            ✓ Approve AI Score ({entry.ai_score}%)
                          </Button>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={overrideScore}
                            onChange={(e) => setOverrideScore(e.target.value)}
                            placeholder="Score %"
                            className="w-28 rounded-xl border border-steel-800 bg-observatory-base px-3 py-2 text-xs text-white focus:border-telemetry-cyan focus:outline-none font-tabular"
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleAction(entry.id, "override")}
                            disabled={isProcessing || !overrideScore}
                            loading={isProcessing}
                          >
                            Override Score &amp; Save
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
