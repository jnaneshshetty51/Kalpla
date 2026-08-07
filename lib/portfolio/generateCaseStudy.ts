import { createAdminClient } from "@/lib/supabase/admin";
import { executeLLMCallWithCap } from "@/lib/llm/executeLLMCallWithCap";
import { resolveModelConfig } from "@/lib/llm/models";
import { SubmissionReview } from "@/lib/grading/reviewSubmission";

const CASE_STUDY_SYSTEM_PROMPT = `You are writing a short portfolio case-study entry on behalf of a GenAI engineering student, based on a project they actually completed.

Write 3-4 short paragraphs covering: what was built (concretely, from the actual code — name real functions/techniques used, not generic phrases), the technical approach taken, and a specific challenge that was overcome (pull this from their own written reflection where possible).

Write in third person, portfolio-ready prose — no headers, no bullet points, no markdown. Ground every claim in the actual code and reflection provided; do not invent details or produce generic "in this project I learned..." boilerplate that could apply to any project. Output ONLY the case study text.`;

export interface GenerateCaseStudyParams {
  submissionId: string;
  force?: boolean;
}

export interface CaseStudyResult {
  summary: string;
  cached: boolean;
  generated_at: string;
}

/**
 * Generates a portfolio case-study write-up for a completed project
 * submission (Prompt 75). Expensive tier, one-time generation — cached on
 * the submission's metadata and only regenerated when the user explicitly
 * requests it (force: true), not on every portfolio view.
 */
export async function generateCaseStudy({
  submissionId,
  force = false,
}: GenerateCaseStudyParams): Promise<CaseStudyResult> {
  const adminSupabase = createAdminClient();

  const { data: submission, error } = await adminSupabase
    .from("submissions")
    .select("id, user_id, project_id, code, reflection, ai_review, metadata")
    .eq("id", submissionId)
    .maybeSingle();

  if (error || !submission) {
    throw new Error(`Submission not found: ${submissionId}`);
  }

  const cached = submission.metadata?.case_study as CaseStudyResult | undefined;
  if (cached && !force) {
    return { ...cached, cached: true };
  }

  const { data: project } = await adminSupabase
    .from("projects")
    .select("id, name, spec")
    .eq("id", submission.project_id)
    .maybeSingle();

  const review = submission.ai_review as SubmissionReview | null;

  const userPrompt = `Project: ${project?.name || "Untitled project"}
Description: ${project?.spec?.description || "N/A"}

The student's actual submitted code:
\`\`\`python
${submission.code || ""}
\`\`\`

The student's own written reflection on the project:
"""
${submission.reflection || "(no reflection recorded)"}
"""

${review ? `Reviewer notes — logic: "${review.logic_correctness.summary}"; edge cases: "${review.edge_case_handling.summary}"` : ""}

Write the case study now.`;

  const resolvedConfig = resolveModelConfig("expensive");
  const llmResponse = await executeLLMCallWithCap({
    userId: submission.user_id,
    provider: resolvedConfig.provider,
    modelId: resolvedConfig.modelId,
    feature: "portfolio_case_study",
    messages: [
      { role: "system", content: CASE_STUDY_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 800,
    temperature: 0.5,
  });

  const result: CaseStudyResult = {
    summary: llmResponse.content.trim(),
    cached: false,
    generated_at: new Date().toISOString(),
  };

  await adminSupabase
    .from("submissions")
    .update({
      metadata: { ...submission.metadata, case_study: result },
    })
    .eq("id", submissionId);

  return result;
}
