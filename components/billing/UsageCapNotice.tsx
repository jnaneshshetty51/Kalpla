"use client";

import React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export interface UsageCapExceededDetails {
  error: "usage_cap_exceeded";
  feature: string;
  resetDate: string;
  limit: number;
  currentUsage: number;
}

export interface UsageWarningDetails {
  feature: string;
  currentUsage: number;
  limit: number;
  percentUsed: number;
}

const FEATURE_LABELS: Record<string, string> = {
  tutor_chat: "AI tutor messages",
  assessment_grading: "assessment gradings",
  workspace_hint: "workspace hints",
  roadmap_generation: "roadmap generations",
};

function featureLabel(feature: string): string {
  const category = feature.toLowerCase().includes("tutor")
    ? "tutor_chat"
    : feature.toLowerCase().includes("assessment")
      ? "assessment_grading"
      : feature.toLowerCase().includes("hint")
        ? "workspace_hint"
        : feature.toLowerCase().includes("roadmap")
          ? "roadmap_generation"
          : feature;
  return FEATURE_LABELS[category] || "AI feature capacity";
}

/**
 * Reusable consistent usage-cap-exceeded notice used across all LLM features (Prompt 84 & Prompt 12).
 */
export function UsageCapExceededNotice({ details }: { details: UsageCapExceededDetails }) {
  const resetDate = new Date(details.resetDate);
  const resetLabel = resetDate.toLocaleDateString(undefined, { month: "long", day: "numeric" });

  return (
    <Card variant="bordered" padding="md" className="border-calibrated-amber/40 bg-observatory-panel/90 text-center flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        <Badge variant="gap">
          Monthly Limit Reached
        </Badge>
      </div>

      <div>
        <h4 className="text-sm font-bold text-white font-mono">
          Monthly Capacity Cap Reached
        </h4>
        <p className="text-xs font-sans text-steel-300 mt-1 leading-relaxed">
          You have used {details.currentUsage} of {details.limit} {featureLabel(details.feature)} for this billing cycle. Resets on {resetLabel}.
        </p>
      </div>

      <Link
        href="/billing"
        className="rounded-xl bg-telemetry-cyan px-5 py-2.5 font-mono text-xs font-bold text-observatory-base shadow-telemetry-cyan hover:bg-white transition text-center"
      >
        Upgrade Plan Capacity →
      </Link>
    </Card>
  );
}

/**
 * Reusable soft warning banner (>= 80% usage threshold).
 */
export function UsageWarningBanner({ warning }: { warning: UsageWarningDetails }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-calibrated-amber/40 bg-calibrated-amber/10 px-3.5 py-2.5 font-mono text-xs text-calibrated-amber">
      <span>
        Capacity alert: {warning.currentUsage} of {warning.limit} {featureLabel(warning.feature)} used ({warning.percentUsed}%).
      </span>
      <Link href="/billing" className="shrink-0 font-bold text-telemetry-cyan hover:underline">
        Upgrade →
      </Link>
    </div>
  );
}

/** Parses a fetch Response's usage-warning headers */
export function parseUsageWarningHeaders(response: Response): UsageWarningDetails | null {
  if (response.headers.get("X-Usage-Warning") !== "true") return null;
  return {
    feature: "tutor_chat",
    currentUsage: Number(response.headers.get("X-Usage-Current") || 0),
    limit: Number(response.headers.get("X-Usage-Limit") || 0),
    percentUsed: Number(response.headers.get("X-Usage-Percent") || 0),
  };
}
