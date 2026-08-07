"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ReadinessGauge } from "@/components/ui/ReadinessGauge";

interface UserRow {
  id: string;
  email: string;
  full_name?: string;
  role: string;
  tier?: string;
  readinessPct: number;
  last_active_at?: string;
  onboarding_completed?: boolean;
}

interface UserDetail {
  profile: UserRow;
  readinessPct: number;
  competencyScores: Array<{ skill_node_id: string; score: number; updated_at: string }>;
  roadmap: { nodes: unknown[]; generated_at: string } | null;
  recentSubmissions: Array<{ id: string; task_id: string; ai_score: number; created_at: string }>;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchUsers = useCallback(async (q: string, p: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p) });
    if (q) params.set("search", q);
    const res = await fetch(`/api/admin/users?${params}`);
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users || []);
      setTotal(data.total || 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchUsers(search, page), 300);
    return () => clearTimeout(t);
  }, [search, page, fetchUsers]);

  const openDetail = async (userId: string) => {
    setDetailLoading(true);
    const res = await fetch(`/api/admin/users?userId=${userId}`);
    if (res.ok) setSelectedUser(await res.json());
    setDetailLoading(false);
  };

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 font-mono pb-20">
      <header className="border-b border-steel-800 bg-observatory-panel/90 px-6 sm:px-8 py-5 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
              Admin User Lookup
            </span>
            <h1 className="text-xl font-bold text-white mt-0.5">User Directory &amp; Support Telemetry</h1>
            <p className="text-xs text-steel-400 font-sans mt-0.5">{total} registered learner profiles in database</p>
          </div>

          <Badge variant="info">
            TOTAL LEARNERS: {total}
          </Badge>
        </div>
      </header>

      <main className="p-6 sm:p-8 flex flex-col md:flex-row gap-6">
        {/* User Search & Table List Column */}
        <div className={`flex flex-col gap-4 ${selectedUser ? "md:w-1/2" : "w-full"}`}>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search users by email or full name…"
            className="w-full rounded-xl border border-steel-800 bg-observatory-panel px-4 py-3 font-mono text-xs text-white placeholder-steel-400 focus:border-telemetry-cyan focus:outline-none shadow-sm"
          />

          {loading ? (
            <Card variant="default" padding="lg" className="border-steel-800 flex justify-center">
              <div
                role="status"
                aria-label="Loading users"
                className="h-6 w-6 animate-spin rounded-full border-2 border-telemetry-cyan border-t-transparent shadow-telemetry-cyan"
              />
            </Card>
          ) : users.length === 0 ? (
            <Card variant="default" padding="lg" className="border-steel-800">
              <p className="text-center text-steel-400 font-mono text-xs">No matching users found.</p>
            </Card>
          ) : (
            <>
              {/* Mobile: stacked card list — a 4-column table doesn't survive
                  a 375px viewport, so below sm this renders as rows of
                  cards instead of squeezing table cells. */}
              <div className="flex flex-col gap-2 sm:hidden" role="list" aria-label="Users">
                {users.map((u) => (
                  <button
                    key={u.id}
                    role="listitem"
                    onClick={() => openDetail(u.id)}
                    aria-label={`View details for ${u.full_name || u.email}`}
                    className={`w-full text-left rounded-2xl border p-4 transition ${
                      selectedUser?.profile?.id === u.id
                        ? "bg-telemetry-cyan/10 border-telemetry-cyan/30"
                        : "bg-observatory-panel border-steel-800 hover:bg-observatory-hover"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">{u.full_name || "—"}</p>
                        <p className="text-steel-400 text-[11px] font-mono truncate">{u.email}</p>
                      </div>
                      <ReadinessGauge score={u.readinessPct} variant="badge" />
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <Badge variant="info" size="sm">
                        {(u.tier || "free").toUpperCase()}
                      </Badge>
                      <span className="text-steel-400 font-tabular text-[11px]">
                        {u.last_active_at ? new Date(u.last_active_at).toLocaleDateString() : "Never active"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Desktop / tablet: real table */}
              <Card variant="default" padding="none" className="overflow-hidden border-steel-800 hidden sm:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <caption className="sr-only">Registered users, sorted by signup</caption>
                    <thead className="bg-observatory-panel text-steel-400 border-b border-steel-800 text-left">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-bold">Learner Identity</th>
                        <th scope="col" className="px-3 py-3 text-center font-bold">Tier</th>
                        <th scope="col" className="px-3 py-3 text-center font-bold">Readiness</th>
                        <th scope="col" className="px-4 py-3 text-right font-bold">Last Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr
                          key={u.id}
                          tabIndex={0}
                          role="button"
                          aria-label={`View details for ${u.full_name || u.email}`}
                          onClick={() => openDetail(u.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openDetail(u.id);
                            }
                          }}
                          className={`border-b border-steel-800/60 cursor-pointer transition ${
                            selectedUser?.profile?.id === u.id
                              ? "bg-telemetry-cyan/10 border-telemetry-cyan/30"
                              : "hover:bg-observatory-panel/60"
                          }`}
                        >
                          <td className="px-4 py-3">
                            <p className="font-bold text-white">{u.full_name || "—"}</p>
                            <p className="text-steel-400 text-[11px] font-mono">{u.email}</p>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <Badge variant="info" size="sm">
                              {(u.tier || "free").toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <ReadinessGauge score={u.readinessPct} variant="badge" />
                          </td>
                          <td className="px-4 py-3 text-right text-steel-400 font-tabular text-[11px]">
                            {u.last_active_at
                              ? new Date(u.last_active_at).toLocaleDateString()
                              : "Never"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* Pagination Navigation */}
          <div className="flex items-center justify-between text-xs text-steel-400 font-mono">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ← Prev Page
            </Button>
            <span className="font-tabular">Page {page} of {Math.ceil(total / 20) || 1}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 20 >= total}
            >
              Next Page →
            </Button>
          </div>
        </div>

        {/* Side Inspect Panel for Selected User */}
        {selectedUser && (
          <div className="md:w-1/2 flex flex-col gap-4">
            <Card variant="glow" padding="lg">
              <div className="flex items-start justify-between border-b border-steel-800 pb-3 mb-4">
                <div>
                  <h2 className="text-base font-bold text-white">{selectedUser.profile?.full_name || selectedUser.profile?.email}</h2>
                  <p className="text-xs text-steel-400 font-mono mt-0.5">{selectedUser.profile?.email} • Role: {selectedUser.profile?.role}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setSelectedUser(null)}>
                  ✕ Close
                </Button>
              </div>

              {detailLoading ? (
                <div className="flex justify-center py-10">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-telemetry-cyan border-t-transparent shadow-telemetry-cyan" />
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-observatory-base border border-steel-800 p-3">
                      <span className="text-[10px] text-steel-400 uppercase font-bold block mb-1">Overall Vector</span>
                      <ReadinessGauge score={selectedUser.readinessPct} variant="badge" />
                    </div>
                    <div className="rounded-xl bg-observatory-base border border-steel-800 p-3">
                      <span className="text-[10px] text-steel-400 uppercase font-bold block mb-1">Nodes Scored</span>
                      <span className="text-lg font-bold text-white font-tabular">{selectedUser.competencyScores.length}</span>
                    </div>
                    <div className="rounded-xl bg-observatory-base border border-steel-800 p-3">
                      <span className="text-[10px] text-steel-400 uppercase font-bold block mb-1">Submissions</span>
                      <span className="text-lg font-bold text-white font-tabular">{selectedUser.recentSubmissions.length}</span>
                    </div>
                  </div>

                  {/* Competency Scores Breakdown */}
                  <div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider block mb-2">
                      Competency Score Vector
                    </span>
                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                      {selectedUser.competencyScores.map((s) => (
                        <div key={s.skill_node_id} className="flex items-center justify-between text-xs py-1.5 border-b border-steel-800/50">
                          <span className="text-steel-300 font-mono truncate max-w-[70%]">{s.skill_node_id}</span>
                          <Badge variant={s.score >= 70 ? "mastery" : s.score >= 40 ? "gap" : "vulnerability"} size="sm">
                            {Math.round(s.score)}%
                          </Badge>
                        </div>
                      ))}
                      {selectedUser.competencyScores.length === 0 && <p className="text-steel-400 text-xs">No scores recorded yet.</p>}
                    </div>
                  </div>

                  {/* Recent Submissions */}
                  <div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider block mb-2">
                      Recent Graded Submissions
                    </span>
                    <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                      {selectedUser.recentSubmissions.map((sub) => (
                        <div key={sub.id} className="flex items-center justify-between text-xs py-1.5 border-b border-steel-800/50">
                          <span className="text-steel-300 font-mono truncate max-w-[60%]">{sub.task_id}</span>
                          <span className="text-telemetry-cyan font-bold font-tabular">{sub.ai_score}%</span>
                          <span className="text-steel-400 text-[10px] font-tabular">{new Date(sub.created_at).toLocaleDateString()}</span>
                        </div>
                      ))}
                      {selectedUser.recentSubmissions.length === 0 && <p className="text-steel-400 text-xs">No submissions found.</p>}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
