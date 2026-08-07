import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
  createClient: () => mockCreateClient(),
}));

// computeNodeStatus and topologicalSort are real/unmocked — both pure and
// already covered elsewhere (skillGraphStatus.test.ts, traverse.test.ts);
// this route's own job is wiring real per-user scores through them correctly.

let nodesRows: unknown[] = [];
let nodesError: { message: string } | null = null;
let scoresRows: unknown[] = [];
let scoresError: { message: string } | null = null;

function makeSupabaseClient() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.then = (resolve: (v: { data: unknown; error: unknown }) => void) => {
        if (table === "skill_nodes") return resolve({ data: nodesRows, error: nodesError });
        if (table === "competency_scores") return resolve({ data: scoresRows, error: scoresError });
        return resolve({ data: [], error: null });
      };
      return chain;
    },
  };
}

import { GET } from "@/app/api/skill-graph/route";

function node(id: string, prereqs: string[] = [], overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    category: "General",
    prerequisite_ids: prereqs,
    difficulty: 1,
    order_index: 1,
    ...overrides,
  };
}

describe("app/api/skill-graph/route.ts — full graph annotated with real per-user status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: null });
    mockCreateClient.mockResolvedValue(makeSupabaseClient());
    nodesRows = [];
    nodesError = null;
    scoresRows = [];
    scoresError = null;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 500 when the skill_nodes fetch errors", async () => {
    nodesError = { message: "db down" };
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("returns 500 when the competency_scores fetch errors", async () => {
    nodesRows = [node("n1")];
    scoresError = { message: "db down" };
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("orders nodes topologically and marks status per real completion threshold", async () => {
    nodesRows = [node("n2", ["n1"]), node("n1")];
    scoresRows = [{ skill_node_id: "n1", score: 85 }];

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.map((n: { id: string }) => n.id)).toEqual(["n1", "n2"]);
    expect(json.data[0].status).toBe("completed"); // score >= 80
    expect(json.data[1].status).toBe("available"); // prereq n1 completed, no own score yet
  });

  it("a node with an unmet prerequisite is locked, not available", async () => {
    nodesRows = [node("n1"), node("n2", ["n1"])];
    scoresRows = [{ skill_node_id: "n1", score: 30 }]; // in_progress, not completed

    const res = await GET();
    const json = await res.json();
    const n2 = json.data.find((n: { id: string }) => n.id === "n2");
    expect(n2.status).toBe("locked");
  });

  it("falls back to unordered nodes (without crashing) when the graph has a genuine cycle", async () => {
    nodesRows = [node("n1", ["n2"]), node("n2", ["n1"])]; // n1 <-> n2 cycle
    scoresRows = [];

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.map((n: { id: string }) => n.id).sort()).toEqual(["n1", "n2"]);
  });
});
