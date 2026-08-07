"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";
import { ReadinessGauge } from "@/components/ui/ReadinessGauge";

export default function DesignSystemPage() {
  const [interactiveScore, setInteractiveScore] = useState<number>(78);
  const [interactiveBenchmark, setInteractiveBenchmark] = useState<number>(70);
  const [testInput, setTestInput] = useState("");

  const swatches = [
    { name: "Observatory Base", hex: "#090D16", class: "bg-observatory-base border-steel-800" },
    { name: "Observatory Panel", hex: "#0E1626", class: "bg-observatory-panel border-steel-800" },
    { name: "Telemetry Cyan", hex: "#00F0FF", class: "bg-telemetry-cyan text-observatory-base" },
    { name: "Precision Emerald", hex: "#10B981", class: "bg-precision-emerald text-observatory-base" },
    { name: "Calibrated Amber", hex: "#F59E0B", class: "bg-calibrated-amber text-observatory-base" },
    { name: "Vulnerability Crimson", hex: "#EF4444", class: "bg-vulnerability-crimson text-white" },
    { name: "Muted Steel", hex: "#64748B", class: "bg-steel-500 text-white" },
  ];

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 telemetry-grid-bg p-8 flex flex-col gap-10">
      {/* Header */}
      <header className="border-b border-steel-800 pb-6 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-telemetry-cyan">
            Internal Console
          </span>
          <h1 className="text-2xl font-mono font-black text-white mt-1">
            Kalpla Design System & Token Inventory
          </h1>
          <p className="text-xs text-steel-400 mt-1 font-sans">
            Visual tokens, base UI component library, and signature readiness telemetry gauge.
          </p>
        </div>
        <Link href="/dashboard" className="text-xs font-mono text-steel-400 hover:text-telemetry-cyan transition">
          ← Back to Dashboard
        </Link>
      </header>

      {/* SECTION 1: SIGNATURE COMPONENT (READINESS TELEMETRY GAUGE) */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-mono font-bold text-telemetry-cyan uppercase tracking-wider">
            01. Signature Element — Kalpla Readiness Vector (`ReadinessGauge`)
          </h2>
          <div className="flex items-center gap-4 bg-observatory-panel px-4 py-2 rounded-2xl border border-steel-800">
            <label className="text-xs font-mono text-steel-300 flex items-center gap-2">
              <span>Score ({interactiveScore}%)</span>
              <input
                type="range"
                min="0"
                max="100"
                value={interactiveScore}
                onChange={(e) => setInteractiveScore(parseInt(e.target.value))}
                className="w-28 accent-telemetry-cyan cursor-pointer"
              />
            </label>
            <label className="text-xs font-mono text-steel-300 flex items-center gap-2">
              <span>Benchmark ({interactiveBenchmark}%)</span>
              <input
                type="range"
                min="30"
                max="90"
                value={interactiveBenchmark}
                onChange={(e) => setInteractiveBenchmark(parseInt(e.target.value))}
                className="w-24 accent-steel-400 cursor-pointer"
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Linear Hero Gauge */}
          <Card title="Variant: Linear Hero Gauge" className="lg:col-span-2">
            <ReadinessGauge
              score={interactiveScore}
              benchmark={interactiveBenchmark}
              variant="linear"
              label="GenAI Engineer Readiness"
            />
          </Card>

          {/* Radial Arc Gauge */}
          <Card title="Variant: Radial Arc Dial">
            <div className="flex justify-around items-center py-2">
              <ReadinessGauge
                score={interactiveScore}
                benchmark={interactiveBenchmark}
                variant="radial"
                size="md"
                label="Overall"
              />
              <ReadinessGauge
                score={interactiveScore}
                benchmark={interactiveBenchmark}
                variant="radial"
                size="lg"
                label="Benchmark"
              />
            </div>
          </Card>

          {/* Badge Micro Variants */}
          <Card title="Variant: Inline Micro Badges" className="lg:col-span-3">
            <div className="flex items-center gap-3 flex-wrap">
              <ReadinessGauge score={92} variant="badge" />
              <ReadinessGauge score={interactiveScore} benchmark={interactiveBenchmark} variant="badge" />
              <ReadinessGauge score={58} variant="badge" />
              <ReadinessGauge score={24} variant="badge" />
            </div>
          </Card>
        </div>
      </section>

      {/* SECTION 2: COLOR PALETTE */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-mono font-bold text-telemetry-cyan uppercase tracking-wider">
          02. Observatory Telemetry Color Tokens
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {swatches.map((s) => (
            <div key={s.name} className={`rounded-2xl border p-4 flex flex-col justify-between h-28 ${s.class}`}>
              <span className="font-mono text-xs font-bold">{s.name}</span>
              <span className="font-mono text-[11px] opacity-80">{s.hex}</span>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 3: TYPOGRAPHY & NUMERIC TABULAR DISPLAY */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-mono font-bold text-telemetry-cyan uppercase tracking-wider">
          03. Typography & Tabular Numeric Alignment
        </h2>
        <Card title="Display Mono vs Body Sans + Tabular Numbers Test">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-mono font-bold text-steel-400 uppercase mb-2">Display Monospace (`Geist Mono`)</p>
              <h3 className="text-xl font-mono font-extrabold text-white">RAG System Competency Matrix v2.0</h3>
              <p className="text-xs font-mono text-telemetry-cyan mt-1">STATUS: OPERATIONAL • REVISION 14</p>
            </div>
            <div>
              <p className="text-xs font-mono font-bold text-steel-400 uppercase mb-2">Tabular Monospace Alignment Test</p>
              <div className="font-mono text-xs space-y-1">
                <div className="flex justify-between border-b border-steel-800 pb-1">
                  <span>Vector Embedding Retrieval</span>
                  <span className="font-tabular text-precision-emerald font-bold">100.0%</span>
                </div>
                <div className="flex justify-between border-b border-steel-800 pb-1">
                  <span>Context Chunking Strategy</span>
                  <span className="font-tabular text-telemetry-cyan font-bold">078.4%</span>
                </div>
                <div className="flex justify-between">
                  <span>Fine-Tuning LoRA Weights</span>
                  <span className="font-tabular text-calibrated-amber font-bold">042.1%</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* SECTION 4: BUTTONS */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-mono font-bold text-telemetry-cyan uppercase tracking-wider">
          04. Button Components (`components/ui/Button.tsx`)
        </h2>
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="primary">Primary Cyan</Button>
              <Button variant="secondary">Secondary Slate</Button>
              <Button variant="ghost">Ghost Button</Button>
              <Button variant="danger">Danger Action</Button>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large Hero</Button>
              <Button loading>Loading...</Button>
              <Button disabled>Disabled</Button>
            </div>
          </div>
        </Card>
      </section>

      {/* SECTION 5: INPUTS */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-mono font-bold text-telemetry-cyan uppercase tracking-wider">
          05. Form Inputs (`components/ui/Input.tsx`)
        </h2>
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Input
              label="Skill Node Query"
              placeholder="e.g. RAG, Vector Search..."
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              helperText="Enter a keyword to filter node telemetry"
            />
            <Input
              label="API Endpoint URL"
              placeholder="https://api.kalpla.com/v1"
              leftIcon={<span className="text-xs font-mono text-telemetry-cyan">GET</span>}
            />
            <Input
              label="Benchmark Override"
              value="invalid_score"
              error="Benchmark must be a numeric score between 0 and 100"
              readOnly
            />
          </div>
        </Card>
      </section>

      {/* SECTION 6: CARDS, BADGES & TOOLTIPS */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-mono font-bold text-telemetry-cyan uppercase tracking-wider">
          06. Cards, Badges (`Badge.tsx`) & Tooltips (`Tooltip.tsx`)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card title="Default Observatory Panel" subtitle="Standard dark surface for standard telemetry cards">
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <Badge variant="mastery">Mastered</Badge>
              <Badge variant="info">In Progress</Badge>
              <Badge variant="gap">Gap Detected</Badge>
            </div>
          </Card>

          <Card variant="bordered" title="Bordered Panel" subtitle="High-contrast border variant">
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <Badge variant="vulnerability">Critical Gap</Badge>
              <Badge variant="neutral">Pending</Badge>
            </div>
          </Card>

          <Card variant="glow" title="Glow Panel" subtitle="Active focus state with telemetry cyan glow">
            <div className="flex items-center gap-3 mt-2">
              <Tooltip content="Calculates vector similarity against 70% threshold" shortcut="⌘K">
                <span className="text-xs font-mono text-telemetry-cyan underline cursor-help">
                  Hover for Tooltip
                </span>
              </Tooltip>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
