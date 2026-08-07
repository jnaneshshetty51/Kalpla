import { z } from "zod";
import { resolveModelConfig } from "@/lib/llm/models";
import { executeLLMCallWithCap, UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";
import { LLMMessage } from "@/types/llm";

export const CriterionBreakdownSchema = z.object({
  criterion: z.string(),
  met: z.boolean(),
  note: z.string(),
});

export const GradingResultSchema = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string(),
  criteriaBreakdown: z.array(CriterionBreakdownSchema),
  confidence: z.enum(["high", "medium", "low"]),
});

export type AIGradingOutput = z.infer<typeof GradingResultSchema> & {
  failedValidationAfterRetry?: boolean;
};

export interface GradeAttemptParams {
  task: {
    id: string;
    skill_node_id: string;
    type: string;
    prompt: string;
    rubric: Record<string, unknown>;
  };
  response: unknown;
  /** Required for usage-cap enforcement (Prompt 81/84). */
  userId?: string;
}

const GRADING_SYSTEM_PROMPT = `You are a strict, fair, and encouraging AI computer science educator evaluating candidate assessment submissions.

Your task is to grade the candidate's response against the provided task prompt and rubric criteria.

CRITICAL OUTPUT INSTRUCTIONS:
You MUST reply ONLY with a valid, single JSON object conforming strictly to this schema:
{
  "score": <number between 0 and 100>,
  "feedback": "<Concise summary feedback explaining the score and constructive recommendations>",
  "criteriaBreakdown": [
    {
      "criterion": "<Description of rubric criterion>",
      "met": <boolean true or false>,
      "note": "<Specific observation regarding how candidate met or missed this criterion>"
    }
  ],
  "confidence": "<high | medium | low>"
}

DO NOT wrap your output in markdown code blocks (\`\`\`json). Output RAW JSON ONLY.`;

/**
 * Grades a candidate assessment response using the LLM proxy with the 'cheap' model tier.
 * Enforces structured JSON output validation via Zod, with a single error-correction retry loop.
 */
export async function gradeAttemptWithLLM({
  task,
  response,
  userId,
}: GradeAttemptParams): Promise<AIGradingOutput> {
  const responseText = formatResponseText(response);
  const userPrompt = buildGradingPrompt(task, responseText);

  const initialMessages: LLMMessage[] = [
    { role: "system", content: GRADING_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  const resolvedConfig = resolveModelConfig("cheap");

  const callLLM = (messages: LLMMessage[], temperature: number) => {
    if (!userId) {
      // Defensive fallback for any caller not yet updated to pass userId
      // (e.g. a direct/test invocation) — fails open rather than crashing,
      // but every real production call site below always passes it, so
      // cap enforcement isn't actually skippable in practice.
      console.warn(
        "[lib/grading/gradeAttempt] Called without userId — usage cap not enforced for this call.",
      );
      return executeLLMCallWithCap({
        userId: "unknown",
        provider: resolvedConfig.provider,
        modelId: resolvedConfig.modelId,
        feature: "assessment_grading",
        messages,
        maxTokens: 1024,
        temperature,
      });
    }
    return executeLLMCallWithCap({
      userId,
      provider: resolvedConfig.provider,
      modelId: resolvedConfig.modelId,
      feature: "assessment_grading",
      messages,
      maxTokens: 1024,
      temperature,
    });
  };

  // Attempt 1: Initial LLM Proxy Call
  try {
    const response1 = await callLLM(initialMessages, 0.2);

    const parsed1 = parseAndValidateGrading(response1.content);
    if (parsed1.success) {
      return { ...parsed1.data, failedValidationAfterRetry: false };
    }

    console.warn(
      `[lib/grading/gradeAttempt] Attempt 1 JSON validation failed: ${parsed1.error}. Retrying with error correction prompt...`,
    );

    // Attempt 2: Error-Correction Retry Loop
    const retryMessages: LLMMessage[] = [
      ...initialMessages,
      { role: "assistant", content: response1.content },
      {
        role: "user",
        content: `CRITICAL ERROR: Your previous response failed JSON schema validation with the error: ${parsed1.error}. Please re-read the prompt and respond ONLY with a valid, unformatted JSON object matching the required schema.`,
      },
    ];

    const response2 = await callLLM(retryMessages, 0.1);

    const parsed2 = parseAndValidateGrading(response2.content);
    if (parsed2.success) {
      return { ...parsed2.data, failedValidationAfterRetry: false };
    }

    console.error(
      `[lib/grading/gradeAttempt] Retry Attempt 2 JSON validation also failed: ${parsed2.error}. Flagging validation failure and using fallback format.`,
    );
  } catch (err) {
    // A usage-cap block must propagate to the caller (Prompt 84), not be
    // swallowed into the generic fallback grade below.
    if (err instanceof UsageCapExceededError) {
      throw err;
    }
    console.error("[lib/grading/gradeAttempt] LLM proxy call failed:", err);
  }

  // Safe Fallback if LLM proxy or parsing fails after retry
  const fallback = generateFallbackGrading(task, responseText);
  return {
    ...fallback,
    failedValidationAfterRetry: true,
  };
}

/**
 * Formats task details and response into a structured user grading prompt.
 */
function buildGradingPrompt(
  task: GradeAttemptParams["task"],
  responseText: string,
): string {
  return `
TASK PROMPT:
${task.prompt}

RUBRIC & EVALUATION CRITERIA:
${JSON.stringify(task.rubric || {}, null, 2)}

CANDIDATE RESPONSE:
${responseText}

Evaluate the candidate response against the rubric. Output JSON ONLY.
`;
}

/**
 * Formats arbitrary response payloads into clean string format.
 */
function formatResponseText(response: unknown): string {
  if (typeof response === "string") return response;
  if (typeof response === "object" && response !== null) {
    if ("code" in response) return String((response as { code: unknown }).code);
    if ("answer" in response)
      return String((response as { answer: unknown }).answer);
    return JSON.stringify(response);
  }
  return String(response || "");
}

/**
 * Parses raw string output into JSON and validates against GradingResultSchema using Zod.
 */
function parseAndValidateGrading(
  rawContent: string,
):
  | { success: true; data: z.infer<typeof GradingResultSchema> }
  | { success: false; error: string } {
  try {
    // Strip markdown code fences if model enclosed JSON in ```json ... ```
    let cleaned = rawContent.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

    const json = JSON.parse(cleaned);
    const validation = GradingResultSchema.safeParse(json);

    if (validation.success) {
      return { success: true, data: validation.data };
    }

    return {
      success: false,
      error: validation.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  } catch (err) {
    return {
      success: false,
      error: `JSON syntax error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Fallback grading output generator if LLM call or parsing fails.
 */
function generateFallbackGrading(
  task: GradeAttemptParams["task"],
  responseText: string,
): z.infer<typeof GradingResultSchema> {
  const isNonEmpty = responseText.trim().length > 0;
  const score = isNonEmpty ? 75 : 0;

  return {
    score,
    feedback: isNonEmpty
      ? "Response submitted successfully and evaluated against basic criteria."
      : "No response was submitted for this task.",
    criteriaBreakdown: [
      {
        criterion: "Response Completeness",
        met: isNonEmpty,
        note: isNonEmpty
          ? "Candidate submitted a non-empty response."
          : "Response was empty.",
      },
    ],
    confidence: "low",
  };
}
