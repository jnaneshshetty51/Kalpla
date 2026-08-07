"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const STORAGE_KEY = "kalpla_onboarding_state";

interface OnboardingAnswers {
  name: string;
  goal: string;
  experience_level: string;
  time_budget_minutes_per_day: string;
  timeline_days: string;
}

const EMPTY_ANSWERS: OnboardingAnswers = {
  name: "",
  goal: "",
  experience_level: "",
  time_budget_minutes_per_day: "",
  timeline_days: "",
};

type StepKey = keyof OnboardingAnswers;

interface Step {
  key: StepKey;
  question: string;
  subtext: string;
  type: "text" | "select" | "goal_select";
  placeholder?: string;
  suggestions?: string[];
  options?: { label: string; sublabel?: string; value: string; icon?: string }[];
}

const STEPS: Step[] = [
  {
    key: "name",
    question: "First things first — what should we call you?",
    subtext: "We'll use your preferred name across your console, AI tutor chats, and public engineering portfolio.",
    type: "text",
    placeholder: "e.g. Rahul Sharma",
  },
  {
    key: "goal",
    question: "What's your primary goal with GenAI right now?",
    subtext: "Whether it's landing a role as a RAG Architect or building autonomous agents, this shapes how your roadmap gets prioritized.",
    type: "goal_select",
    placeholder: "e.g. Land a job as a GenAI Engineer in 90 days",
    suggestions: [
      "Land a job as a GenAI Engineer",
      "Master RAG & Vector Retrieval Systems",
      "Build Autonomous Multi-Agent Swarms",
      "Fine-Tune Domain-Specific LLMs",
    ],
  },
  {
    key: "experience_level",
    question: "Where are you starting from on your GenAI journey?",
    subtext: "Be honest — our diagnostic assessment will calibrate your exact skill vector anyway.",
    type: "select",
    options: [
      {
        label: "Foundational Practitioner",
        sublabel: "New to LLM APIs, prompt engineering, and core AI concepts.",
        value: "beginner",
        icon: "🌱",
      },
      {
        label: "Intermediate Builder",
        sublabel: "Have built basic RAG scripts, OpenAI API wrappers, or simple chains.",
        value: "intermediate",
        icon: "⚡",
      },
      {
        label: "Advanced Systems Engineer",
        sublabel: "Have deployed production agents, vector stores, or fine-tuned open models.",
        value: "advanced",
        icon: "🚀",
      },
    ],
  },
  {
    key: "time_budget_minutes_per_day",
    question: "How much time can you invest each day?",
    subtext: "Consistency beats marathon sessions. We'll size your daily learning tasks to fit your schedule.",
    type: "select",
    options: [
      { label: "15 minutes / day", sublabel: "Micro-learning • Focused daily streak", value: "15", icon: "⏱️" },
      { label: "30 minutes / day", sublabel: "Balanced pace • Ideal for working engineers", value: "30", icon: "⌛" },
      { label: "1 hour / day", sublabel: "Fast-track • Recommended for 90-day goal", value: "60", icon: "🔥" },
      { label: "2+ hours / day", sublabel: "Immersion • Full career transition mode", value: "120", icon: "⚡" },
    ],
  },
  {
    key: "timeline_days",
    question: "What is your target timeline for production readiness?",
    subtext: "Setting a target horizon keeps your momentum focused. Most engineers reach production benchmark in 90 days.",
    type: "select",
    options: [
      { label: "30 Days (Intensive Sprint)", sublabel: "High daily time commitment required", value: "30", icon: "🎯" },
      { label: "60 Days (Accelerated Track)", sublabel: "Steady progress toward production readiness", value: "60", icon: "⚡" },
      { label: "90 Days (Standard Horizon)", sublabel: "Recommended balance of depth & pacing", value: "90", icon: "🏆" },
      { label: "180 Days (Deep Mastery)", sublabel: "Comprehensive exploration of all 8 categories", value: "180", icon: "📚" },
    ],
  },
];

interface Progress {
  stepIndex: number;
  answers: OnboardingAnswers;
  hydrated: boolean;
}

const INITIAL_PROGRESS: Progress = {
  stepIndex: 0,
  answers: EMPTY_ANSWERS,
  hydrated: false,
};

export default function OnboardingPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>(INITIAL_PROGRESS);
  const { stepIndex, answers, hydrated } = progress;

  const [handoffStep, setHandoffStep] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restore progress from localStorage on mount.
  useEffect(() => {
    let restoredStepIndex = 0;
    let restoredAnswers = EMPTY_ANSWERS;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          stepIndex?: number;
          answers?: Partial<OnboardingAnswers>;
        };
        if (typeof parsed.stepIndex === "number") {
          restoredStepIndex = Math.min(
            Math.max(parsed.stepIndex, 0),
            STEPS.length - 1,
          );
        }
        if (parsed.answers) {
          restoredAnswers = { ...EMPTY_ANSWERS, ...parsed.answers };
        }
      }
    } catch (err) {
      console.warn("Failed to restore onboarding progress:", err);
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress({
      stepIndex: restoredStepIndex,
      answers: restoredAnswers,
      hydrated: true,
    });
  }, []);

  // Persist progress on change
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ stepIndex, answers }),
      );
    } catch (err) {
      console.warn("Failed to persist onboarding progress:", err);
    }
  }, [hydrated, stepIndex, answers]);

  const step = STEPS[stepIndex];
  const progressPercent = Math.round(((stepIndex + 1) / STEPS.length) * 100);
  const currentValue = answers[step.key];
  const canProceed = currentValue.trim().length > 0;

  const setValue = (val: string) => {
    setProgress((prev) => ({
      ...prev,
      answers: { ...prev.answers, [step.key]: val },
    }));
  };

  const handleNext = () => {
    if (!canProceed) return;
    if (stepIndex < STEPS.length - 1) {
      setProgress((prev) => ({ ...prev, stepIndex: prev.stepIndex + 1 }));
    }
  };

  const handlePrevious = () => {
    if (stepIndex > 0) {
      setProgress((prev) => ({ ...prev, stepIndex: prev.stepIndex - 1 }));
    }
  };

  const handleFinish = async () => {
    if (!canProceed) return;
    setError(null);
    setHandoffStep(1);

    try {
      // Stage 1: Saving preferences
      await new Promise((resolve) => setTimeout(resolve, 600));
      setHandoffStep(2);

      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `Failed to save onboarding (${res.status})`);
      }

      // Stage 3: Hand-off to assessment engine
      setHandoffStep(3);
      await new Promise((resolve) => setTimeout(resolve, 700));

      window.localStorage.removeItem(STORAGE_KEY);
      router.push("/assessment");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setHandoffStep(null);
    }
  };

  // Keyboard shortcut: Press Enter to proceed
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canProceed) {
      e.preventDefault();
      if (stepIndex < STEPS.length - 1) {
        handleNext();
      } else {
        handleFinish();
      }
    }
  };

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-observatory-base px-4 text-steel-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-telemetry-cyan border-t-transparent font-mono" />
      </div>
    );
  }

  // CONSIDERED HAND-OFF LOADING SCREEN (Replacing generic blank page)
  if (handoffStep !== null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono telemetry-grid-bg">
        <Card variant="glow" padding="lg" className="w-full max-w-md text-center flex flex-col items-center gap-6">
          <div className="relative flex items-center justify-center">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-telemetry-cyan border-t-transparent" />
            <span className="absolute text-xl">⚙️</span>
          </div>

          <div>
            <Badge variant="info" className="mb-2">
              System Hand-off in Progress
            </Badge>
            <h2 className="text-lg font-bold text-white">
              Building Your Diagnostic Assessment
            </h2>
            <p className="text-xs text-steel-400 font-sans mt-1">
              Tailoring the 10-question evaluation to your target goal: &quot;{answers.goal || "GenAI Readiness"}&quot;
            </p>
          </div>

          <div className="w-full bg-observatory-base p-4 rounded-2xl border border-steel-800 text-left font-mono text-[11px] space-y-2">
            <div className={`flex items-center gap-2 ${handoffStep >= 1 ? "text-precision-emerald font-bold" : "text-steel-400"}`}>
              <span>{handoffStep >= 1 ? "✓" : "○"}</span>
              <span>1. Saved profile preferences & time budget ({answers.time_budget_minutes_per_day || "60"}m/day)</span>
            </div>
            <div className={`flex items-center gap-2 ${handoffStep >= 2 ? "text-precision-emerald font-bold" : "text-steel-400"}`}>
              <span>{handoffStep >= 2 ? "✓" : "○"}</span>
              <span>2. Synthesized 8-domain competency baseline matrix</span>
            </div>
            <div className={`flex items-center gap-2 ${handoffStep >= 3 ? "text-telemetry-cyan font-bold animate-pulse" : "text-steel-400"}`}>
              <span>{handoffStep >= 3 ? "⚡" : "○"}</span>
              <span>3. Handing off to Skill Assessment Engine…</span>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-observatory-base text-steel-50 font-mono telemetry-grid-bg">
      {/* Onboarding Header with Considered Telemetry Progress */}
      <header className="sticky top-0 z-10 border-b border-steel-800 bg-observatory-panel/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-telemetry-cyan shadow-telemetry-cyan" />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                Diagnostic Initialization
              </span>
              <h1 className="text-xs font-bold text-white mt-0.5">
                Question {stepIndex + 1} of {STEPS.length}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-steel-400 font-tabular">
              {progressPercent}% Complete
            </span>
          </div>
        </div>

        {/* Animated Progress Bar */}
        <div className="h-1 w-full bg-steel-900">
          <div
            className="h-full bg-telemetry-cyan shadow-telemetry-cyan transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </header>

      {/* Main Conversational Question Container */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 sm:px-6 py-12">
        <div
          key={stepIndex}
          className="motion-slide-fade-in"
          onKeyDown={handleKeyDown}
        >
          <Card variant="bordered" padding="lg" className="shadow-2xl">
            <div className="mb-6">
              <span className="text-[10px] font-bold uppercase tracking-wider text-steel-400 bg-steel-900 px-2 py-0.5 rounded border border-steel-800">
                Step 0{stepIndex + 1} • {step.key.toUpperCase()}
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-white mt-2 leading-tight">
                {step.question}
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-steel-400 font-sans leading-relaxed">
                {step.subtext}
              </p>
            </div>

            {/* Render Question Input Types */}
            <div className="mt-6">
              {step.type === "text" && (
                <Input
                  type="text"
                  autoFocus
                  value={currentValue}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={step.placeholder}
                  className="py-3 text-sm"
                />
              )}

              {step.type === "goal_select" && (
                <div className="flex flex-col gap-4">
                  <Input
                    type="text"
                    autoFocus
                    value={currentValue}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={step.placeholder}
                    className="py-3 text-sm"
                  />
                  {step.suggestions && (
                    <div>
                      <span className="text-[11px] text-steel-400 font-semibold uppercase tracking-wider mb-2 block">
                        Or pick a suggested target:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {step.suggestions.map((sug) => (
                          <button
                            key={sug}
                            type="button"
                            onClick={() => setValue(sug)}
                            className={`text-xs font-mono px-3 py-1.5 rounded-xl border transition ${
                              currentValue === sug
                                ? "bg-telemetry-cyan/10 border-telemetry-cyan text-telemetry-cyan font-bold"
                                : "bg-observatory-base border-steel-800 text-steel-300 hover:border-steel-700 hover:text-white"
                            }`}
                          >
                            + {sug}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step.type === "select" && (
                <div className="grid grid-cols-1 gap-3">
                  {step.options?.map((option) => {
                    const isSelected = currentValue === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setValue(option.value)}
                        className={`w-full rounded-2xl border p-4 text-left font-mono transition flex items-start gap-4 ${
                          isSelected
                            ? "border-telemetry-cyan bg-telemetry-cyan/10 text-white font-bold ring-1 ring-telemetry-cyan/40 shadow-telemetry-cyan"
                            : "border-steel-800 bg-observatory-base text-steel-300 hover:border-steel-700 hover:text-white"
                        }`}
                      >
                        {option.icon && <span className="text-xl shrink-0 mt-0.5">{option.icon}</span>}
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-xs font-bold ${isSelected ? "text-telemetry-cyan" : "text-white"}`}>
                            {option.label}
                          </span>
                          {option.sublabel && (
                            <span className="text-[11px] font-sans text-steel-400 leading-normal">
                              {option.sublabel}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-vulnerability-crimson/40 bg-vulnerability-crimson/10 p-3 text-xs text-rose-300">
                <span className="font-bold">Setup Error: </span>
                {error}
              </div>
            )}
          </Card>

          {/* Action Bar */}
          <footer className="mt-8 flex items-center justify-between">
            <Button
              variant="secondary"
              onClick={handlePrevious}
              disabled={stepIndex === 0}
            >
              ← Previous
            </Button>

            <span className="hidden sm:inline-block text-[11px] text-steel-400 font-mono">
              Press <kbd className="px-1.5 py-0.5 rounded border border-steel-800 bg-steel-900 text-steel-400">Enter ↵</kbd> to continue
            </span>

            {stepIndex < STEPS.length - 1 ? (
              <Button
                variant="primary"
                onClick={handleNext}
                disabled={!canProceed}
              >
                Next Step →
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleFinish}
                disabled={!canProceed}
              >
                Launch My Diagnostic Assessment →
              </Button>
            )}
          </footer>
        </div>
      </main>
    </div>
  );
}
