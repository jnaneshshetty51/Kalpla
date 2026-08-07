import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

let taskRow: { id: string; skill_node_id: string; type: string; prompt: string; rubric: Record<string, unknown> } | null;
let nodeRow: { id: string; name: string; category: string; difficulty: number } | null;
const eqCallsByTable: Record<string, Array<[string, string]>> = {};

function defaultMockFromImpl(table: string) {
  if (table === "assessment_tasks") {
    const chain = makeChainable({ data: taskRow, error: null });
    const realEq = chain.eq as (...args: [string, string]) => unknown;
    chain.eq = vi.fn((col: string, val: string) => {
      (eqCallsByTable["assessment_tasks"] ||= []).push([col, val]);
      return realEq(col, val);
    });
    return chain;
  }
  if (table === "skill_nodes") {
    const chain = makeChainable({ data: nodeRow, error: null });
    const realEq = chain.eq as (...args: [string, string]) => unknown;
    chain.eq = vi.fn((col: string, val: string) => {
      (eqCallsByTable["skill_nodes"] ||= []).push([col, val]);
      return realEq(col, val);
    });
    return chain;
  }
  return makeChainable({ data: null, error: null });
}

const mockFrom = vi.fn(defaultMockFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { GET } from "@/app/api/assessment/task/route";

function req(url: string) {
  return new Request(url);
}

describe("GET /api/assessment/task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFromImpl);
    mockGetServerUser.mockResolvedValue({ user: { id: "user-1" }, profile: null });
    taskRow = null;
    nodeRow = null;
    eqCallsByTable["assessment_tasks"] = [];
    eqCallsByTable["skill_nodes"] = [];
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });

    const res = await GET(req("http://localhost/api/assessment/task?task_id=t1"));
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 when neither skill_node_id nor task_id is provided", async () => {
    const res = await GET(req("http://localhost/api/assessment/task"));
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("looks up by task_id when given, and returns the real DB task + skill node metadata", async () => {
    taskRow = { id: "t1", skill_node_id: "node-1", type: "code", prompt: "Write code", rubric: { language: "python" } };
    nodeRow = { id: "node-1", name: "LLM Client SDKs", category: "API Integration", difficulty: 2 };

    const res = await GET(req("http://localhost/api/assessment/task?task_id=t1"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.task).toMatchObject({
      id: "t1",
      skill_node_id: "node-1",
      type: "code",
      prompt: "Write code",
    });
    expect(json.task.skill_node).toMatchObject({ id: "node-1", name: "LLM Client SDKs" });
    expect(eqCallsByTable["assessment_tasks"]).toEqual([["id", "t1"]]);
  });

  it("looks up by skill_node_id when task_id is absent", async () => {
    taskRow = { id: "t2", skill_node_id: "node-2", type: "short_answer", prompt: "Explain X", rubric: {} };
    nodeRow = { id: "node-2", name: "Prompting", category: "Prompt Engineering", difficulty: 1 };

    const res = await GET(req("http://localhost/api/assessment/task?skill_node_id=node-2"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.task.id).toBe("t2");
    expect(eqCallsByTable["assessment_tasks"]).toEqual([["skill_node_id", "node-2"]]);
  });

  it("falls back to a generated task using the real skill node's metadata when skill_node_id has no matching DB task row", async () => {
    taskRow = null;
    nodeRow = { id: "node-3", name: "ReAct Framework", category: "Agentic Systems", difficulty: 3 };

    const res = await GET(req("http://localhost/api/assessment/task?skill_node_id=node-3"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.task.skill_node_id).toBe("node-3");
    expect(json.task.category).toBe("Agentic Systems");
    expect(json.task.prompt).toContain("ReAct Framework");
    expect(json.task.type).toBe("short_answer");
  });

  it("falls back to the hardcoded default skill node id when task_id has no matching row and no skill_node_id was given", async () => {
    taskRow = null;
    nodeRow = { id: "a0000000-0000-4000-a000-000000000101", name: "Tokenization & Context Windows", category: "LLM Fundamentals", difficulty: 1 };

    const res = await GET(req("http://localhost/api/assessment/task?task_id=nonexistent"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.task.skill_node_id).toBe("a0000000-0000-4000-a000-000000000101");
    expect(json.task.id).toBe("nonexistent");
    expect(eqCallsByTable["skill_nodes"]).toEqual([["id", "a0000000-0000-4000-a000-000000000101"]]);
  });

  it("falls back to generic defaults when neither the task nor the skill node can be found", async () => {
    taskRow = null;
    nodeRow = null;

    const res = await GET(req("http://localhost/api/assessment/task?skill_node_id=missing-node"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.task.category).toBe("GenAI Engineering");
    expect(json.task.skill_node.name).toBe("Skill Node");
    expect(json.task.skill_node.difficulty).toBe(1);
  });

  it("falls back on the task's category/skill_node fields when the DB task exists but its skill node lookup fails", async () => {
    taskRow = { id: "t4", skill_node_id: "orphan-node", type: "multiple_choice", prompt: "Q", rubric: { correct_answer: "A" } };
    nodeRow = null;

    const res = await GET(req("http://localhost/api/assessment/task?task_id=t4"));
    const json = await res.json();

    expect(json.task.category).toBe("GenAI Engineering");
    expect(json.task.skill_node).toMatchObject({ id: "orphan-node", name: "Skill Node" });
  });

  it("propagates an unexpected thrown error as 500", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("unexpected failure");
    });

    const res = await GET(req("http://localhost/api/assessment/task?task_id=t1"));
    expect(res.status).toBe(500);
  });
});
