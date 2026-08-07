import { gradeAttemptWithLLM } from "@/lib/grading/gradeAttempt";
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";

export interface GradingResult {
  ai_score: number;
  ai_feedback: Record<string, unknown>;
  confidence: number;
  confidence_level: "high" | "medium" | "low";
  failed_validation?: boolean;
}

export interface TaskGradingInput {
  task: {
    id: string;
    skill_node_id: string;
    type: string;
    prompt: string;
    rubric: Record<string, unknown>;
  };
  response: unknown;
  /** Required for the LLM-graded branch (usage-cap enforcement, Prompt 81/84) — not needed for deterministic multiple_choice grading. */
  userId?: string;
}

/**
 * Evaluates an assessment task attempt.
 * For multiple choice tasks, evaluates choice against rubric deterministically
 * (no LLM call, so no usage-cap concern). For open-ended/coding/prompt tasks,
 * delegates to gradeAttemptWithLLM, which is cap-enforced.
 */
export async function gradeAssessmentAttempt({
  task,
  response,
  userId,
}: TaskGradingInput): Promise<GradingResult> {
  const taskType = task.type;
  const rubric = task.rubric || {};

  // Case 1: Multiple Choice Auto-Grading
  if (taskType === "multiple_choice") {
    const correctAnswer = (rubric.correct_answer as string) || "";
    const userChoice =
      typeof response === "string" ? response : String(response || "");

    const cleanUserChoice = userChoice.trim().toUpperCase();
    const cleanCorrectAnswer = correctAnswer.trim().toUpperCase();

    const isCorrect =
      cleanUserChoice === cleanCorrectAnswer ||
      cleanUserChoice.startsWith(cleanCorrectAnswer) ||
      (cleanCorrectAnswer.length === 1 &&
        cleanUserChoice.startsWith(cleanCorrectAnswer));

    if (isCorrect) {
      return {
        ai_score: 100,
        confidence: 1.0,
        confidence_level: "high",
        failed_validation: false,
        ai_feedback: {
          summary: "Correct! Outstanding understanding of the core concept.",
          is_correct: true,
          correct_answer: correctAnswer,
        },
      };
    } else {
      return {
        ai_score: 0,
        confidence: 1.0,
        confidence_level: "high",
        failed_validation: false,
        ai_feedback: {
          summary: `Incorrect selection. The correct option was ${correctAnswer}.`,
          is_correct: false,
          correct_answer: correctAnswer,
        },
      };
    }
  }

  // Case 2: Open-ended, Prompt Writing, and Coding Tasks -> Grade via LLM Engine
  try {
    const llmGrading = await gradeAttemptWithLLM({ task, response, userId });

    const confidenceValue =
      llmGrading.confidence === "high"
        ? 0.95
        : llmGrading.confidence === "medium"
          ? 0.8
          : 0.6;

    return {
      ai_score: llmGrading.score,
      confidence: confidenceValue,
      confidence_level: llmGrading.confidence,
      failed_validation: !!llmGrading.failedValidationAfterRetry,
      ai_feedback: {
        summary: llmGrading.feedback,
        criteria_breakdown: llmGrading.criteriaBreakdown,
        confidence_level: llmGrading.confidence,
      },
    };
  } catch (err) {
    // A usage-cap block is a distinct, user-actionable case (Prompt 84) —
    // must NOT be swallowed into the generic "fallback parameters" grade,
    // which would silently hand back a fake passing-ish score instead of
    // telling the user they've hit their plan's limit.
    if (err instanceof UsageCapExceededError) {
      throw err;
    }

    console.error("Error in gradeAssessmentAttempt AI grading:", err);
    return {
      ai_score: 70,
      confidence: 0.6,
      confidence_level: "low",
      failed_validation: true,
      ai_feedback: {
        summary: "Attempt evaluated with fallback parameters.",
        criteria_breakdown: [],
      },
    };
  }
}
