import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubmissionReview } from "@/lib/grading/reviewSubmission";

let projectsRows: Array<{ id: string; name: string }> = [];
let submissionsRows: Array<{ project_id: string | null; ai_review: SubmissionReview | null }> = [];
let queueItemsRows: Array<{ submission_id: string | null }> = [];
let exerciseSubmissionsRows: Array<{ exercise_id: string | null; ai_review: SubmissionReview | null }> = [];
let tasksRows: Array<{ id: string; skill_node_id: string }> = [];
let nodesRows: Array<{ id: string; name: string }> = [];

function chain(data: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "in"]) {
    c[m] = vi.fn(() => c);
  }
  c.then = (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data, error: null });
  return c;
}

function defaultFromImpl(table: string) {
  if (table === "projects") return chain(projectsRows);
  if (table === "submissions") {
    // Both getProjectReviewAggregates (project_id-based) and
    // getSkillNodeReviewAggregates (exercise_id-based) hit "submissions" —
    // distinguish by whether exercise rows were set up for this test.
    return chain(exerciseSubmissionsRows.length ? exerciseSubmissionsRows : submissionsRows);
  }
  if (table === "grading_review_queue") return chain(queueItemsRows);
  if (table === "assessment_tasks") return chain(tasksRows);
  if (table === "skill_nodes") return chain(nodesRows);
  return chain([]);
}

const mockFrom = vi.fn(defaultFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { getProjectReviewAggregates, getSkillNodeReviewAggregates } from "@/lib/analytics/reviewAggregates";

function review(overrides: Partial<SubmissionReview> = {}): SubmissionReview {
  return {
    overall_score: 80,
    logic_correctness: { score: 80, summary: "ok" },
    readability: { score: 80, summary: "ok" },
    optimization_opportunities: { score: 80, summary: "ok" },
    edge_case_handling: { score: 80, summary: "ok" },
    architecture_quality: null,
    genai_specific_criteria: [],
    reflection_flag: null,
    confidence: "high",
    is_ambiguous: false,
    ...overrides,
  };
}

describe("lib/analytics/reviewAggregates.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultFromImpl);
    projectsRows = [];
    submissionsRows = [];
    queueItemsRows = [];
    exerciseSubmissionsRows = [];
    tasksRows = [];
    nodesRows = [];
  });

  describe("getProjectReviewAggregates", () => {
    it("computes correct averages across a small realistic dataset, rounded to 1 decimal", async () => {
      projectsRows = [{ id: "p1", name: "RAG Chatbot" }];
      submissionsRows = [
        { project_id: "p1", ai_review: review({ overall_score: 70, logic_correctness: { score: 60, summary: "" } }) },
        { project_id: "p1", ai_review: review({ overall_score: 90, logic_correctness: { score: 100, summary: "" } }) },
      ];

      const results = await getProjectReviewAggregates();
      expect(results).toHaveLength(1);
      expect(results[0].project_id).toBe("p1");
      expect(results[0].submission_count).toBe(2);
      expect(results[0].avg_overall_score).toBe(80); // (70+90)/2
      expect(results[0].avg_section_scores.logic_correctness).toBe(80); // (60+100)/2
    });

    it("architecture_quality stays null when no submission provided a score for it", async () => {
      projectsRows = [{ id: "p1", name: "RAG Chatbot" }];
      submissionsRows = [{ project_id: "p1", ai_review: review({ architecture_quality: null }) }];

      const results = await getProjectReviewAggregates();
      expect(results[0].avg_section_scores.architecture_quality).toBeNull();
    });

    it("averages architecture_quality only across submissions that actually scored it", async () => {
      projectsRows = [{ id: "p1", name: "RAG Chatbot" }];
      submissionsRows = [
        { project_id: "p1", ai_review: review({ architecture_quality: { score: 60, summary: "" } }) },
        { project_id: "p1", ai_review: review({ architecture_quality: null }) },
        { project_id: "p1", ai_review: review({ architecture_quality: { score: 80, summary: "" } }) },
      ];

      const results = await getProjectReviewAggregates();
      expect(results[0].avg_section_scores.architecture_quality).toBe(70); // (60+80)/2, not /3
    });

    it("counts and rates commonly-flagged genai criteria, sorted by times_not_met descending", async () => {
      projectsRows = [{ id: "p1", name: "RAG Chatbot" }];
      submissionsRows = [
        { project_id: "p1", ai_review: review({ genai_specific_criteria: [{ name: "chunking_strategy", met: false, note: "" }, { name: "retry_logic", met: true, note: "" }] }) },
        { project_id: "p1", ai_review: review({ genai_specific_criteria: [{ name: "chunking_strategy", met: false, note: "" }] }) },
        { project_id: "p1", ai_review: review({ genai_specific_criteria: [{ name: "chunking_strategy", met: true, note: "" }] }) },
      ];

      const results = await getProjectReviewAggregates();
      // 2 of 3 reviews flagged it unmet -> 66.7%.
      expect(results[0].common_flagged_criteria[0]).toMatchObject({ name: "chunking_strategy", times_not_met: 2, rate: 66.7 });
    });

    it("flagged_for_review_count reflects grading_review_queue entries joined to submissions for that project", async () => {
      projectsRows = [{ id: "p1", name: "RAG Chatbot" }, { id: "p2", name: "Agent Project" }];
      submissionsRows = [{ project_id: "p1", ai_review: review() }];
      queueItemsRows = [{ submission_id: "sub-1" }, { submission_id: "sub-2" }];
      // The route/lib does a follow-up submissions lookup filtered by these ids;
      // our chain() helper returns the same submissionsRows regardless of the
      // .in() filter args, so model the flagged lookup via a distinct mock below.
      mockFrom.mockImplementation((table: string) => {
        if (table === "projects") return chain(projectsRows);
        if (table === "grading_review_queue") return chain(queueItemsRows);
        if (table === "submissions") {
          const c: Record<string, unknown> = {};
          let filteredByIn = false;
          c.select = vi.fn((cols: string) => {
            // First call selects "project_id, ai_review" (main aggregate query);
            // second call selects "id, project_id" for the flagged lookup.
            filteredByIn = cols.trim().startsWith("id");
            return c;
          });
          c.eq = vi.fn(() => c);
          c.not = vi.fn(() => c);
          c.in = vi.fn(() => c);
          c.then = (resolve: (v: { data: unknown; error: null }) => void) =>
            resolve({
              data: filteredByIn ? [{ id: "sub-1", project_id: "p1" }, { id: "sub-2", project_id: "p1" }] : submissionsRows,
              error: null,
            });
          return c;
        }
        return chain([]);
      });

      const results = await getProjectReviewAggregates();
      const p1 = results.find((r) => r.project_id === "p1")!;
      const p2 = results.find((r) => r.project_id === "p2")!;
      expect(p1.flagged_for_review_count).toBe(2);
      expect(p2.flagged_for_review_count).toBe(0);
    });

    it("a project with zero reviewed submissions returns zeroed averages, not NaN/undefined", async () => {
      projectsRows = [{ id: "p1", name: "Empty Project" }];
      submissionsRows = [];

      const results = await getProjectReviewAggregates();
      expect(results[0].submission_count).toBe(0);
      expect(results[0].avg_overall_score).toBe(0);
      expect(results[0].common_flagged_criteria).toEqual([]);
    });
  });

  describe("getSkillNodeReviewAggregates", () => {
    it("returns [] immediately when there are no exercise submissions", async () => {
      exerciseSubmissionsRows = [];
      const results = await getSkillNodeReviewAggregates();
      expect(results).toEqual([]);
    });

    it("groups scores by skill node via the assessment_tasks join, computing avg_score and low_confidence_count", async () => {
      exerciseSubmissionsRows = [
        { exercise_id: "task-1", ai_review: review({ overall_score: 60, confidence: "low" }) },
        { exercise_id: "task-1", ai_review: review({ overall_score: 80, confidence: "high" }) },
        { exercise_id: "task-2", ai_review: review({ overall_score: 90, confidence: "medium" }) },
      ];
      tasksRows = [
        { id: "task-1", skill_node_id: "node-a" },
        { id: "task-2", skill_node_id: "node-b" },
      ];
      nodesRows = [
        { id: "node-a", name: "Tokenization" },
        { id: "node-b", name: "Embeddings" },
      ];

      const results = await getSkillNodeReviewAggregates();
      const nodeA = results.find((r) => r.skill_node_id === "node-a")!;
      const nodeB = results.find((r) => r.skill_node_id === "node-b")!;

      expect(nodeA.skill_node_name).toBe("Tokenization");
      expect(nodeA.submission_count).toBe(2);
      expect(nodeA.avg_score).toBe(70); // (60+80)/2
      expect(nodeA.low_confidence_count).toBe(1);

      expect(nodeB.submission_count).toBe(1);
      expect(nodeB.low_confidence_count).toBe(0);
    });

    it("skips submissions whose exercise_id has no matching assessment_task (orphaned/deleted task)", async () => {
      exerciseSubmissionsRows = [{ exercise_id: "task-missing", ai_review: review() }];
      tasksRows = [];
      nodesRows = [];

      const results = await getSkillNodeReviewAggregates();
      expect(results).toEqual([]);
    });

    it("falls back to the raw skill_node_id as the display name if the skill_nodes lookup doesn't have it", async () => {
      exerciseSubmissionsRows = [{ exercise_id: "task-1", ai_review: review() }];
      tasksRows = [{ id: "task-1", skill_node_id: "node-a" }];
      nodesRows = []; // lookup misses

      const results = await getSkillNodeReviewAggregates();
      expect(results[0].skill_node_name).toBe("node-a");
    });
  });
});
