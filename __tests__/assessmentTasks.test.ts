import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "order"]) {
    chain[m] = vi.fn(() => chain);
  }
  // Neither query in the route has a terminal .single()/.maybeSingle() —
  // awaiting the chain itself resolves it, so make the chain thenable.
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

let skillNodeRows: Array<{ id: string; name: string; category: string; difficulty: number; order_index: number }> | null;
let assessmentTaskRows: Array<{ id: string; skill_node_id: string; type: string; prompt: string; rubric: Record<string, unknown> }> | null;

function defaultMockFromImpl(table: string) {
  if (table === "skill_nodes") return makeChainable({ data: skillNodeRows, error: null });
  if (table === "assessment_tasks") return makeChainable({ data: assessmentTaskRows, error: null });
  return makeChainable({ data: null, error: null });
}

const mockFrom = vi.fn(defaultMockFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { GET } from "@/app/api/assessment/tasks/route";

const TOP_LEVEL_CATEGORIES = [
  "LLM Fundamentals",
  "Prompt Engineering",
  "API Integration",
  "Embeddings & Retrieval",
  "Agentic Systems",
  "Evaluation",
  "Fine-Tuning Basics",
  "Deployment",
];

describe("GET /api/assessment/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFromImpl);
    mockGetServerUser.mockResolvedValue({ user: { id: "user-1" }, profile: null });
    skillNodeRows = [];
    assessmentTaskRows = [];
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns exactly 8 tasks (one per top-level category) all from the fallback set when the DB has no rows", async () => {
    skillNodeRows = [];
    assessmentTaskRows = [];

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.tasks).toHaveLength(8);
    expect(json.tasks.map((t: { category: string }) => t.category)).toEqual(TOP_LEVEL_CATEGORIES);
    // Every one of the fallback ids is the hardcoded b0000000... series.
    expect(json.tasks.every((t: { id: string }) => t.id.startsWith("b0000000-"))).toBe(true);
  });

  it("prefers a real DB task over the fallback for a category that has one, keeping fallback for the rest", async () => {
    skillNodeRows = [
      { id: "node-llm-1", name: "Tokenization", category: "LLM Fundamentals", difficulty: 1, order_index: 1 },
    ];
    assessmentTaskRows = [
      { id: "real-task-1", skill_node_id: "node-llm-1", type: "multiple_choice", prompt: "Real DB prompt", rubric: { correct_answer: "A" } },
    ];

    const res = await GET();
    const json = await res.json();

    const llmTask = json.tasks.find((t: { category: string }) => t.category === "LLM Fundamentals");
    expect(llmTask).toMatchObject({
      id: "real-task-1",
      skill_node_id: "node-llm-1",
      prompt: "Real DB prompt",
    });
    expect(llmTask.skill_node).toMatchObject({ id: "node-llm-1", name: "Tokenization" });

    // Every other category still falls back since only one DB task was supplied.
    const otherTasks = json.tasks.filter((t: { category: string }) => t.category !== "LLM Fundamentals");
    expect(otherTasks.every((t: { id: string }) => t.id.startsWith("b0000000-"))).toBe(true);
  });

  it("when multiple skill nodes in one category have DB tasks, only the first (by scan order) is used", async () => {
    skillNodeRows = [
      { id: "node-a", name: "Node A", category: "Evaluation", difficulty: 1, order_index: 1 },
      { id: "node-b", name: "Node B", category: "Evaluation", difficulty: 2, order_index: 2 },
    ];
    assessmentTaskRows = [
      { id: "task-a", skill_node_id: "node-a", type: "short_answer", prompt: "Task A", rubric: {} },
      { id: "task-b", skill_node_id: "node-b", type: "short_answer", prompt: "Task B", rubric: {} },
    ];

    const res = await GET();
    const json = await res.json();
    const evalTask = json.tasks.find((t: { category: string }) => t.category === "Evaluation");
    expect(evalTask.id).toBe("task-a");
  });

  it("dedupes multiple task rows for the same skill node, keeping the first one encountered", async () => {
    skillNodeRows = [
      { id: "node-x", name: "Node X", category: "Deployment", difficulty: 1, order_index: 1 },
    ];
    assessmentTaskRows = [
      { id: "task-first", skill_node_id: "node-x", type: "short_answer", prompt: "First", rubric: {} },
      { id: "task-second", skill_node_id: "node-x", type: "short_answer", prompt: "Second", rubric: {} },
    ];

    const res = await GET();
    const json = await res.json();
    const deployTask = json.tasks.find((t: { category: string }) => t.category === "Deployment");
    expect(deployTask.id).toBe("task-first");
  });

  it("falls back to the full fallback set (200, not 500) when the skill_nodes/assessment_tasks queries return null data", async () => {
    // The route destructures `data` only (no `error`) from these two
    // queries, so a query returning null data — including a genuine DB
    // error, since the Supabase client returns { data: null, error }
    // rather than throwing — degrades silently into the offline fallback
    // task set instead of surfacing a 500. Documented here as the route's
    // actual (likely intentional, per its own "offline / un-seeded dev
    // environments" comment) behavior.
    skillNodeRows = null;
    assessmentTaskRows = null;

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tasks).toHaveLength(8);
  });

  it("propagates an unexpected thrown error as 500", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("unexpected failure");
    });

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
