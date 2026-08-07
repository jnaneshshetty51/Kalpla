"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ReadinessGauge } from "@/components/ui/ReadinessGauge";

interface ReviewSection {
  score: number;
  summary: string;
}

interface GenAICriterion {
  name: string;
  met: boolean;
  note: string;
}

interface ReflectionFlag {
  contradicts_code: boolean;
  note: string;
}

interface SubmissionReview {
  overall_score: number;
  logic_correctness: ReviewSection;
  readability: ReviewSection;
  optimization_opportunities: ReviewSection;
  edge_case_handling: ReviewSection;
  architecture_quality: ReviewSection | null;
  genai_specific_criteria: GenAICriterion[];
  reflection_flag: ReflectionFlag | null;
  confidence: "high" | "medium" | "low";
  is_ambiguous: boolean;
}

interface SubmissionData {
  id: string;
  code: string;
  reflection: string | null;
  status: string;
  ai_review: SubmissionReview | null;
  metadata: { hints_used?: number; test_results?: unknown[]; re_review_requests?: Array<{ clarification: string; created_at: string }> };
  created_at: string;
}

interface ProjectData {
  id: string;
  name: string;
  spec: { type?: string };
}

/**
 * Headline First, Detail on Demand Section Component
 * Surfaces score & verdict headline instantly, with collapsible detail paragraph.
 */
function ExpandableScoreSection({
  title,
  section,
  defaultOpen = false,
}: {
  title: string;
  section: ReviewSection;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen || section.score < 80);

  const badgeVariant =
    section.score >= 80 ? "mastery" : section.score >= 50 ? "gap" : "vulnerability";

  const statusLabel =
    section.score >= 80 ? "EXCELLENT" : section.score >= 50 ? "SATISFACTORY" : "NEEDS IMPROVEMENT";

  return (
    <Card variant={section.score < 70 ? "bordered" : "default"} className={section.score < 70 ? "border-calibrated-amber/40" : ""}>
      {/* Headline & Score Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="text-xs text-steel-400 hover:text-telemetry-cyan font-mono transition"
          >
            {isOpen ? "▼" : "▶"}
          </button>
          <h3 className="text-sm font-bold text-white font-mono">{title}</h3>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={badgeVariant} size="sm">
            {statusLabel} ({section.score}%)
          </Badge>
        </div>
      </div>

      {/* Expandable Detail Explanation (Headline First, Detail on Demand) */}
      {isOpen && (
        <div className="mt-3 pt-3 border-t border-steel-800 text-xs font-sans text-steel-300 leading-relaxed motion-fade-in">
          <p>{section.summary}</p>
        </div>
      )}
    </Card>
  );
}

export default function ReviewPage({
  params,
}: {
  params: Promise<{ submission: string }>;
}) {
  const resolvedParams = use(params);
  const submissionId = resolvedParams.submission;

  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showClarificationBox, setShowClarificationBox] = useState(false);
  const [clarification, setClarification] = useState("");
  const [isReReviewing, setIsReReviewing] = useState(false);
  const [reReviewsRemaining, setReReviewsRemaining] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}`);
        if (!res.ok) throw new Error(`Failed to load submission (${res.status})`);
        const json = await res.json();
        if (!isMounted) return;
        setSubmission(json.submission);
        setProject(json.project);
        const used = json.submission?.metadata?.re_review_requests?.length || 0;
        setReReviewsRemaining(2 - used);
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
  }, [submissionId]);

  const handleRequestReReview = async () => {
    if (!clarification.trim() || isReReviewing) return;
    setIsReReviewing(true);
    try {
      const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/re-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clarification: clarification.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        setSubmission((prev) => (prev ? { ...prev, ai_review: json.review } : prev));
        setReReviewsRemaining(json.re_reviews_remaining);
        setShowClarificationBox(false);
        setClarification("");
      } else {
        const errJson = await res.json();
        setError(errJson.error || "Re-review request failed.");
      }
    } finally {
      setIsReReviewing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono telemetry-grid-bg">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-telemetry-cyan border-t-transparent shadow-telemetry-cyan" />
          <div>
            <h2 className="text-sm font-bold text-white">Fetching AI Submission Critique</h2>
            <p className="text-xs text-steel-400 font-sans mt-1">Analyzing code rubrics &amp; section scores…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !submission) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono">
        <Card variant="bordered" padding="lg" className="max-w-md text-center">
          <h2 className="text-lg font-bold text-vulnerability-crimson">Review Telemetry Error</h2>
          <p className="mt-2 text-xs text-steel-400 font-sans leading-relaxed">{error}</p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-xl bg-telemetry-cyan px-5 py-2.5 font-mono text-xs font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white"
          >
            ← Return to Dashboard
          </Link>
        </Card>
      </div>
    );
  }

  if (!submission || !submission.ai_review) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono">
        <Card variant="bordered" padding="lg" className="max-w-md text-center">
          <h2 className="text-lg font-bold text-calibrated-amber">Evaluation Pending</h2>
          <p className="mt-2 text-xs text-steel-400 font-sans leading-relaxed">
            This project submission has not been evaluated by server rubrics yet.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-xl bg-telemetry-cyan px-5 py-2.5 font-mono text-xs font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white"
          >
            ← Return to Dashboard
          </Link>
        </Card>
      </div>
    );
  }

  const review = submission.ai_review;
  const isGenAIProject = project?.spec?.type === "rag" || project?.spec?.type === "agent";
  const isHumanReviewFlagged = review.confidence === "low" || review.is_ambiguous;

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 font-mono pb-24 telemetry-grid-bg">
      {/* Top Header */}
      <header className="border-b border-steel-800 bg-observatory-panel/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                Submission Review
              </span>
              <span className="text-steel-400">•</span>
              <span className="text-[10px] text-steel-400 font-mono">{project?.name}</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white mt-0.5">
              Evaluation Status:{" "}
              <span className={submission.status === "passed" ? "text-precision-emerald" : "text-vulnerability-crimson"}>
                {submission.status.toUpperCase()}
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <ReadinessGauge score={review.overall_score} variant="badge" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 flex flex-col gap-8">
        {/* TRANSPARENT FLAGGED-FOR-HUMAN-REVIEW STATE (Framed as positive QA verification) */}
        {isHumanReviewFlagged && (
          <Card variant="bordered" padding="md" className="border-telemetry-cyan/50 bg-telemetry-cyan/5 telemetry-glow-cyan">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-telemetry-cyan/20 text-telemetry-cyan font-bold">
                🔍
              </div>
              <div>
                <Badge variant="info" className="mb-1">
                  Senior Engineer QA Verification Active
                </Badge>
                <h3 className="text-xs font-bold text-white">
                  Extra Human Review in Progress
                </h3>
                <p className="text-xs font-sans text-steel-300 mt-0.5 leading-relaxed">
                  We want to ensure your AI critique &amp; rubric evaluation is 100% accurate. A senior engineer is conducting an additional review pass on your submission.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* DISTINCT MENTORSHIP FEEDBACK CARDS (Headline First, Detail on Demand) */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-steel-800 pb-3">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Categorized AI Mentorship Feedback
            </span>
            <span className="text-xs text-steel-400 font-mono">
              Click ▶ to expand detailed explanations
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ExpandableScoreSection title="Logic & Correctness" section={review.logic_correctness} defaultOpen />
            <ExpandableScoreSection title="Readability & Style" section={review.readability} />
            <ExpandableScoreSection title="Optimization & Performance" section={review.optimization_opportunities} />
            <ExpandableScoreSection title="Edge Case Handling" section={review.edge_case_handling} />
            {review.architecture_quality && (
              <ExpandableScoreSection title="Architecture Quality" section={review.architecture_quality} defaultOpen />
            )}
          </div>
        </section>

        {/* SUBMISSION REFLECTION */}
        {submission.reflection && (
          <Card variant="default" padding="md">
            <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan block mb-2">
              Your Written Reflection
            </span>
            <p className="text-xs font-sans text-steel-300 leading-relaxed whitespace-pre-wrap">
              {submission.reflection}
            </p>
            {review.reflection_flag?.contradicts_code && (
              <div className="mt-3 p-3 rounded-xl bg-calibrated-amber/10 border border-calibrated-amber/40 text-xs text-calibrated-amber flex items-start gap-2 font-mono">
                <span>⚠️ Mismatch Note:</span>
                <span>{review.reflection_flag.note}</span>
              </div>
            )}
          </Card>
        )}

        {/* GENAI SPECIFIC CRITERIA BREAKDOWN */}
        {isGenAIProject && review.genai_specific_criteria.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-steel-800 pb-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                GenAI Architecture Rubric Criteria
              </span>
              <Badge variant="info">
                {project?.spec?.type === "rag" ? "RAG Engine" : "Agent Swarm"}
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {review.genai_specific_criteria.map((criterion, idx) => (
                <Card key={idx} variant="default" padding="sm" className="flex items-start justify-between gap-4 font-mono text-xs">
                  <div className="flex items-start gap-3">
                    <span className={criterion.met ? "text-precision-emerald font-bold text-sm" : "text-calibrated-amber font-bold text-sm"}>
                      {criterion.met ? "✓" : "△"}
                    </span>
                    <div>
                      <span className="font-bold text-white">{criterion.name}</span>
                      <p className="text-xs font-sans text-steel-400 mt-0.5">{criterion.note}</p>
                    </div>
                  </div>
                  <Badge variant={criterion.met ? "mastery" : "gap"} size="sm" dot={false}>
                    {criterion.met ? "MET" : "NEEDS FOCUS"}
                  </Badge>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* CLEAR "REQUEST RE-REVIEW" ACTION CARD */}
        <section className="pt-4 border-t border-steel-800">
          <Card variant="bordered" padding="md" className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white font-mono">
                  Disagree with AI Critique? Request Re-Review
                </h3>
                <p className="text-xs font-sans text-steel-400 mt-0.5">
                  Submit a technical clarification explaining your architectural rationale for re-evaluation.
                </p>
              </div>
              <span className="text-xs font-mono text-steel-400 font-tabular">
                {reReviewsRemaining !== null ? `${reReviewsRemaining} re-review(s) remaining` : ""}
              </span>
            </div>

            {!showClarificationBox ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowClarificationBox(true)}
                disabled={reReviewsRemaining !== null && reReviewsRemaining <= 0}
                className="w-fit"
              >
                Request AI Re-Review ↺
              </Button>
            ) : (
              <div className="flex flex-col gap-3 font-mono">
                <textarea
                  rows={3}
                  value={clarification}
                  onChange={(e) => setClarification(e.target.value)}
                  placeholder="Explain why this test case or architectural pattern is valid in your implementation..."
                  className="w-full rounded-xl border border-steel-800 bg-observatory-base p-3 font-mono text-xs text-white placeholder-steel-400 focus:border-telemetry-cyan focus:outline-none"
                />
                <div className="flex items-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleRequestReReview}
                    disabled={isReReviewing || !clarification.trim()}
                    loading={isReReviewing}
                  >
                    {isReReviewing ? "Re-evaluating…" : "Submit Technical Clarification →"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowClarificationBox(false)}
                  >
                    Cancel
                  </Button>
                </div>
                {error && <p className="text-xs text-vulnerability-crimson font-mono">{error}</p>}
              </div>
            )}
          </Card>
        </section>

        <div className="pt-2">
          <Link href="/dashboard" className="text-xs font-mono text-telemetry-cyan hover:underline">
            ← Return to Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
