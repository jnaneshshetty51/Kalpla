import { describe, it, expect, vi, beforeEach } from "vitest";

const mockNextStep = vi.fn();
vi.mock("@/lib/roadmap/nextStep", () => ({
  getRecommendedNextStep: (userId: string) => mockNextStep(userId),
}));

function chainableSelect(data: unknown) {
  const chain: Record<string, unknown> = {};
  // is/gte/lte/or added for lib/dashboard/aggregate.ts's upcoming-sessions
  // query (live_sessions) — any table not explicitly stubbed below falls
  // through to this generic empty-data chain, so it needs to support
  // whatever chain methods any current or future query might call.
  for (const m of ["select", "eq", "order", "limit", "is", "gte", "lte", "or"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: { data: unknown; error: null }) => void) =>
    resolve({ data, error: null });
  return chain;
}

let skillNodes: unknown[] = [];
let competencyScores: unknown[] = [];
let assessmentAttempts: unknown[] = [];

const mockFrom = vi.fn((table: string) => {
  if (table === "skill_nodes") return chainableSelect(skillNodes);
  if (table === "competency_scores") return chainableSelect(competencyScores);
  if (table === "assessment_attempts") return chainableSelect(assessmentAttempts);
  return chainableSelect([]);
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { getDashboardAggregateData } from "@/lib/dashboard/aggregate";

const DEFAULT_NEXT_STEP = {
  skill_node_id: "n1",
  node_name: "Tokenization",
  status: "available",
  estimated_days: 3,
  learning_objective: "obj",
  action_type: "start_lesson" as const,
  action_label: "Start →",
  action_description: "desc",
  target_url: "/learn/n1",
};

describe("lib/dashboard/aggregate.ts — category/node/score aggregation math", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNextStep.mockResolvedValue(DEFAULT_NEXT_STEP);
    skillNodes = [];
    competencyScores = [];
    assessmentAttempts = [];
  });

  it("buckets nodes into mastered (>=80) / in_progress (>=40) / needs_focus (<40) correctly at the exact boundaries", async () => {
    skillNodes = [
      { id: "n1", name: "A", category: "LLM Fundamentals", difficulty: 1, order_index: 1 },
      { id: "n2", name: "B", category: "LLM Fundamentals", difficulty: 1, order_index: 2 },
      { id: "n3", name: "C", category: "LLM Fundamentals", difficulty: 1, order_index: 3 },
      { id: "n4", name: "D", category: "LLM Fundamentals", difficulty: 1, order_index: 4 },
    ];
    competencyScores = [
      { skill_node_id: "n1", score: 80 }, // exactly at mastered boundary
      { skill_node_id: "n2", score: 79.9 }, // just under -> in_progress
      { skill_node_id: "n3", score: 40 }, // exactly at in_progress boundary
      { skill_node_id: "n4", score: 39.9 }, // just under -> needs_focus
    ];

    const result = await getDashboardAggregateData("usr-1");

    expect(result.nodeCounts.mastered).toBe(1);
    expect(result.nodeCounts.in_progress).toBe(2);
    expect(result.nodeCounts.needs_focus).toBe(1);
    expect(result.nodeCounts.total).toBe(4);
  });

  it("a skill node with no competency_scores row at all defaults to score 0 (needs_focus), not skipped", async () => {
    skillNodes = [{ id: "n1", name: "Untouched", category: "LLM Fundamentals", difficulty: 1, order_index: 1 }];
    competencyScores = [];

    const result = await getDashboardAggregateData("usr-1");

    const cat = result.categories.find((c) => c.category === "LLM Fundamentals")!;
    expect(cat.nodes[0].score).toBe(0);
    expect(cat.nodes[0].status).toBe("needs_focus");
    expect(result.nodeCounts.needs_focus).toBe(1);
  });

  it("computes overall score as the mean across ALL nodes across ALL categories, not just scored ones", async () => {
    skillNodes = [
      { id: "n1", name: "A", category: "LLM Fundamentals", difficulty: 1, order_index: 1 },
      { id: "n2", name: "B", category: "Prompt Engineering", difficulty: 1, order_index: 2 },
    ];
    competencyScores = [
      { skill_node_id: "n1", score: 100 },
      { skill_node_id: "n2", score: 0 },
    ];

    const result = await getDashboardAggregateData("usr-1");
    expect(result.overallScore).toBe(50);
  });

  it("assigns the correct readiness badge at each threshold boundary", async () => {
    const scoreToBadge: Array<[number, string]> = [
      [84.9, "Full-Stack GenAI Engineer"],
      [85, "Senior GenAI Architect"],
      [69.9, "Intermediate Practitioner"],
      [70, "Full-Stack GenAI Engineer"],
      [49.9, "Foundational Apprentice"],
      [50, "Intermediate Practitioner"],
    ];

    for (const [score, expectedBadge] of scoreToBadge) {
      skillNodes = [{ id: "n1", name: "A", category: "LLM Fundamentals", difficulty: 1, order_index: 1 }];
      competencyScores = [{ skill_node_id: "n1", score }];
      const result = await getDashboardAggregateData("usr-1");
      expect(result.readinessBadge).toBe(expectedBadge);
    }
  });

  it("category average only divides by that category's own node count, not the global total", async () => {
    skillNodes = [
      { id: "n1", name: "A", category: "LLM Fundamentals", difficulty: 1, order_index: 1 },
      { id: "n2", name: "B", category: "LLM Fundamentals", difficulty: 1, order_index: 2 },
      { id: "n3", name: "C", category: "Prompt Engineering", difficulty: 1, order_index: 3 },
    ];
    competencyScores = [
      { skill_node_id: "n1", score: 60 },
      { skill_node_id: "n2", score: 80 },
      { skill_node_id: "n3", score: 10 },
    ];

    const result = await getDashboardAggregateData("usr-1");
    const llmCat = result.categories.find((c) => c.category === "LLM Fundamentals")!;
    expect(llmCat.averageScore).toBe(70); // (60+80)/2, not affected by Prompt Engineering's 10
  });
});
