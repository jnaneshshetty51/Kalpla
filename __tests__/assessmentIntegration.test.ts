import { describe, it, expect } from "vitest";
import { gradeAssessmentAttempt } from "@/lib/assessment/grader";
import { computeNodeScore } from "@/lib/skillGraph/scoring";

describe("Assessment Workflow Integration & Stubbed Grading", () => {
  it("grades multiple choice assessment tasks deterministically without calling LLM", async () => {
    const mcTask = {
      id: "task-mc-1",
      skill_node_id: "node-1",
      type: "multiple_choice",
      prompt: "What is temperature in LLM sampling?",
      rubric: {
        correct_answer: "Option B",
        options: ["Option A", "Option B", "Option C"],
      },
    };

    const resultCorrect = await gradeAssessmentAttempt({
      task: mcTask,
      response: "Option B",
    });

    expect(resultCorrect.ai_score).toBe(100);
    expect(resultCorrect.confidence).toBe(1.0);
    expect(resultCorrect.ai_feedback.is_correct).toBe(true);

    const resultIncorrect = await gradeAssessmentAttempt({
      task: mcTask,
      response: "Option A",
    });

    expect(resultIncorrect.ai_score).toBe(0);
    expect(resultIncorrect.confidence).toBe(1.0);
    expect(resultIncorrect.ai_feedback.is_correct).toBe(false);
  });

  it("calculates recency-weighted node competency scores correctly across attempt history", () => {
    const attempts = [
      {
        id: "1",
        ai_score: 60,
        confidence: 0.9,
        created_at: "2026-08-01T10:00:00Z",
      },
      {
        id: "2",
        ai_score: 80,
        confidence: 0.9,
        created_at: "2026-08-02T10:00:00Z",
      },
      {
        id: "3",
        ai_score: 100,
        confidence: 0.9,
        created_at: "2026-08-03T10:00:00Z",
      },
    ];

    const score = computeNodeScore(attempts);
    // Weighted formula: 50% * 100 + 30% * 80 + 20% * 60 = 50 + 24 + 12 = 86
    expect(score).toBe(86);
  });

  it("evaluates open-ended prompt tasks with stubbed grading output", async () => {
    const promptTask = {
      id: "task-prompt-1",
      skill_node_id: "node-2",
      type: "short_answer",
      prompt: "Explain how vector embeddings represent semantic meaning.",
      rubric: { key_points: ["Vector space", "Cosine similarity"] },
    };

    const result = await gradeAssessmentAttempt({
      task: promptTask,
      response:
        "Vector embeddings represent text as dense vectors in high-dimensional space where semantic similarity corresponds to vector distance.",
    });

    expect(result.ai_score).toBeGreaterThanOrEqual(70);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result.ai_feedback.summary).toBeDefined();
  });
});
