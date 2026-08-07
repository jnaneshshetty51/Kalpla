"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ReadinessGauge } from "@/components/ui/ReadinessGauge";

interface StatData {
  overallScore: number;
  readinessBadge: string;
  streakDays: number;
}

export function AppHeaderStat() {
  const [data, setData] = useState<StatData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function fetchStats() {
      try {
        const res = await fetch("/api/dashboard");
        if (res.ok && active) {
          const json = await res.json();
          if (json.dashboard) {
            setData({
              overallScore: json.dashboard.overallScore || 0,
              readinessBadge: json.dashboard.readinessBadge || "Apprentice",
              streakDays: json.dashboard.streak?.current_streak_days || 0,
            });
          }
        }
      } catch {
        // Fallback silently if offline or unauthenticated
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchStats();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-steel-800 bg-observatory-panel animate-pulse">
        <div className="h-2 w-2 rounded-full bg-steel-700" />
        <div className="h-3 w-12 rounded bg-steel-800" />
      </div>
    );
  }

  const score = data?.overallScore || 0;
  const streak = data?.streakDays || 0;

  return (
    <Link
      href="/dashboard"
      className="group flex items-center gap-2 transition hover:opacity-90"
      title="View full dashboard readiness breakdown"
    >
      <ReadinessGauge score={score} variant="badge" />
      {streak > 0 && (
        <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[11px] font-bold text-calibrated-amber bg-calibrated-amber/10 px-2 py-0.5 rounded-full border border-calibrated-amber/20">
          🔥 {streak}d
        </span>
      )}
    </Link>
  );
}
