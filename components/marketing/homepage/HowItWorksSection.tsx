import { StepTimeline, type TimelineStep } from "./StepTimeline";

const STEPS: TimelineStep[] = [
  {
    step: 1,
    title: "AI Skill Assessment",
    summary: "A mix of multiple-choice, short-answer, and live-code tasks across core GenAI engineering skill areas.",
    detail: [
      "AI-graded within minutes, with a confidence score attached to every grade — not a black box.",
      "Produces a competency score per skill node, not just a single pass/fail number.",
    ],
  },
  {
    step: 2,
    title: "Personalized Roadmap",
    summary: "Your lowest-scoring skill areas are sequenced first, respecting real prerequisite dependencies.",
    detail: [
      "A dependency graph, not a flat list — you won't be asked to learn agents before you understand prompting.",
      "Regenerates as your competency scores change.",
    ],
  },
  {
    step: 3,
    title: "Learn with AI + Experts",
    summary: "An always-on AI tutor for concept-level help, plus weekly live classes and architecture sessions with human mentors.",
    detail: [
      "The AI tutor is grounded in the exact lesson content for the skill node you're on, available 24/7.",
      "Real practitioners lead weekly live classes and biweekly architecture deep-dives — not pre-recorded video.",
    ],
  },
  {
    step: 4,
    title: "Build Real AI Projects",
    summary: "Ship three real, reviewed projects — not toy exercises — each graded against a genuine GenAI engineering rubric.",
    detail: [
      "A prompt-engineering foundation project, a document-grounded RAG chatbot, and a multi-tool AI agent.",
      "AI code review against the project's actual rubric, with a reflection prompt that turns each project into something you can talk about in an interview.",
    ],
  },
  {
    step: 5,
    title: "Prepare for Interviews",
    summary: "A verified public portfolio plus two live mock interviews with a human mentor.",
    detail: [
      "Recruiters see real competency scores and shipped projects — not a certificate of attendance.",
      "Mock interviews are conducted live by a human mentor, not an automated feature.",
    ],
  },
  {
    step: 6,
    title: "Get Placement Assistance",
    summary: "Resume, LinkedIn, and portfolio review, plus employer referrals where we have them — real service, not a guarantee.",
    detail: [
      "We help you get hired — we don't promise it, and we won't pretend otherwise.",
    ],
  },
];

export function HowItWorksSection() {
  return (
    <section className="px-4 sm:px-6 py-20 border-b border-steel-800 bg-observatory-base">
      <div className="mx-auto max-w-3xl">
        <div className="text-center mb-14">
          <span className="font-mono text-xs font-bold text-telemetry-cyan uppercase tracking-widest">
            How It Works
          </span>
          <h2 className="text-2xl sm:text-3xl font-mono font-bold text-white mt-2">
            From your first assessment to a placement-ready portfolio
          </h2>
        </div>

        <StepTimeline steps={STEPS} variant="full" />
      </div>
    </section>
  );
}

export const HOW_IT_WORKS_STEPS = STEPS;
