"use client";

import React, { useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import type DailyIframe from "@daily-co/daily-js";

type DailyCallObject = ReturnType<typeof DailyIframe.createFrame>;

interface RoomPageProps {
  params: Promise<{ id: string }>;
}

export default function LiveSessionRoomPage({ params }: RoomPageProps) {
  const { id } = use(params);
  const containerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCallObject | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function joinRoom() {
      try {
        const res = await fetch(`/api/live-sessions/${id}/join`, { method: "POST" });
        const json = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setErrorMessage(json.error || "Couldn't join this session.");
          setStatus("error");
          return;
        }

        const { createFrame } = (await import("@daily-co/daily-js")).default;
        if (!containerRef.current || cancelled) return;

        const call = createFrame(containerRef.current, {
          showLeaveButton: true,
          iframeStyle: { width: "100%", height: "100%", border: "0" },
        });
        callRef.current = call;
        await call.join({ url: json.roomUrl, token: json.token });
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          console.error("Error joining live session room:", err);
          setErrorMessage("Something went wrong connecting to this session.");
          setStatus("error");
        }
      }
    }

    joinRoom();

    return () => {
      cancelled = true;
      // Destroy on unmount — otherwise the iframe keeps mic/camera hardware
      // active after navigating away.
      callRef.current?.destroy();
      callRef.current = null;
    };
  }, [id]);

  if (status === "error") {
    return (
      <div className="min-h-screen bg-observatory-base flex items-center justify-center px-4">
        <EmptyState
          icon="⚠"
          badgeText="Can't Join"
          title="Couldn't join this session"
          description={errorMessage || "This session may not have started yet, may have ended, or you may not have access to it."}
          action={{ label: "← Back to Live Sessions", href: "/live-sessions" }}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-observatory-base flex flex-col">
      {status === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
          <div className="h-10 w-10 animate-spin motion-reduce:animate-none rounded-full border-4 border-telemetry-cyan border-t-transparent" />
          <p className="font-mono text-xs text-steel-400">Connecting to your session…</p>
        </div>
      )}
      <div ref={containerRef} className={`flex-1 ${status === "loading" ? "hidden" : ""}`} />
      <Link
        href="/live-sessions"
        className="absolute top-3 left-3 z-10 rounded-lg border border-steel-700 bg-observatory-panel/90 px-3 py-1.5 font-mono text-[11px] font-semibold text-steel-200 hover:bg-steel-800 transition backdrop-blur"
      >
        ← Leave
      </Link>
    </div>
  );
}
