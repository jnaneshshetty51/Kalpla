"use client";

import { useState, useRef } from "react";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ChatBubbleMockup } from "./ChatBubbleMockup";
import { PROGRAM_DURATION } from "@/lib/marketing/acceleratorFacts";

const SHOWCASE_TABS = [
  { id: "roadmap", label: "Your Roadmap" },
  { id: "mentor", label: "AI Mentor" },
] as const;

type ShowcaseTabId = (typeof SHOWCASE_TABS)[number]["id"];

const MENTOR_MESSAGES = [
  {
    role: "assistant" as const,
    content:
      "Hello! I am your AI Tutor companion for RAG Pipeline Design. Ask me any clarifying questions, request practical code breakdowns, or ask for real-world application analogies!",
  },
  { role: "user" as const, content: "What is RAG?" },
  { role: "assistant" as const, content: "RAG stands for Retrieval-Augmented Generation." },
];

export function HeroSection() {
  const [activeTab, setActiveTab] = useState<ShowcaseTabId>("roadmap");
  const tabRefs = useRef<Record<ShowcaseTabId, HTMLButtonElement | null>>({ roadmap: null, mentor: null });

  function handleTabKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const nextIndex = e.key === "ArrowRight" ? (index + 1) % SHOWCASE_TABS.length : (index - 1 + SHOWCASE_TABS.length) % SHOWCASE_TABS.length;
    const nextTab = SHOWCASE_TABS[nextIndex];
    setActiveTab(nextTab.id);
    tabRefs.current[nextTab.id]?.focus();
  }

  return (
    <section className="relative overflow-hidden border-b border-steel-800 bg-observatory-base px-4 sm:px-6 py-16 sm:py-24 telemetry-grid-bg">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Single flagship-product thesis + primary CTA */}
          <div className="lg:col-span-7 flex flex-col items-start gap-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-telemetry-cyan/30 bg-telemetry-cyan/10 px-3 py-1 font-mono text-xs font-semibold text-telemetry-cyan">
              <span className="h-1.5 w-1.5 rounded-full bg-telemetry-cyan animate-pulse" />
              GenAI Engineer Accelerator
            </span>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-mono font-black tracking-tight text-white leading-tight">
              Become a GenAI Engineer. <span className="text-telemetry-cyan">Build the proof</span>, not just the theory.
            </h1>

            <p className="text-base sm:text-lg text-steel-300 font-sans leading-relaxed max-w-2xl">
              A {PROGRAM_DURATION}, project-based accelerator combining an AI-powered learning platform with real human mentorship — expert-led classes, real-world projects, and placement assistance.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto mt-2">
              <AuthAwareCTA
                signedOutHref="/signup"
                signedOutLabel="Apply Now →"
                signedInHref="/dashboard"
                signedInLabel="Go to your console dashboard →"
                className="rounded-xl bg-telemetry-cyan px-7 py-3.5 font-mono text-sm font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white text-center"
              />

              <a
                href="#curriculum"
                className="rounded-xl border border-steel-700 bg-observatory-panel px-6 py-3.5 font-mono text-sm font-semibold text-steel-200 hover:bg-steel-800 transition text-center"
              >
                Explore Curriculum
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-steel-400 pt-2">
              <span>✓ {PROGRAM_DURATION} Guided Cohort</span>
              <span>•</span>
              <span>✓ AI + Human Mentorship</span>
              <span>•</span>
              <span>✓ Real, Reviewed Projects</span>
            </div>
          </div>

          {/* Right Column: Real product surfaces, not a teacher photo */}
          <div className="lg:col-span-5">
            <Card variant="glow" padding="md" className="w-full">
              <div
                role="tablist"
                aria-label="Product preview"
                className="flex items-center gap-2 border-b border-steel-800 pb-3 mb-4"
              >
                {SHOWCASE_TABS.map((tab, index) => (
                  <button
                    key={tab.id}
                    ref={(el) => {
                      tabRefs.current[tab.id] = el;
                    }}
                    role="tab"
                    id={`hero-tab-${tab.id}`}
                    aria-selected={activeTab === tab.id}
                    aria-controls={`hero-tabpanel-${tab.id}`}
                    tabIndex={activeTab === tab.id ? 0 : -1}
                    onClick={() => setActiveTab(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, index)}
                    className={`rounded-lg px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wide transition ${
                      activeTab === tab.id
                        ? "bg-telemetry-cyan text-observatory-base shadow-telemetry-cyan"
                        : "text-steel-400 hover:text-steel-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div
                role="tabpanel"
                id="hero-tabpanel-roadmap"
                aria-labelledby="hero-tab-roadmap"
                hidden={activeTab !== "roadmap"}
                className="flex flex-col gap-3"
              >
                <div className="rounded-2xl border border-telemetry-cyan/80 bg-observatory-panel/90 telemetry-glow-cyan ring-1 ring-telemetry-cyan/40 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-telemetry-cyan animate-pulse shadow-telemetry-cyan" />
                      <Badge variant="info" size="sm" dot={false}>CURRENT FOCUS</Badge>
                    </div>
                  </div>
                  <h4 className="font-mono text-sm font-bold text-white">Agent Loops &amp; ReAct Framework</h4>
                  <p className="mt-1 font-mono text-[11px] text-steel-400">Agentic Systems · Month 4</p>
                </div>

                <div className="rounded-2xl border border-precision-emerald/30 bg-precision-emerald/5 p-4">
                  <Badge variant="mastery" size="sm" dot={false}>COMPLETED ✓</Badge>
                  <h4 className="font-mono text-sm font-bold text-white mt-2">RAG Pipeline Design</h4>
                  <p className="mt-1 font-mono text-[11px] text-steel-400">Embeddings &amp; Retrieval · Month 3</p>
                </div>
              </div>

              <div
                role="tabpanel"
                id="hero-tabpanel-mentor"
                aria-labelledby="hero-tab-mentor"
                hidden={activeTab !== "mentor"}
              >
                <ChatBubbleMockup messages={MENTOR_MESSAGES} />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
