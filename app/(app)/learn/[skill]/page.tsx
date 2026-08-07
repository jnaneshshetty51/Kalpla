"use client";

import React, { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import { CheckUnderstanding } from "@/components/learn/CheckUnderstanding";
import {
  UsageCapExceededNotice,
  UsageWarningBanner,
  UsageCapExceededDetails,
  UsageWarningDetails,
  parseUsageWarningHeaders,
} from "@/components/billing/UsageCapNotice";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface SkillNode {
  id: string;
  name: string;
  category: string;
  difficulty: number;
  description?: string;
}

interface LessonSection {
  heading: string;
  content?: string;
  bullets?: string[];
  code?: string;
  language?: string;
}

interface LessonData {
  title: string;
  category: string;
  difficulty: number;
  summary: string;
  sections: LessonSection[];
}

interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

export default function SkillLearningPage({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  const resolvedParams = use(params);
  const skillId = resolvedParams.skill;

  const [node, setNode] = useState<SkillNode | null>(null);
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isMarkingComplete, setIsMarkingComplete] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [newlyUnlocked, setNewlyUnlocked] = useState<
    Array<{ skillNodeId: string; nodeName: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [capExceeded, setCapExceeded] = useState<UsageCapExceededDetails | null>(null);
  const [usageWarning, setUsageWarning] = useState<UsageWarningDetails | null>(null);

  // Mobile layout tab switcher state: "lesson" | "tutor"
  // Justification: On screens < 1024px, side-by-side columns squeeze line lengths to <30ch (unreadable for long-form reading).
  // A tab toggle gives 100% viewport width to whichever view the learner is focused on.
  const [mobileTab, setMobileTab] = useState<"lesson" | "tutor">("lesson");

  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/learn/${encodeURIComponent(skillId)}`);
        if (!response.ok) {
          throw new Error(`Failed to load module data (${response.status})`);
        }

        const json = await response.json();
        if (isMounted) {
          setNode(json.node);
          setLesson(json.lesson);

          if (json.conversation_history && json.conversation_history.length > 0) {
            setMessages(json.conversation_history);
          } else {
            setMessages([
              {
                role: "assistant",
                content: `Hello! I am your AI Tutor companion for **${json.node.name}**. Ask me any clarifying questions, request practical code breakdowns, or ask for real-world application analogies!`,
                timestamp: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              },
            ]);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [skillId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const nowTimestamp = () =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const streamTutorTurn = async (
    userVisibleMessage: ChatMessage,
    requestBody: Record<string, unknown>,
  ) => {
    if (isSending || !node) return;

    setCapExceeded(null);
    setUsageWarning(null);
    setMessages((prev) => [...prev, userVisibleMessage]);
    setIsSending(true);

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", timestamp: nowTimestamp() },
    ]);

    try {
      const response = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 429) {
        const details = await response.json();
        setCapExceeded(details);
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error(`Tutor endpoint returned error (${response.status})`);
      }

      const warning = parseUsageWarningHeaders(response);
      if (warning) setUsageWarning(warning);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        accumulated += decoder.decode(value, { stream: true });
        const streamedSoFar = accumulated;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            ...next[next.length - 1],
            content: streamedSoFar,
          };
          return next;
        });
      }
    } catch (err) {
      console.error("Tutor chat stream error:", err);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          content:
            next[next.length - 1].content ||
            "I'm here to help! Let's explore this concept step-by-step.",
        };
        return next;
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const messageText = customPrompt || input.trim();
    if (!messageText || isSending || !node) return;
    if (!customPrompt) setInput("");

    await streamTutorTurn(
      { role: "user", content: messageText, timestamp: nowTimestamp() },
      { skill_node_id: node.id, message: messageText },
    );
  };

  const handleExplainDifferently = async (priorExplanation: string) => {
    if (isSending || !node) return;

    await streamTutorTurn(
      {
        role: "user",
        content: "Could you explain that using a different approach, like an analogy?",
        timestamp: nowTimestamp(),
      },
      {
        skill_node_id: node.id,
        re_prompt_mode: "explain_differently",
        prior_explanation: priorExplanation,
      },
    );
  };

  const handleExplicitMarkComplete = async () => {
    if (!node || isMarkingComplete) return;

    try {
      setIsMarkingComplete(true);
      const response = await fetch("/api/learn/mark-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill_node_id: node.id,
          score: 85.0,
          source: "manual_button",
        }),
      });

      if (response.ok) {
        setIsCompleted(true);
        const json = await response.json();
        const unlocked = json?.result?.newlyUnlockedNodes;
        if (Array.isArray(unlocked) && unlocked.length > 0) {
          setNewlyUnlocked(unlocked);
        }
      }
    } catch (err) {
      console.error("Explicit mark complete error:", err);
    } finally {
      setIsMarkingComplete(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono telemetry-grid-bg">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-telemetry-cyan border-t-transparent shadow-telemetry-cyan" />
          <div>
            <h2 className="text-sm font-bold text-white">Loading Skill Module Workspace</h2>
            <p className="text-xs text-steel-400 font-sans mt-1">
              Fetching lesson content &amp; initializing AI tutor session…
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !lesson || !node) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-observatory-base px-4 text-steel-50 font-mono">
        <Card variant="bordered" padding="lg" className="max-w-md text-center">
          <h2 className="text-lg font-bold text-vulnerability-crimson">
            Module Telemetry Error
          </h2>
          <p className="mt-2 text-xs text-steel-400 font-sans leading-relaxed">
            {error || "Unable to load lesson module."}
          </p>
          <Link
            href="/roadmap"
            className="mt-6 inline-block rounded-xl bg-telemetry-cyan px-5 py-2.5 font-mono text-xs font-bold text-observatory-base shadow-telemetry-cyan transition hover:bg-white"
          >
            ← Return to Roadmap
          </Link>
        </Card>
      </div>
    );
  }

  const discussionQuestions =
    lesson.sections.find((s) => s.bullets && s.bullets.length > 0)?.bullets || [
      `How does ${node.name} impact production latency and system reliability?`,
      `What fallback mechanisms would you put in place for ${node.name}?`,
    ];

  return (
    <div className="min-h-screen bg-observatory-base text-steel-50 font-mono telemetry-grid-bg">
      {/* Top Header Bar — SHARED VISUAL THREAD WITH ROADMAP CARD */}
      <header className="sticky top-0 z-20 border-b border-steel-800 bg-observatory-panel/90 px-4 sm:px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/roadmap"
              className="text-xs font-mono text-steel-400 hover:text-telemetry-cyan transition underline"
            >
              ← Back to Roadmap
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-telemetry-cyan">
                  {node.category}
                </span>
                <span className="text-steel-400">•</span>
                <span className="text-[10px] text-steel-400 font-mono">
                  Level {node.difficulty}
                </span>
              </div>
              <h1 className="text-lg font-bold text-white leading-tight mt-0.5">
                {lesson.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant={isCompleted ? "secondary" : "primary"}
              size="sm"
              onClick={handleExplicitMarkComplete}
              disabled={isMarkingComplete || isCompleted}
            >
              {isCompleted
                ? "Completed ✓"
                : isMarkingComplete
                ? "Saving…"
                : "Mark Module Complete ✓"}
            </Button>
          </div>
        </div>
      </header>

      {/* MOBILE TAB TOGGLE BAR (< 1024px) */}
      <div className="lg:hidden px-4 pt-4 flex gap-2 font-mono text-xs border-b border-steel-800 pb-3">
        <button
          onClick={() => setMobileTab("lesson")}
          className={`flex-1 py-2.5 rounded-xl border text-center font-bold transition ${
            mobileTab === "lesson"
              ? "bg-telemetry-cyan/10 border-telemetry-cyan text-telemetry-cyan"
              : "bg-observatory-panel border-steel-800 text-steel-400"
          }`}
        >
          📖 Lesson Article
        </button>
        <button
          onClick={() => setMobileTab("tutor")}
          className={`flex-1 py-2.5 rounded-xl border text-center font-bold transition ${
            mobileTab === "tutor"
              ? "bg-telemetry-cyan/10 border-telemetry-cyan text-telemetry-cyan"
              : "bg-observatory-panel border-steel-800 text-steel-400"
          }`}
        >
          🤖 AI Tutor Companion
        </button>
      </div>

      {/* Unlock Moment — the one genuinely celebratory beat in this app,
          reserved for something the user actually earned (a downstream
          node's prerequisites just became satisfied), not decoration.
          key={} on the wrapper so re-completing a lesson that unlocks
          something new retriggers the motion instead of only playing once. */}
      {newlyUnlocked.length > 0 && (
        <div
          key={newlyUnlocked.map((n) => n.skillNodeId).join(",")}
          className="mx-auto max-w-7xl px-4 sm:px-6 pt-4 motion-pop-in"
        >
          <div className="rounded-2xl border border-precision-emerald/40 bg-precision-emerald/5 p-4 telemetry-glow-emerald flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-precision-emerald/15 text-xl">
              🔓
            </div>
            <div className="flex-1">
              <p className="font-mono text-sm font-bold text-white">
                {newlyUnlocked.length === 1
                  ? "New skill unlocked"
                  : `${newlyUnlocked.length} new skills unlocked`}
              </p>
              <p className="text-xs text-steel-300 font-sans mt-0.5">
                {newlyUnlocked.map((n) => n.nodeName).join(", ")} — ready whenever you are.
              </p>
            </div>
            <Link
              href={`/learn/${newlyUnlocked[0].skillNodeId}`}
              className="shrink-0 rounded-xl bg-precision-emerald px-4 py-2 font-mono text-xs font-bold text-observatory-base transition hover:bg-emerald-400"
            >
              Start →
            </Link>
            <button
              onClick={() => setNewlyUnlocked([])}
              className="shrink-0 text-steel-400 hover:text-steel-300 transition text-lg leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Two-Panel Layout Container */}
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:h-[calc(100vh-140px)]">
          {/* LEFT PANEL: Scrollable Lesson Content */}
          <Card
            variant="bordered"
            padding="lg"
            className={`flex flex-col overflow-y-auto max-w-prose mx-auto lg:max-w-none w-full ${
              mobileTab === "lesson" ? "block" : "hidden lg:flex"
            }`}
          >
            <div className="border-b border-steel-800 pb-5">
              <span className="text-[10px] font-bold text-telemetry-cyan uppercase tracking-widest">
                Interactive Module Curriculum
              </span>
              <h2 className="mt-1 text-2xl font-bold text-white">
                {lesson.title}
              </h2>
              <p className="mt-2 text-xs sm:text-sm font-sans text-steel-300 leading-relaxed">
                {lesson.summary}
              </p>
            </div>

            {/* Render Lesson Sections with Typographic Care */}
            <div className="mt-6 flex flex-col gap-8 text-steel-200">
              {lesson.sections.map((section, idx) => (
                <div key={idx} className="flex flex-col gap-3">
                  <h3 className="text-sm font-bold text-telemetry-cyan">
                    {section.heading}
                  </h3>

                  {section.content && (
                    <p className="text-xs sm:text-sm font-sans text-steel-300 leading-relaxed whitespace-pre-wrap">
                      {section.content}
                    </p>
                  )}

                  {section.bullets && (
                    <ul className="flex flex-col gap-2 pl-4 text-xs sm:text-sm font-sans text-steel-300 list-disc">
                      {section.bullets.map((b, bIdx) => (
                        <li key={bIdx}>{b}</li>
                      ))}
                    </ul>
                  )}

                  {section.code && (
                    <div className="relative overflow-hidden rounded-xl border border-steel-800 bg-observatory-base p-4 font-mono text-xs shadow-inner">
                      <pre className="overflow-x-auto text-precision-emerald">
                        <code>{section.code}</code>
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* EMBEDDED INLINE CHECK YOUR UNDERSTANDING COMPONENT */}
            <div className="mt-10 border-t border-steel-800 pt-8">
              <CheckUnderstanding
                skillNodeId={node.id}
                questions={discussionQuestions}
                onComplete={() => setIsCompleted(true)}
              />
            </div>
          </Card>

          {/* RIGHT PANEL: Resumable AI Tutor Chat */}
          <Card
            variant="glow"
            padding="md"
            className={`flex flex-col overflow-hidden w-full ${
              mobileTab === "tutor" ? "block" : "hidden lg:flex"
            }`}
          >
            {/* Tutor Header */}
            <div className="flex items-center justify-between border-b border-steel-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-telemetry-cyan/20 text-telemetry-cyan border border-telemetry-cyan/40 font-bold">
                  🤖
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">
                    AI Tutor Companion
                  </h3>
                  <p className="text-[10px] text-steel-400 font-sans">
                    Session for {node.name}
                  </p>
                </div>
              </div>

              <Badge variant="mastery" size="sm">
                Active Tutor
              </Badge>
            </div>

            {/* Scrollable Message List — role="log" + aria-live so a screen
                reader hears each new message (and the streamed growth of
                the current one) without the whole region being
                re-announced on every token. */}
            <div
              className="flex-1 overflow-y-auto my-4 flex flex-col gap-4 pr-2"
              role="log"
              aria-live="polite"
              aria-label="Conversation with AI tutor"
            >
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col gap-1 max-w-[85%] ${
                    msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                  }`}
                >
                  <div
                    className={`rounded-2xl p-3.5 text-xs font-mono leading-relaxed ${
                      msg.role === "user"
                        ? "bg-telemetry-cyan font-bold text-observatory-base shadow-telemetry-cyan rounded-br-none"
                        : "bg-observatory-base border border-steel-800 text-steel-200 rounded-bl-none shadow-inner"
                    }`}
                  >
                    <span className="sr-only">{msg.role === "user" ? "You said: " : "AI Tutor said: "}</span>
                    {msg.content ? (
                      <>
                        {msg.content}
                        {/* Streaming cursor — only while tokens for this
                            exact message are still arriving, distinct from
                            "done." Answers the question raw growing text
                            alone doesn't: is it still thinking, or finished
                            and just short? */}
                        {isSending && idx === messages.length - 1 && (
                          <span className="inline-block w-[2px] h-3 -mb-0.5 ml-0.5 bg-telemetry-cyan animate-pulse" />
                        )}
                      </>
                    ) : isSending && idx === messages.length - 1 ? (
                      <span className="inline-flex items-center gap-1.5 text-steel-400">
                        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-telemetry-cyan" />
                        AI Tutor is analyzing module context…
                      </span>
                    ) : null}
                  </div>

                  {/* PROMINENT "EXPLAIN DIFFERENTLY" ACTION BUTTON */}
                  {msg.role === "assistant" &&
                    idx === messages.length - 1 &&
                    !isSending &&
                    msg.content && (
                      <button
                        onClick={() => handleExplainDifferently(msg.content)}
                        disabled={isSending}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-telemetry-cyan/30 bg-telemetry-cyan/10 px-2.5 py-1 text-[10px] font-mono font-semibold text-telemetry-cyan hover:bg-telemetry-cyan/20 transition mt-1"
                      >
                        💡 Explain Differently (Use Analogy)
                      </button>
                    )}

                  {msg.timestamp && (
                    <span className="text-[9px] text-steel-400 font-mono">
                      {msg.timestamp}
                    </span>
                  )}
                </div>
              ))}

              <div ref={chatBottomRef} />
            </div>

            {capExceeded && (
              <div className="mb-3">
                <UsageCapExceededNotice details={capExceeded} />
              </div>
            )}
            {!capExceeded && usageWarning && (
              <div className="mb-3">
                <UsageWarningBanner warning={usageWarning} />
              </div>
            )}

            {/* Quick Prompt Suggestions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-steel-800 mb-3">
              <button
                onClick={() => handleSendMessage("Explain the code example step-by-step")}
                className="rounded-lg border border-steel-800 bg-observatory-base px-2.5 py-1 text-[10px] font-mono text-steel-400 hover:text-white transition"
              >
                💡 Explain code example
              </button>
              <button
                onClick={() => handleSendMessage("Give me a quick practice problem for this topic")}
                className="rounded-lg border border-steel-800 bg-observatory-base px-2.5 py-1 text-[10px] font-mono text-steel-400 hover:text-white transition"
              >
                ✏️ Practice problem
              </button>
            </div>

            {/* Message Input Box */}
            <div className="flex items-center gap-2">
              <label htmlFor="tutor-chat-input" className="sr-only">
                Message the AI tutor about {node.name}
              </label>
              <input
                id="tutor-chat-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder={
                  capExceeded ? "Upgrade to keep chatting with tutor…" : `Ask AI Tutor about ${node.name}…`
                }
                disabled={!!capExceeded}
                className="flex-1 rounded-xl border border-steel-800 bg-observatory-base px-4 py-3 font-mono text-xs text-white placeholder-steel-400 focus:border-telemetry-cyan focus:outline-none disabled:opacity-50"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSendMessage()}
                disabled={isSending || !input.trim() || !!capExceeded}
              >
                Send
              </Button>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
