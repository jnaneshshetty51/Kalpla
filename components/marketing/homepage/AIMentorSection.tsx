import { Card } from "@/components/ui/Card";
import { ChatBubbleMockup } from "./ChatBubbleMockup";

const MENTOR_MESSAGES = [
  {
    role: "assistant" as const,
    content:
      "Hello! I am your AI Tutor companion for RAG Pipeline Design. Ask me any clarifying questions, request practical code breakdowns, or ask for real-world application analogies!",
  },
  { role: "user" as const, content: "What is RAG?" },
  { role: "assistant" as const, content: "RAG stands for Retrieval-Augmented Generation." },
];

// "Practice Questions" — not "Interview Practice": mock interviews are
// 100% human-delivered in this cohort (see the Placement Assistance
// section below), and the AI mentor must never imply it conducts them.
const FEATURES = [
  "Explains concepts 24/7, in a different way if the first explanation didn't land",
  "Reviews your code against real production rubrics, with a confidence score on every grade",
  "Generates practice questions tied to your personal skill gaps",
  "Solves doubts inline, grounded in the exact lesson you're on",
  "Sends daily study nudges based on where you actually are",
];

export function AIMentorSection() {
  return (
    <section className="px-4 sm:px-6 py-20 border-b border-steel-800 bg-observatory-panel/40">
      <div className="mx-auto max-w-5xl">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="font-mono text-xs font-bold text-telemetry-cyan uppercase tracking-widest">
            Meet Your AI Mentor
          </span>
          <h2 className="text-2xl sm:text-3xl font-mono font-bold text-white mt-2">
            Available 24×7 — not a chatbot gimmick, the actual tutor
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <ul className="flex flex-col gap-4">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 font-sans text-sm text-steel-300">
                <span className="mt-0.5 text-precision-emerald shrink-0" aria-hidden="true">✔</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <Card variant="glow" padding="md">
            <div className="flex items-center gap-2 border-b border-steel-800 pb-3 mb-4">
              <span className="h-2 w-2 rounded-full bg-telemetry-cyan animate-pulse" />
              <span className="font-mono text-xs font-bold text-white uppercase">AI Tutor — Live Session</span>
            </div>
            <ChatBubbleMockup messages={MENTOR_MESSAGES} />
          </Card>
        </div>
      </div>
    </section>
  );
}
