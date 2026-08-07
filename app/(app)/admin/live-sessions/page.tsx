"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LiveSessionType } from "@/types/liveSession";

interface AdminSessionItem {
  id: string;
  title: string;
  description: string | null;
  session_type: LiveSessionType;
  starts_at: string;
  duration_minutes: number;
  assigned_user_id: string | null;
  assigned_user: { name: string | null } | null;
  cancelled_at: string | null;
}

interface UserSearchResult {
  id: string;
  email: string;
  full_name: string | null;
}

const SESSION_TYPE_LABELS: Record<LiveSessionType, string> = {
  live_class: "Live Class",
  architecture_session: "Architecture Session",
  office_hours: "Office Hours",
  mock_interview: "Mock Interview (1:1)",
};

const textareaStyles =
  "w-full rounded-xl border border-steel-800 bg-observatory-base p-4 text-xs text-steel-200 transition duration-200 focus:border-telemetry-cyan focus:outline-none focus:ring-1 focus:ring-telemetry-cyan leading-relaxed";

/** "YYYY-MM-DDTHH:mm" in the browser's local time, for pre-filling a datetime-local input from a stored UTC ISO string. */
function toDatetimeLocalValue(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local values are timezone-naive by spec — new Date(value) parses them as browser-local time, exactly what we want here. */
function datetimeLocalToUtcIso(value: string): string {
  return new Date(value).toISOString();
}

export default function AdminLiveSessionsPage() {
  const [sessions, setSessions] = useState<AdminSessionItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sessionType, setSessionType] = useState<LiveSessionType>("live_class");
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [assignedUserId, setAssignedUserId] = useState<string | null>(null);
  const [assignedUserLabel, setAssignedUserLabel] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<UserSearchResult[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setSelectedId(null);
    setTitle("");
    setDescription("");
    setSessionType("live_class");
    setStartsAtLocal("");
    setDurationMinutes(60);
    setAssignedUserId(null);
    setAssignedUserLabel("");
    setStudentQuery("");
    setStudentResults([]);
    setSaveStatus(null);
    setSaveError(null);
  }, []);

  const populateForm = useCallback((s: AdminSessionItem) => {
    setSelectedId(s.id);
    setTitle(s.title);
    setDescription(s.description || "");
    setSessionType(s.session_type);
    setStartsAtLocal(toDatetimeLocalValue(s.starts_at));
    setDurationMinutes(s.duration_minutes);
    setAssignedUserId(s.assigned_user_id);
    setAssignedUserLabel(s.assigned_user?.name || "");
    setSaveStatus(null);
    setSaveError(null);
  }, []);

  // Reusable loader for reloading after a save/cancel (not effect-driven,
  // so no unmount guard needed here).
  async function loadSessions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/live-sessions");
      const json = await res.json();
      if (res.ok) {
        setSessions(json.sessions || []);
      } else {
        setError(json.error || "Failed to load sessions");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Initial load — nested function + isMounted guard, matching
  // admin/content/page.tsx's loadNodes pattern exactly, so state is never
  // set after this component has unmounted mid-fetch.
  useEffect(() => {
    let isMounted = true;

    async function initialLoad() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/live-sessions");
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

    initialLoad();
    return () => {
      isMounted = false;
    };
  }, []);

  // Debounced student search for the mock_interview assignee picker. All
  // setState calls happen inside the timeout callback, not synchronously
  // in the effect body itself.
  useEffect(() => {
    const handle = setTimeout(async () => {
      if (sessionType !== "mock_interview" || !studentQuery.trim()) {
        setStudentResults([]);
        return;
      }
      try {
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(studentQuery)}`);
        const json = await res.json();
        setStudentResults((json.users || []).map((u: { id: string; email: string; full_name: string | null }) => u));
      } catch {
        setStudentResults([]);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [studentQuery, sessionType]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveStatus(null);
    setSaveError(null);

    if (!startsAtLocal) {
      setSaveError("Pick a start date/time.");
      setIsSaving(false);
      return;
    }
    if (sessionType === "mock_interview" && !assignedUserId) {
      setSaveError("Mock interviews need an assigned student.");
      setIsSaving(false);
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      session_type: sessionType,
      starts_at: datetimeLocalToUtcIso(startsAtLocal),
      duration_minutes: durationMinutes,
      assigned_user_id: sessionType === "mock_interview" ? assignedUserId : undefined,
    };

    try {
      const res = await fetch(
        selectedId ? `/api/admin/live-sessions/${selectedId}` : "/api/admin/live-sessions",
        {
          method: selectedId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (res.ok && json.session) {
        setSaveStatus(selectedId ? "Session updated" : "Session created — video room ready");
        await loadSessions();
        setSelectedId(json.session.id);
      } else {
        setSaveError(json.error || "Save failed");
      }
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelSession = async () => {
    if (!selectedId || isSaving) return;
    if (!confirm("Cancel this session? Students will no longer see it, but attendance history is preserved.")) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/live-sessions/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelled_at: new Date().toISOString() }),
      });
      const json = await res.json();
      if (res.ok) {
        setSaveStatus("Session cancelled");
        await loadSessions();
      } else {
        setSaveError(json.error || "Cancel failed");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const activeSessions = sessions.filter((s) => !s.cancelled_at);

  return (
    <div className="min-h-screen bg-observatory-base text-steel-100">
      <header className="border-b border-steel-800 px-4 sm:px-8 py-5 bg-observatory-base/90 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-calibrated-amber">Admin</span>
            <h1 className="text-xl font-bold text-white mt-0.5">Live Sessions</h1>
          </div>
          <Link href="/dashboard" className="text-xs text-steel-400 hover:text-steel-300 transition rounded px-1">
            ← Back to app
          </Link>
        </div>
      </header>

      <main className="p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100vh-140px)]">
          {/* Sidebar list */}
          <div className="flex flex-col rounded-3xl border border-steel-800 bg-observatory-panel/60 p-5 lg:overflow-hidden">
            <Button size="sm" variant="secondary" onClick={resetForm} className="mb-3">
              + New Session
            </Button>

            {loading ? (
              <div role="status" aria-live="polite" className="text-xs text-steel-400 py-6 text-center">
                Loading sessions…
              </div>
            ) : error ? (
              <div role="alert" className="text-xs text-vulnerability-crimson py-6 text-center">
                {error}
              </div>
            ) : activeSessions.length === 0 ? (
              <div className="text-xs text-steel-400 py-6 text-center">No sessions scheduled yet.</div>
            ) : (
              <div className="flex flex-col gap-1.5 pr-1 max-h-80 lg:max-h-none lg:flex-1 lg:overflow-y-auto" role="listbox" aria-label="Live sessions">
                {activeSessions.map((s) => {
                  const isSelected = s.id === selectedId;
                  return (
                    <button
                      key={s.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => populateForm(s)}
                      className={`flex flex-col text-left p-3 rounded-xl border transition ${
                        isSelected
                          ? "border-telemetry-cyan/80 bg-telemetry-cyan/10 text-white"
                          : "border-steel-800 bg-observatory-base/60 text-steel-300 hover:bg-observatory-hover"
                      }`}
                    >
                      <span className="text-[10px] font-bold text-telemetry-cyan uppercase">{SESSION_TYPE_LABELS[s.session_type]}</span>
                      <span className="text-xs font-semibold mt-0.5 line-clamp-1">{s.title}</span>
                      <span className="text-[10px] text-steel-400 mt-0.5">
                        {new Date(s.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        {s.assigned_user?.name ? ` · ${s.assigned_user.name}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Form panel */}
          <div className="lg:col-span-2 flex flex-col rounded-3xl border border-steel-800 bg-observatory-panel p-4 sm:p-6 lg:overflow-hidden">
            <div className="flex items-center justify-between gap-3 flex-wrap border-b border-steel-800 pb-4 mb-4">
              <h2 className="text-base font-bold text-white">{selectedId ? "Edit Session" : "New Session"}</h2>
              <div className="flex items-center gap-2">
                {selectedId && (
                  <Button size="sm" variant="danger" onClick={handleCancelSession} disabled={isSaving}>
                    Cancel Session
                  </Button>
                )}
                <Button size="sm" onClick={handleSave} disabled={isSaving || !title.trim()} loading={isSaving}>
                  {isSaving ? "Saving…" : selectedId ? "Save Changes →" : "Create Session →"}
                </Button>
              </div>
            </div>

            {saveStatus && (
              <div role="status" className="mb-4 rounded-xl border border-precision-emerald/40 bg-precision-emerald/10 px-4 py-2 text-xs text-precision-emerald font-medium">
                ✓ {saveStatus}
              </div>
            )}
            {saveError && (
              <div role="alert" className="mb-4 rounded-xl border border-vulnerability-crimson/40 bg-vulnerability-crimson/10 px-4 py-2 text-xs text-vulnerability-crimson">
                {saveError}
              </div>
            )}

            <div className="flex-1 lg:overflow-y-auto pr-1 flex flex-col gap-5">
              <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 5 — Agent Loops & ReAct Framework" />

              <div>
                <label htmlFor="session-type" className="block text-xs font-mono font-semibold text-steel-300 mb-1.5">
                  Session Type
                </label>
                <select
                  id="session-type"
                  value={sessionType}
                  onChange={(e) => setSessionType(e.target.value as LiveSessionType)}
                  className="w-full rounded-xl border border-steel-800 bg-observatory-base px-3 py-2.5 text-xs text-steel-200 transition duration-200 focus:border-telemetry-cyan focus:outline-none focus:ring-1 focus:ring-telemetry-cyan"
                >
                  {(Object.keys(SESSION_TYPE_LABELS) as LiveSessionType[]).map((t) => (
                    <option key={t} value={t}>
                      {SESSION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="starts-at" className="block text-xs font-mono font-semibold text-steel-300 mb-1.5">
                    Starts At
                  </label>
                  <input
                    id="starts-at"
                    type="datetime-local"
                    value={startsAtLocal}
                    onChange={(e) => setStartsAtLocal(e.target.value)}
                    className="w-full rounded-xl border border-steel-800 bg-observatory-base px-3 py-2.5 text-xs text-steel-200 transition duration-200 focus:border-telemetry-cyan focus:outline-none focus:ring-1 focus:ring-telemetry-cyan"
                  />
                </div>
                <Input
                  label="Duration (minutes)"
                  type="number"
                  min={1}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                />
              </div>

              {sessionType === "mock_interview" && (
                <div>
                  <label htmlFor="assigned-student" className="block text-xs font-mono font-semibold text-steel-300 mb-1.5">
                    Assigned Student
                  </label>
                  {assignedUserId ? (
                    <div className="flex items-center justify-between rounded-xl border border-telemetry-cyan/40 bg-telemetry-cyan/5 px-3 py-2.5 text-xs text-white">
                      <span>{assignedUserLabel || assignedUserId}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAssignedUserId(null);
                          setAssignedUserLabel("");
                        }}
                        className="text-steel-400 hover:text-white transition"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        id="assigned-student"
                        type="text"
                        value={studentQuery}
                        onChange={(e) => setStudentQuery(e.target.value)}
                        placeholder="Search by name or email…"
                        className="w-full rounded-xl border border-steel-800 bg-observatory-base px-3 py-2.5 text-xs text-steel-200 placeholder-steel-500 transition duration-200 focus:border-telemetry-cyan focus:outline-none focus:ring-1 focus:ring-telemetry-cyan"
                      />
                      {studentResults.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1 rounded-xl border border-steel-800 bg-observatory-base p-1.5 max-h-40 overflow-y-auto">
                          {studentResults.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setAssignedUserId(u.id);
                                setAssignedUserLabel(u.full_name || u.email);
                                setStudentQuery("");
                                setStudentResults([]);
                              }}
                              className="text-left rounded-lg px-2.5 py-1.5 text-xs text-steel-300 hover:bg-observatory-hover hover:text-white transition"
                            >
                              {u.full_name || "(no name)"} <span className="text-steel-500">— {u.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="session-desc" className="block text-xs font-mono font-semibold text-steel-300 mb-1.5">
                  Description
                </label>
                <textarea
                  id="session-desc"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={textareaStyles}
                  placeholder="What this session covers…"
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
