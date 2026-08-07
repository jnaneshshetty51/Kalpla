"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

type SortKey = "completionRate" | "dropOffRate" | "avgAttempts";

interface NodeHealth {
  id: string;
  name: string;
  category: string;
  completionRate: number;
  avgAttempts: number;
  dropOffRate: number;
  totalUsers: number;
  startedUsers: number;
}

function healthBadgeVariant(completionRate: number) {
  if (completionRate >= 70) return "mastery";
  if (completionRate >= 40) return "gap";
  return "vulnerability";
}

function rowHighlightClass(completionRate: number) {
  if (completionRate < 40) return "bg-vulnerability-crimson/10 border-vulnerability-crimson/40";
  if (completionRate < 70) return "bg-calibrated-amber/5 border-calibrated-amber/30";
  return "bg-observatory-base border-steel-800/80";
}

function SortIndicator({ active, asc }: { active: boolean; asc: boolean }) {
  return <span className="ml-1 text-steel-400 font-mono">{active ? (asc ? "↑" : "↓") : "↕"}</span>;
}

export default function SkillGraphHealthPage() {
  const [nodes, setNodes] = useState<NodeHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("completionRate");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const res = await fetch("/api/admin/skill-graph-health");
      if (!cancelled && res.ok) {
        const d = await res.json();
        setNodes(d.nodes || []);
      }
      if (!cancelled) setLoading(false);
    }
    run();
    return () => { cancelled = true; };
  }, []);

  const sorted = [...nodes].sort((a, b) =>
    sortAsc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey],
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((prev) => !prev);
    else { setSortKey(key); setSortAsc(true); }
  };

  const worst = sorted.filter((n) => n.completionRate < 40).length;

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 font-mono pb-20">
      <header className="border-b border-steel-800 bg-observatory-panel/90 px-6 sm:px-8 py-5 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
              Curriculum Telemetry
            </span>
            <h1 className="text-xl font-bold text-white mt-0.5">Skill Graph Health &amp; Bottlenecks</h1>
            <p className="text-xs text-steel-400 font-sans mt-0.5">Sortable node completion rates, drop-off spikes, &amp; average attempt counts</p>
          </div>

          {worst > 0 && (
            <Badge variant="vulnerability" size="md">
              ⚠ {worst} CRITICAL BOTTLENECK NODE{worst > 1 ? "S" : ""} (&lt;40% completion)
            </Badge>
          )}
        </div>
      </header>

      <main className="p-6 sm:p-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-telemetry-cyan border-t-transparent shadow-telemetry-cyan" />
          </div>
        ) : (
          <Card variant="default" padding="none" className="overflow-hidden border-steel-800">
            <table className="w-full text-xs font-mono">
              <thead className="bg-observatory-panel text-steel-400 border-b border-steel-800 text-left">
                <tr>
                  <th className="px-5 py-3.5 font-bold">Skill Node Identifier</th>
                  <th className="px-4 py-3.5 font-bold">Domain Category</th>
                  <th className="px-4 py-3.5 font-bold text-right cursor-pointer select-none" onClick={() => handleSort("completionRate")}>
                    Completion Rate <SortIndicator active={sortKey === "completionRate"} asc={sortAsc} />
                  </th>
                  <th className="px-4 py-3.5 font-bold text-right cursor-pointer select-none" onClick={() => handleSort("avgAttempts")}>
                    Avg Attempts <SortIndicator active={sortKey === "avgAttempts"} asc={sortAsc} />
                  </th>
                  <th className="px-4 py-3.5 font-bold text-right cursor-pointer select-none" onClick={() => handleSort("dropOffRate")}>
                    Drop-off Rate <SortIndicator active={sortKey === "dropOffRate"} asc={sortAsc} />
                  </th>
                  <th className="px-5 py-3.5 font-bold text-right">Learners Started</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((node) => (
                  <tr key={node.id} className={`border-b transition ${rowHighlightClass(node.completionRate)}`}>
                    <td className="px-5 py-3.5 font-bold text-white flex items-center gap-2">
                      {node.completionRate < 40 && (
                        <span className="text-vulnerability-crimson font-bold text-sm">🔴</span>
                      )}
                      <span>{node.name}</span>
                    </td>
                    <td className="px-4 py-3.5 text-telemetry-cyan font-bold">{node.category}</td>
                    <td className="px-4 py-3.5 text-right font-bold font-tabular">
                      <Badge variant={healthBadgeVariant(node.completionRate)} size="sm">
                        {node.completionRate}%
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-right text-steel-300 font-tabular">{node.avgAttempts}x</td>
                    <td className={`px-4 py-3.5 text-right font-bold font-tabular ${node.dropOffRate > 50 ? "text-vulnerability-crimson" : "text-steel-300"}`}>
                      {node.dropOffRate}%
                    </td>
                    <td className="px-5 py-3.5 text-right text-steel-400 font-tabular">{node.startedUsers}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-steel-400 font-mono">
                      No skill node health records available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}
