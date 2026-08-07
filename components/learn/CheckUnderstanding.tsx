"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export interface CheckUnderstandingProps {
  skillNodeId: string;
  questions?: string[];
  onComplete?: () => void;
}

export function CheckUnderstanding({
  skillNodeId,
  questions = [
    "How does this concept impact production LLM latency and context window optimization?",
    "What fallback strategies would you implement if an unexpected runtime failure occurs?",
  ],
  onComplete,
}: CheckUnderstandingProps) {
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [answer, setAnswer] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<{
    score: number;
    feedback: { summary?: string; criteriaBreakdown?: Array<{ criterion: string; met: boolean }> };
    passed: boolean;
  } | null>(null);

  const activeQuestion = questions[currentIdx] || questions[0];

  const handleSubmit = async () => {
    if (!answer.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const response = await fetch("/api/learn/check-understanding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill_node_id: skillNodeId,
          question: activeQuestion,
          response: answer.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Grading request failed (${response.status})`);
      }

      const json = await response.json();
      if (json.grading) {
        setResult(json.grading);
        if (json.grading.passed && onComplete) {
          onComplete();
        }
      }
    } catch (err) {
      console.error("Check understanding error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card variant="glow" padding="lg" className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-steel-800 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-telemetry-cyan/20 text-telemetry-cyan font-bold border border-telemetry-cyan/30 text-xs">
            🎯
          </span>
          <div>
            <h4 className="text-sm font-bold text-white font-mono">
              Check Your Understanding
            </h4>
            <p className="text-[11px] text-steel-400 font-sans">
              Inline comprehension evaluation (Pass ≥ 70%)
            </p>
          </div>
        </div>

        {questions.length > 1 && (
          <div className="flex gap-1.5 font-mono">
            {questions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setCurrentIdx(idx);
                  setResult(null);
                }}
                className={`h-6 w-6 rounded-lg text-[10px] font-bold transition ${
                  currentIdx === idx
                    ? "bg-telemetry-cyan text-observatory-base"
                    : "bg-observatory-base text-steel-400 border border-steel-800 hover:text-white"
                }`}
              >
                Q{idx + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Question Prompt */}
      <div className="mt-2 font-mono">
        <span className="text-[10px] font-bold uppercase tracking-wider text-telemetry-cyan">
          Question 0{currentIdx + 1}
        </span>
        <p className="mt-1 text-xs sm:text-sm font-sans text-steel-200 leading-relaxed">
          {activeQuestion}
        </p>
      </div>

      {/* Input Area */}
      <div className="mt-4 flex flex-col gap-3">
        <textarea
          rows={3}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Explain your technical reasoning concisely in 2–3 sentences..."
          className="w-full rounded-xl border border-steel-800 bg-observatory-base p-3.5 font-mono text-xs text-white placeholder-steel-400 focus:border-telemetry-cyan focus:outline-none"
        />

        <div className="flex items-center justify-between font-mono">
          <span className="text-[11px] text-steel-400">
            Automated Rubric Evaluation
          </span>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || !answer.trim()}
            loading={isSubmitting}
          >
            {isSubmitting ? "Evaluating…" : "Check Understanding →"}
          </Button>
        </div>
      </div>

      {/* Grading Result Feedback Card */}
      {result && (
        <div
          className={`mt-5 rounded-xl border p-4 font-mono transition ${
            result.passed
              ? "border-precision-emerald/40 bg-precision-emerald/10"
              : "border-calibrated-amber/40 bg-calibrated-amber/10"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant={result.passed ? "mastery" : "gap"}>
                {result.passed ? "COMPREHENSION DEMONSTRATED ✓" : "NEEDS REFINEMENT !"}
              </Badge>
            </div>

            <span className="text-xs font-bold font-tabular text-white">
              Score: {result.score}%
            </span>
          </div>

          <p className="mt-3 text-xs font-sans leading-relaxed text-steel-200">
            {result.feedback?.summary ||
              (result.passed
                ? "Great explanation! You have demonstrated core technical understanding."
                : "Good effort. Review the module breakdown above and try again.")}
          </p>

          {result.passed && (
            <div className="mt-4 flex items-center justify-between border-t border-precision-emerald/30 pt-3 text-xs">
              <span className="text-precision-emerald font-bold">
                ✓ Module Marked Complete &amp; Downstream Unlocked
              </span>
              <Link
                href="/roadmap"
                className="font-mono text-xs font-bold text-telemetry-cyan hover:underline"
              >
                View Roadmap →
              </Link>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
