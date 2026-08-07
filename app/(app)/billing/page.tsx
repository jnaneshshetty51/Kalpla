"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface UsageMeter {
  category: string;
  used: number;
  limit: number | null;
  percentUsed: number;
}

interface BillingStatus {
  tier: string;
  status: string;
  meters: UsageMeter[];
  stripe_configured: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  tutor: "AI Tutor Messages",
  assessment: "Assessment Gradings",
  roadmap: "Roadmap Generations",
  mock_interview: "Mock Interviews",
  default: "Other AI Features",
};

const TIER_LABELS: Record<string, string> = {
  free: "Free Diagnostic",
  pro: "Pro Engineer",
  premium: "Enterprise Tier",
};

function meterColorClass(percentUsed: number): string {
  if (percentUsed >= 100) return "bg-vulnerability-crimson";
  if (percentUsed >= 80) return "bg-calibrated-amber shadow-telemetry-amber";
  return "bg-precision-emerald shadow-telemetry-emerald";
}

export default function BillingPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const res = await fetch("/api/billing/status");
        if (!res.ok) throw new Error(`Failed to load billing status (${res.status})`);
        const json = await res.json();
        if (isMounted) setStatus(json);
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

  const handleUpgrade = async (tier: "pro" | "premium") => {
    setIsRedirecting(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const json = await res.json();
      if (res.ok && json.url) {
        window.location.href = json.url;
      } else {
        setError(json.error || "Failed to start checkout session.");
        setIsRedirecting(null);
      }
    } catch {
      setError("Failed to start checkout session.");
      setIsRedirecting(null);
    }
  };

  const handleManageBilling = async () => {
    setIsRedirecting("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json();
      if (res.ok && json.url) {
        window.location.href = json.url;
      } else {
        setError(json.error || "Failed to open billing portal.");
        setIsRedirecting(null);
      }
    } catch {
      setError("Failed to open billing portal.");
      setIsRedirecting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono telemetry-grid-bg">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-telemetry-cyan border-t-transparent shadow-telemetry-cyan" />
          <div>
            <h2 className="text-sm font-bold text-white">Loading Billing &amp; Usage Telemetry</h2>
            <p className="text-xs text-steel-400 font-sans mt-1">Checking tier limits &amp; capacity meters…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono">
        <Card variant="bordered" padding="lg" className="max-w-md text-center">
          <h2 className="text-lg font-bold text-vulnerability-crimson">Billing Telemetry Error</h2>
          <p className="mt-2 text-xs text-steel-400 font-sans leading-relaxed">{error || "Unable to load billing status."}</p>
          <Button variant="primary" className="mt-6 w-full" onClick={() => window.location.reload()}>
            Retry Loading
          </Button>
        </Card>
      </div>
    );
  }

  const highestUsagePercent = Math.max(0, ...status.meters.filter((m) => m.limit !== null).map((m) => m.percentUsed));
  const isNearCap = highestUsagePercent >= 80;

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 font-mono pb-24 telemetry-grid-bg">
      {/* Top Header */}
      <header className="border-b border-steel-800 bg-observatory-panel/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 py-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
              Account Management
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white mt-0.5">
              Billing &amp; Capacity Telemetry
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-xs font-mono text-steel-400 hover:text-telemetry-cyan transition underline">
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 pt-8 flex flex-col gap-8">
        {error && (
          <div className="rounded-xl border border-vulnerability-crimson/40 bg-vulnerability-crimson/10 p-3 text-xs text-rose-300 font-mono">
            <span className="font-bold">Billing Error: </span>
            {error}
          </div>
        )}

        {/* Current Plan Overview Header Card */}
        <Card variant="glow" padding="lg" className="w-full">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                Active Subscription Tier
              </span>
              <h2 className="text-2xl font-bold text-white mt-1">
                {TIER_LABELS[status.tier] || status.tier}
              </h2>
              <span className="text-xs text-steel-400 capitalize font-sans">
                Status: {status.status}
              </span>
            </div>

            {status.tier !== "free" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleManageBilling}
                loading={isRedirecting === "portal"}
                disabled={isRedirecting !== null}
              >
                {isRedirecting === "portal" ? "Opening Portal…" : "Manage Billing Portal →"}
              </Button>
            )}
          </div>
        </Card>

        {/* USAGE METERS SECTION (Visual Honesty: tracks 80% soft warning & 100% hard limit) */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-steel-800 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                Usage Telemetry
              </span>
              <h2 className="text-lg font-bold text-white mt-0.5">
                Current Billing Period Consumption
              </h2>
            </div>
            <span className="text-xs text-steel-400 font-mono">
              Resets Monthly
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {status.meters
              .filter((m) => m.limit !== null || m.used > 0)
              .map((meter) => (
                <Card key={meter.category} variant="default" padding="md">
                  <div className="flex items-center justify-between text-xs font-mono mb-2">
                    <span className="font-bold text-white">
                      {CATEGORY_LABELS[meter.category] || meter.category}
                    </span>
                    <span className="text-steel-400 font-tabular">
                      {meter.limit === null
                        ? `${meter.used} used (unlimited)`
                        : `${meter.used} / ${meter.limit} used (${meter.percentUsed}%)`}
                    </span>
                  </div>

                  {meter.limit !== null && (
                    <div className="h-2 w-full rounded-full bg-observatory-base border border-steel-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${meterColorClass(meter.percentUsed)}`}
                        style={{ width: `${Math.min(meter.percentUsed, 100)}%` }}
                      />
                    </div>
                  )}

                  {meter.percentUsed >= 80 && meter.limit !== null && (
                    <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono">
                      <span className={meter.percentUsed >= 100 ? "text-vulnerability-crimson font-bold" : "text-calibrated-amber font-bold"}>
                        {meter.percentUsed >= 100
                          ? "⚠ Monthly limit reached — upgrade to unlock additional capacity."
                          : "⚡ Approaching monthly capacity limit (80% used)."}
                      </span>
                      <Badge variant={meter.percentUsed >= 100 ? "vulnerability" : "gap"} size="sm">
                        {meter.percentUsed >= 100 ? "CAP REACHED" : "APPROACHING CAP"}
                      </Badge>
                    </div>
                  )}
                </Card>
              ))}
          </div>
        </section>

        {/* PROMINENT NON-ALARMIST UPGRADE NUDGE */}
        {status.tier !== "premium" && (
          <Card
            variant={isNearCap ? "glow" : "bordered"}
            padding="lg"
            className={isNearCap ? "border-calibrated-amber/40 bg-observatory-panel/90" : ""}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="max-w-xl">
                <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                  {isNearCap ? "Capacity Upgrade Nudge" : "Upgrade Plan"}
                </span>
                <h2 className="text-xl font-bold text-white mt-1">
                  {isNearCap ? "Keep Your Learning Momentum Uninterrupted" : "Unlock Higher Capacity & Priority AI Server Grading"}
                </h2>
                <p className="text-xs font-sans text-steel-300 mt-1 leading-relaxed">
                  {isNearCap
                    ? "Upgrade to Pro for 1,000 monthly AI tutor messages, priority code execution grading, and unlimited roadmap regenerations."
                    : "Upgrade to Pro or Premium to expand your monthly capacity limits and support intensive daily learning."}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto shrink-0">
                {status.tier === "free" && (
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => handleUpgrade("pro")}
                    loading={isRedirecting === "pro"}
                    disabled={isRedirecting !== null}
                  >
                    {isRedirecting === "pro" ? "Redirecting…" : "Upgrade to Pro →"}
                  </Button>
                )}

                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => handleUpgrade("premium")}
                  loading={isRedirecting === "premium"}
                  disabled={isRedirecting !== null}
                >
                  {isRedirecting === "premium" ? "Redirecting…" : "Upgrade to Premium →"}
                </Button>
              </div>
            </div>

            {!status.stripe_configured && (
              <p className="mt-4 pt-3 border-t border-steel-800 text-[10px] font-mono text-steel-400">
                Note: Stripe checkout is running in development mode.
              </p>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
