import { createAdminClient } from "@/lib/supabase/admin";
import { SubmissionReview } from "@/lib/grading/reviewSubmission";

export interface ProjectReviewAggregate {
  project_id: string;
  project_name: string;
  submission_count: number;
  avg_overall_score: number;
  avg_section_scores: {
    logic_correctness: number;
    readability: number;
    optimization_opportunities: number;
    edge_case_handling: number;
    architecture_quality: number | null;
  };
  common_flagged_criteria: Array<{ name: string; times_not_met: number; rate: number }>;
  flagged_for_review_count: number;
}

export interface SkillNodeReviewAggregate {
  skill_node_id: string;
  skill_node_name: string;
  submission_count: number;
  avg_score: number;
  low_confidence_count: number;
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

/**
 * Rolls up review outcomes per catalog project — average scores per
 * section, and which GenAI-specific criteria most often come back
 * unmet (Prompt 65) so the team can see e.g. "most users struggle with
 * chunking strategy in the RAG project" without reading every review.
 * Feeds /admin/skill-graph-health (a later section) — this is just the
 * aggregation function it will consume.
 */
export async function getProjectReviewAggregates(): Promise<ProjectReviewAggregate[]> {
  const adminSupabase = createAdminClient();

  const { data: projects } = await adminSupabase.from("projects").select("id, name");
  const { data: submissions } = await adminSupabase
    .from("submissions")
    .select("project_id, ai_review")
    .not("project_id", "is", null)
    .not("ai_review", "is", null);

  const { data: queueItems } = await adminSupabase
    .from("grading_review_queue")
    .select("submission_id")
    .not("submission_id", "is", null);

  const { data: flaggedSubmissions } = queueItems?.length
    ? await adminSupabase
        .from("submissions")
        .select("id, project_id")
        .in(
          "id",
          queueItems.map((q) => q.submission_id),
        )
    : { data: [] };

  const flaggedCountByProject = new Map<string, number>();
  for (const s of flaggedSubmissions || []) {
    if (!s.project_id) continue;
    flaggedCountByProject.set(s.project_id, (flaggedCountByProject.get(s.project_id) || 0) + 1);
  }

  const results: ProjectReviewAggregate[] = [];

  for (const project of projects || []) {
    const projectSubmissions = (submissions || []).filter((s) => s.project_id === project.id);
    const reviews = projectSubmissions
      .map((s) => s.ai_review as SubmissionReview | null)
      .filter((r): r is SubmissionReview => !!r);

    const criterionMissCounts = new Map<string, number>();
    for (const review of reviews) {
      for (const criterion of review.genai_specific_criteria || []) {
        if (!criterion.met) {
          criterionMissCounts.set(criterion.name, (criterionMissCounts.get(criterion.name) || 0) + 1);
        }
      }
    }

    const commonFlaggedCriteria = Array.from(criterionMissCounts.entries())
      .map(([name, timesNotMet]) => ({
        name,
        times_not_met: timesNotMet,
        rate: reviews.length > 0 ? Math.round((timesNotMet / reviews.length) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.times_not_met - a.times_not_met);

    const architectureScores = reviews
      .map((r) => r.architecture_quality?.score)
      .filter((s): s is number => typeof s === "number");

    results.push({
      project_id: project.id,
      project_name: project.name,
      submission_count: reviews.length,
      avg_overall_score: average(reviews.map((r) => r.overall_score)),
      avg_section_scores: {
        logic_correctness: average(reviews.map((r) => r.logic_correctness.score)),
        readability: average(reviews.map((r) => r.readability.score)),
        optimization_opportunities: average(reviews.map((r) => r.optimization_opportunities.score)),
        edge_case_handling: average(reviews.map((r) => r.edge_case_handling.score)),
        architecture_quality: architectureScores.length > 0 ? average(architectureScores) : null,
      },
      common_flagged_criteria: commonFlaggedCriteria,
      flagged_for_review_count: flaggedCountByProject.get(project.id) || 0,
    });
  }

  return results;
}

/**
 * Rolls up review outcomes per skill node, for submissions made against a
 * standalone exercise (assessment_tasks) rather than a catalog project —
 * the other half of "per skill node and per project" (Prompt 65).
 */
export async function getSkillNodeReviewAggregates(): Promise<SkillNodeReviewAggregate[]> {
  const adminSupabase = createAdminClient();

  const { data: submissions } = await adminSupabase
    .from("submissions")
    .select("exercise_id, ai_review")
    .not("exercise_id", "is", null)
    .not("ai_review", "is", null);

  if (!submissions || submissions.length === 0) return [];

  const exerciseIds = Array.from(new Set(submissions.map((s) => s.exercise_id)));
  const { data: tasks } = await adminSupabase
    .from("assessment_tasks")
    .select("id, skill_node_id")
    .in("id", exerciseIds);

  const { data: nodes } = await adminSupabase.from("skill_nodes").select("id, name");
  const nodeNameById = new Map((nodes || []).map((n) => [n.id, n.name]));
  const skillNodeByTask = new Map((tasks || []).map((t) => [t.id, t.skill_node_id]));

  const byNode = new Map<string, { scores: number[]; lowConfidence: number }>();

  for (const submission of submissions) {
    const skillNodeId = skillNodeByTask.get(submission.exercise_id);
    if (!skillNodeId) continue;

    const review = submission.ai_review as SubmissionReview | null;
    if (!review) continue;

    const entry = byNode.get(skillNodeId) || { scores: [], lowConfidence: 0 };
    entry.scores.push(review.overall_score);
    if (review.confidence === "low") entry.lowConfidence++;
    byNode.set(skillNodeId, entry);
  }

  return Array.from(byNode.entries()).map(([skillNodeId, entry]) => ({
    skill_node_id: skillNodeId,
    skill_node_name: nodeNameById.get(skillNodeId) || skillNodeId,
    submission_count: entry.scores.length,
    avg_score: average(entry.scores),
    low_confidence_count: entry.lowConfidence,
  }));
}
