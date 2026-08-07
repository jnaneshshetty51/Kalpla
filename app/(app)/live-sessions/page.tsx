"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SessionsSkeleton } from "@/components/ui/Skeleton";
import { LiveSessionType } from "@/types/liveSession";

interface SessionItem {
  id: string;
  title: string;
  description: string | null;
  session_type: LiveSessionType;
  starts_at: string;
  duration_minutes: number;
}

const SESSION_TYPE_META: Record<LiveSessionType, { label: string; variant: "info" | "mastery" | "gap" | "neutral" }> = {
  live_class: { label: "Live Class", variant: "info" },
  architecture_session: { label: "Architecture Session", variant: "mastery" },
  office_hours: { label: "Office Hours", variant: "neutral" },
  mock_interview: { label: "Mock Interview", variant: "gap" },
};

const JOIN_WINDOW_BEFORE_MS = 10 * 60 * 1000;

function getJoinability(session: SessionItem, now: number): { canJoin: boolean; label: string } {
  const startsAtMs = new Date(session.starts_at).getTime();
  const endsAtMs = startsAtMs + session.duration_minutes * 60 * 1000;
  if (now < startsAtMs - JOIN_WINDOW_BEFORE_MS) return { canJoin: false, label: "Not yet open" };
  if (now > endsAtMs) return { canJoin: false, label: "Ended" };
  return { canJoin: true, label: "Join →" };
}

function SessionRow({ session, now }: { session: SessionItem; now: number }) {
  const meta = SESSION_TYPE_META[session.session_type];
  const { canJoin, label } = getJoinability(session, now);

  return (
    <Card padding="sm" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant={meta.variant} size="sm" dot={false}>{meta.label}</Badge>
          <span className="font-mono text-[11px] text-steel-400">
            {new Date(session.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </span>
        </div>
        <h3 className="font-mono text-sm font-bold text-white mt-1.5">{session.title}</h3>
        {session.description && (
          <p className="text-xs text-steel-400 font-sans mt-1 leading-relaxed">{session.description}</p>
        )}
      </div>

      {canJoin ? (
        <Link
          href={`/live-sessions/${session.id}/room`}
          className="shrink-0 rounded-xl bg-telemetry-cyan px-4 py-2.5 text-center font-mono text-xs font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white"
        >
          {label}
        </Link>
      ) : (
        <Button size="sm" variant="secondary" disabled className="shrink-0">
          {label}
        </Button>
      )}
    </Card>
  );
}

export default function LiveSessionsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const res = await fetch("/api/live-sessions");
        const json = await res.json();
        if (!isMounted) return;
        if (res.ok) {
          setSessions(json.sessions || []);
        } else {
          setError(json.error || "Failed to load sessions");
        }
      } catch (e) {
        if (isMounted) setError(String(e));
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    // Re-check join windows every minute so the "Join" button enables
    // itself without requiring a manual refresh.
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) return <SessionsSkeleton />;

  if (error) {
    return (
      <div className="min-h-screen bg-observatory-base flex items-center justify-center px-4">
        <EmptyState icon="⚠" badgeText="Load Error" title="Couldn't load your sessions" description={error} />
      </div>
    );
  }

  const upcoming = sessions
    .filter((s) => new Date(s.starts_at).getTime() >= now - 60 * 60 * 1000) // keep sessions up to 1h into their window in "upcoming" so they don't vanish mid-session
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const past = sessions
    .filter((s) => !upcoming.includes(s))
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());

  return (
    <div className="min-h-screen bg-observatory-base text-steel-100 telemetry-grid-bg">
      <header className="border-b border-steel-800 px-4 sm:px-6 py-6">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-telemetry-cyan">Live Sessions</span>
        <h1 className="text-xl font-mono font-bold text-white mt-1">Weekly classes, office hours & mock interviews</h1>
      </header>

      <main className="px-4 sm:px-6 py-8 max-w-3xl mx-auto flex flex-col gap-10">
        <section>
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-steel-400 mb-3">Upcoming</h2>
          {upcoming.length === 0 ? (
            <EmptyState icon="🎥" badgeText="Nothing Scheduled" title="No upcoming sessions yet" description="Live classes, office hours, and mock interviews will show up here once scheduled." />
          ) : (
            <div className="flex flex-col gap-3">
              {upcoming.map((s) => (
                <SessionRow key={s.id} session={s} now={now} />
              ))}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section>
            <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-steel-400 mb-3">Past</h2>
            <div className="flex flex-col gap-3 opacity-70">
              {past.map((s) => (
                <SessionRow key={s.id} session={s} now={now} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
