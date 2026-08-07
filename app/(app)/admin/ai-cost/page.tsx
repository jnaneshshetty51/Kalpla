"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface TimeSeriesPoint { date: string; cost: number; }
interface FeatureRow { feature: string; cost: number; calls: number; cacheHits: number; }
interface ModelRow { model: string; cost: number; tokens: number; calls: number; }

interface CostData {
  days: number;
  totalCost: number;
  totalCalls: number;
  activeUsers: number;
  costPerActiveUser: number;
  cacheHitCount: number;
  timeSeries: TimeSeriesPoint[];
  featureBreakdown: FeatureRow[];
  modelBreakdown: ModelRow[];
}

function CostChart({ data }: { data: TimeSeriesPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center text-steel-400 font-mono text-xs">
        Insufficient data points to render time-series trend.
      </div>
    );
  }
  const maxCost = Math.max(...data.map((d) => d.cost), 0.0001);
  const W = 700;
  const H = 180;
  const pad = { t: 16, r: 16, b: 32, l: 52 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;

  const pts = data.map((d, i) => ({
    x: pad.l + (i / (data.length - 1)) * chartW,
    y: pad.t + chartH - (d.cost / maxCost) * chartH,
    ...d,
  }));

  const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const area = [
    `M${pts[0].x},${pad.t + chartH}`,
    ...pts.map((p) => `L${p.x},${p.y}`),
    `L${pts[pts.length - 1].x},${pad.t + chartH}`,
    "Z",
  ].join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: pad.t + chartH - t * chartH,
    label: `$${(t * maxCost).toFixed(4)}`,
  }));

  const xLabels = [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "180px" }}>
      <defs>
        <linearGradient id="areaGradCyan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} y1={t.y} x2={W - pad.r} y2={t.y} stroke="#1E293B" strokeWidth="1" />
          <text x={pad.l - 4} y={t.y + 4} fontSize="9" fill="#64748B" fontFamily="monospace" textAnchor="end">{t.label}</text>
        </g>
      ))}
      <path d={area} fill="url(#areaGradCyan)" />
      <polyline points={polyline} fill="none" stroke="#00F0FF" strokeWidth="2" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#00F0FF" />
      ))}
      {xLabels.map((p, i) => (
        <text key={i} x={p.x} y={H - 6} fontSize="9" fill="#64748B" fontFamily="monospace" textAnchor="middle">{p.date.slice(5)}</text>
      ))}
    </svg>
  );
}

const RANGES = [7, 30, 90] as const;

export default function AiCostPage() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setData(null);
      try {
        const res = await fetch(`/api/admin/cost-analytics?days=${days}`);
        if (!cancelled && res.ok) setData(await res.json());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [days]);

  const cpuStatus =
    !data ? "neutral"
    : data.costPerActiveUser < 0.05 ? "green"
    : data.costPerActiveUser < 0.15 ? "amber"
    : "red";

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 font-mono pb-20">
      <header className="border-b border-steel-800 bg-observatory-panel/90 px-6 sm:px-8 py-5 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
              Admin Ops Telemetry
            </span>
            <h1 className="text-xl font-bold text-white mt-0.5">AI Unit Economics Dashboard</h1>
            <p className="text-xs text-steel-400 font-sans mt-0.5">Cost per active user go/no-go evaluation gate</p>
          </div>

          <div className="flex gap-2">
            {RANGES.map((r) => (
              <Button
                key={r}
                variant={days === r ? "primary" : "secondary"}
                size="sm"
                onClick={() => setDays(r)}
              >
                {r}d
              </Button>
            ))}
          </div>
        </div>
      </header>

      <main className="p-6 sm:p-8 flex flex-col gap-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-telemetry-cyan border-t-transparent shadow-telemetry-cyan" />
          </div>
        ) : data ? (
          <>
            {/* FEATURED METRIC CARD: Cost Per Active User (Core Go/No-Go Signal) */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <Card
                variant="glow"
                padding="lg"
                className={`lg:col-span-2 border ${
                  cpuStatus === "green"
                    ? "border-precision-emerald/50 bg-precision-emerald/5"
                    : cpuStatus === "amber"
                    ? "border-calibrated-amber/50 bg-calibrated-amber/5"
                    : "border-vulnerability-crimson/50 bg-vulnerability-crimson/5"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-steel-400">
                    Cost per Active User ({days}d) — Unit Economics Gate
                  </span>
                  <Badge variant={cpuStatus === "green" ? "mastery" : cpuStatus === "amber" ? "gap" : "vulnerability"}>
                    {cpuStatus === "green" ? "SUSTAINABLE ✓" : cpuStatus === "amber" ? "WATCH CLOSELY ⚠" : "UNSUSTAINABLE ✗"}
                  </Badge>
                </div>

                <div className="text-5xl font-extrabold font-tabular text-white tracking-tight">
                  ${data.costPerActiveUser.toFixed(4)}
                </div>

                <p className="text-xs font-sans text-steel-400 mt-2 leading-relaxed">
                  Threshold target: &lt;$0.05/user (Green) · $0.05–$0.15 (Amber Alert) · &gt;$0.15 (Red Action Required)
                </p>
              </Card>

              <Card variant="default" padding="md">
                <span className="text-[10px] font-bold uppercase tracking-wider text-steel-400">Total API Expense</span>
                <p className="text-3xl font-extrabold text-white font-tabular mt-2">${data.totalCost.toFixed(4)}</p>
                <span className="text-[10px] text-steel-400 font-mono mt-1 block">{data.totalCalls.toLocaleString()} total API calls</span>
              </Card>

              <Card variant="default" padding="md">
                <span className="text-[10px] font-bold uppercase tracking-wider text-steel-400">Active Monthly Users</span>
                <p className="text-3xl font-extrabold text-white font-tabular mt-2">{data.activeUsers}</p>
                <span className="text-[10px] text-precision-emerald font-mono mt-1 block font-bold">{data.cacheHitCount} prompt cache hits</span>
              </Card>
            </div>

            {/* Time-Series Chart */}
            <Card variant="default" padding="lg">
              <span className="text-xs font-bold text-white uppercase tracking-wider block mb-4">
                Daily LLM Cost Trend (Last {days} Days)
              </span>
              <CostChart data={data.timeSeries} />
            </Card>

            {/* Breakdown Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Feature Breakdown */}
              <Card variant="default" padding="md">
                <span className="text-xs font-bold text-white uppercase tracking-wider block mb-3">
                  Cost by AI Feature
                </span>
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-steel-400 border-b border-steel-800 text-left">
                      <th className="pb-2">Feature</th>
                      <th className="pb-2 text-right">Cost</th>
                      <th className="pb-2 text-right">Calls</th>
                      <th className="pb-2 text-right">Cache</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.featureBreakdown.map((row) => (
                      <tr key={row.feature} className="border-b border-steel-800/50">
                        <td className="py-2.5 text-steel-200">{row.feature}</td>
                        <td className="py-2.5 text-right text-telemetry-cyan font-tabular">${row.cost.toFixed(5)}</td>
                        <td className="py-2.5 text-right text-steel-400 font-tabular">{row.calls}</td>
                        <td className="py-2.5 text-right text-precision-emerald font-tabular">{row.cacheHits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              {/* Model Breakdown */}
              <Card variant="default" padding="md">
                <span className="text-xs font-bold text-white uppercase tracking-wider block mb-3">
                  Cost by LLM Provider Model
                </span>
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-steel-400 border-b border-steel-800 text-left">
                      <th className="pb-2">Model</th>
                      <th className="pb-2 text-right">Cost</th>
                      <th className="pb-2 text-right">Tokens</th>
                      <th className="pb-2 text-right">Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.modelBreakdown.map((row) => (
                      <tr key={row.model} className="border-b border-steel-800/50">
                        <td className="py-2.5 text-steel-200">{row.model}</td>
                        <td className="py-2.5 text-right text-telemetry-cyan font-tabular">${row.cost.toFixed(5)}</td>
                        <td className="py-2.5 text-right text-steel-400 font-tabular">{row.tokens.toLocaleString()}</td>
                        <td className="py-2.5 text-right text-steel-400 font-tabular">{row.calls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </>
        ) : (
          <p className="text-steel-400 text-sm font-mono">No telemetry cost records available.</p>
        )}
      </main>
    </div>
  );
}
