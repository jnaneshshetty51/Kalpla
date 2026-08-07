import { z } from "zod";
import { resolveModelConfig } from "@/lib/llm/models";
import { executeLLMCallWithCap, UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";
import { LLMMessage } from "@/types/llm";

const ReviewSectionSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string(),
});

const GenAICriterionSchema = z.object({
  name: z.string(),
  met: z.boolean(),
  note: z.string(),
});

const ReflectionFlagSchema = z.object({
  contradicts_code: z.boolean(),
  note: z.string(),
});

export const SubmissionReviewSchema = z.object({
  overall_score: z.number().min(0).max(100),
  logic_correctness: ReviewSectionSchema,
  readability: ReviewSectionSchema,
  optimization_opportunities: ReviewSectionSchema,
  edge_case_handling: ReviewSectionSchema,
  architecture_quality: ReviewSectionSchema.nullable(),
  genai_specific_criteria: z.array(GenAICriterionSchema),
  reflection_flag: ReflectionFlagSchema.nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  is_ambiguous: z.boolean(),
});

export type SubmissionReview = z.infer<typeof SubmissionReviewSchema> & {
  failedValidationAfterRetry?: boolean;
};

export interface ReviewSubmissionParams {
  project: {
    id: string;
    name: string;
    spec: {
      type?: "rag" | "agent" | "general";
      description?: string;
      requirements?: string[];
    };
  };
  code: string;
  reflection?: string;
  testResults?: Array<{ function: string; passed: boolean; error?: string | null }>;
  clarification?: string;
  priorReview?: SubmissionReview | null;
  /** Required for usage-cap enforcement (Prompt 81/84). */
  userId: string;
}

/**
 * GenAI-specific rubric criteria, distinct per project type. This is what
 * differentiates this platform's review from a generic code-quality check
 * (Prompt 23's lib/grading/gradeAttempt.ts, used for assessment tasks) —
 * these are the questions a generic coding rubric would never ask.
 */
const GENAI_RUBRIC_BY_TYPE: Record<string, string> = {
  rag: `This is a RAG (Retrieval-Augmented Generation) project. In addition to general code quality, specifically evaluate and list as genai_specific_criteria:
- "Chunking strategy reasonableness": is the chunking approach (size, overlap, boundary handling) sound for real document retrieval, not just passing the literal test cases?
- "Retrieval relevance": would the similarity/scoring logic actually surface the most relevant chunks in practice?
- "Prompt construction quality": if the code assembles a prompt from retrieved context, is it structured to keep the model grounded in that context?`,
  agent: `This is an agentic project. In addition to general code quality, specifically evaluate and list as genai_specific_criteria:
- "Tool-use correctness": does the code correctly decide when/which tool to invoke based on the available signal?
- "Planning logic": is there a coherent reasoning/decision structure, not just a flat if-chain that happens to pass the given tests?
- "Error handling on tool failure": does the code account for a tool call failing or returning unexpected data, or would it crash/silently misbehave?`,
  general: `This is a general coding project — no GenAI-specific architecture to evaluate. Return an empty genai_specific_criteria array and null architecture_quality.`,
};

const REVIEW_SYSTEM_PROMPT_BASE = `You are a senior GenAI engineering reviewer grading a student project submission for a training platform whose differentiator is GenAI-specific feedback, not generic code review.

Evaluate the submission across these sections, each with its own 0-100 score and summary:
- logic_correctness: does the code actually do what's required?
- readability: naming, structure, clarity.
- optimization_opportunities: meaningful inefficiencies or missed simplifications (not nitpicks).
- edge_case_handling: does it handle boundary/empty/malformed inputs sensibly?
- architecture_quality: for RAG/agent projects, overall system design quality (null for general projects).

If a student reflection is provided, cross-check it against what the code actually does. Flag reflection_flag.contradicts_code = true if the reflection claims something the code doesn't actually do (e.g. "I added error handling for empty input" but the code has no such check) — this is a signal of possible misunderstanding, not just a writing-quality issue. If no reflection is provided, or it's consistent with the code, set reflection_flag to null.

CRITICAL OUTPUT INSTRUCTIONS:
Reply ONLY with a single valid JSON object matching exactly this schema:
{
  "overall_score": <0-100>,
  "logic_correctness": {"score": <0-100>, "summary": "<...>"},
  "readability": {"score": <0-100>, "summary": "<...>"},
  "optimization_opportunities": {"score": <0-100>, "summary": "<...>"},
  "edge_case_handling": {"score": <0-100>, "summary": "<...>"},
  "architecture_quality": {"score": <0-100>, "summary": "<...>"} or null,
  "genai_specific_criteria": [{"name": "<...>", "met": <bool>, "note": "<...>"}],
  "reflection_flag": {"contradicts_code": <bool>, "note": "<...>"} or null,
  "confidence": "high" | "medium" | "low",
  "is_ambiguous": <true if the submission is a genuinely borderline call relative to the rubric that a human should double-check, false otherwise>
}

DO NOT wrap output in markdown code blocks. Output RAW JSON ONLY.`;

function buildUserPrompt(params: ReviewSubmissionParams): string {
  const { project, code, reflection, testResults, clarification, priorReview } = params;
  const testSummary = testResults?.length
    ? testResults.map((t) => `- ${t.function}: ${t.passed ? "PASS" : `FAIL (${t.error || "output mismatch"})`}`).join("\n")
    : "No test results available.";

  let prompt = `Project: ${project.name}
Description: ${project.spec.description || "N/A"}
Requirements:
${(project.spec.requirements || []).map((r) => `- ${r}`).join("\n")}

Automated test results:
${testSummary}

Submitted code:
\`\`\`python
${code || "(empty submission)"}
\`\`\`

Student's written reflection ("what was hardest, what would you do differently"):
"""
${reflection && reflection.trim() ? reflection.trim() : "(no reflection provided)"}
"""
`;

  if (clarification && priorReview) {
    prompt += `
--- RE-REVIEW REQUEST ---
The student disagreed with a prior review and provided this clarification:
"""
${clarification}
"""

Prior review summary: overall_score=${priorReview.overall_score}, logic_correctness="${priorReview.logic_correctness.summary}"

Re-evaluate the submission taking this clarification into account. If the clarification legitimately explains a flagged issue, adjust the relevant section's score and summary accordingly. Do not simply agree to be agreeable — only revise if the clarification is technically valid.
`;
  }

  return prompt;
}

function parseAndValidate(
  rawContent: string,
): { success: true; data: z.infer<typeof SubmissionReviewSchema> } | { success: false; error: string } {
  try {
    let cleaned = rawContent.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    }
    const json = JSON.parse(cleaned);
    const validation = SubmissionReviewSchema.safeParse(json);
    if (validation.success) return { success: true, data: validation.data };
    return {
      success: false,
      error: validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  } catch (err) {
    return { success: false, error: `JSON syntax error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function fallbackReview(code: string): z.infer<typeof SubmissionReviewSchema> {
  const isEmpty = !code || !code.trim();
  const score = isEmpty ? 0 : 50;
  const section = (summary: string) => ({ score, summary });

  return {
    overall_score: score,
    logic_correctness: section(
      isEmpty ? "No code was submitted." : "Unable to complete automated review; manual check recommended.",
    ),
    readability: section(isEmpty ? "N/A — empty submission." : "Not evaluated due to a grading error."),
    optimization_opportunities: section("Not evaluated due to a grading error."),
    edge_case_handling: section("Not evaluated due to a grading error."),
    architecture_quality: null,
    genai_specific_criteria: [],
    reflection_flag: null,
    confidence: "low",
    is_ambiguous: true,
  };
}

/**
 * Reviews a project submission using GenAI-specific rubric templates
 * (Prompt 62) — genuinely distinct from lib/grading/gradeAttempt.ts's
 * general assessment-task rubric (Prompt 23). Uses the expensive tier:
 * this is a one-time, high-value review per submission, not a
 * high-frequency simple grading call.
 */
export async function reviewSubmission(
  params: ReviewSubmissionParams,
): Promise<SubmissionReview> {
  const projectType = params.project.spec.type || "general";
  const systemPrompt = `${REVIEW_SYSTEM_PROMPT_BASE}\n\n${GENAI_RUBRIC_BY_TYPE[projectType] || GENAI_RUBRIC_BY_TYPE.general}`;
  const userPrompt = buildUserPrompt(params);

  const initialMessages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const resolvedConfig = resolveModelConfig("expensive");

  try {
    const response1 = await executeLLMCallWithCap({
      userId: params.userId,
      provider: resolvedConfig.provider,
      modelId: resolvedConfig.modelId,
      feature: "submission_review",
      messages: initialMessages,
      maxTokens: 2000,
      temperature: 0.2,
    });

    const parsed1 = parseAndValidate(response1.content);
    if (parsed1.success) {
      return { ...parsed1.data, failedValidationAfterRetry: false };
    }

    console.warn(`[lib/grading/reviewSubmission] Attempt 1 validation failed: ${parsed1.error}. Retrying...`);

    const retryMessages: LLMMessage[] = [
      ...initialMessages,
      { role: "assistant", content: response1.content },
      {
        role: "user",
        content: `CRITICAL ERROR: Your previous response failed JSON schema validation: ${parsed1.error}. Respond ONLY with a valid, unformatted JSON object matching the required schema.`,
      },
    ];

    const response2 = await executeLLMCallWithCap({
      userId: params.userId,
      provider: resolvedConfig.provider,
      modelId: resolvedConfig.modelId,
      feature: "submission_review",
      messages: retryMessages,
      maxTokens: 2000,
      temperature: 0.1,
    });

    const parsed2 = parseAndValidate(response2.content);
    if (parsed2.success) {
      return { ...parsed2.data, failedValidationAfterRetry: false };
    }

    console.error(`[lib/grading/reviewSubmission] Retry validation also failed: ${parsed2.error}. Using fallback.`);
  } catch (err) {
    // A usage-cap block must propagate (Prompt 84), not be swallowed into
    // a fake "50%, unable to complete automated review" fallback score.
    if (err instanceof UsageCapExceededError) {
      throw err;
    }
    console.error("[lib/grading/reviewSubmission] LLM call failed:", err);
  }

  return { ...fallbackReview(params.code), failedValidationAfterRetry: true };
}
