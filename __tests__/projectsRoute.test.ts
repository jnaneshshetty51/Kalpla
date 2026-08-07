import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

// computeProjectUnlockState is real/unmocked — pure and already covered by
// projectLadderAndPortfolio.test.ts, but this route's own job is wiring
// real user scores into it correctly, so we want the real function here.

let projectsRows: unknown[] = [];
let scoresRows: unknown[] = [];
let skillNodesRows: unknown[] = [];
let submissionsRows: unknown[] = [];
let projectsError: { message: string } | null = null;

function defaultMockFromImpl(table: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "order", "in"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: { data: unknown; error: unknown }) => void) => {
    if (table === "projects") return resolve({ data: projectsRows, error: projectsError });
    if (table === "competency_scores") return resolve({ data: scoresRows, error: null });
    if (table === "skill_nodes") return resolve({ data: skillNodesRows, error: null });
    if (table === "submissions") return resolve({ data: submissionsRows, error: null });
    return resolve({ data: [], error: null });
  };
  return chain;
}

const mockFrom = vi.fn(defaultMockFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { GET } from "@/app/api/projects/route";

describe("app/api/projects/route.ts — project ladder with real unlock-state wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFromImpl);
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: null });
    projectsRows = [];
    scoresRows = [];
    skillNodesRows = [];
    submissionsRows = [];
    projectsError = null;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 500 when the projects fetch errors", async () => {
    projectsError = { message: "db down" };
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("unlocks a project only once every prerequisite skill node meets the real completion threshold", async () => {
    projectsRows = [
      { id: "p1", name: "RAG Bot", ladder_position: 1, prerequisite_skill_node_ids: ["n1", "n2"], spec: { type: "rag", description: "d" } },
    ];
    skillNodesRows = [
      { id: "n1", name: "Tokenization" },
      { id: "n2", name: "Embeddings" },
    ];

    // n1 complete (>=80), n2 not -> stays locked, missing only n2.
    scoresRows = [
      { skill_node_id: "n1", score: 85 },
      { skill_node_id: "n2", score: 40 },
    ];

    const res = await GET();
    const json = await res.json();
    expect(json.projects).toHaveLength(1);
    expect(json.projects[0].unlocked).toBe(false);
    expect(json.projects[0].missing_prerequisites).toEqual([{ id: "n2", name: "Embeddings" }]);
  });

  it("unlocks fully once every prerequisite score clears the threshold", async () => {
    projectsRows = [
      { id: "p1", name: "RAG Bot", ladder_position: 1, prerequisite_skill_node_ids: ["n1"], spec: {} },
    ];
    scoresRows = [{ skill_node_id: "n1", score: 92 }];

    const res = await GET();
    const json = await res.json();
    expect(json.projects[0].unlocked).toBe(true);
    expect(json.projects[0].missing_prerequisites).toEqual([]);
  });

  it("falls back to the raw skill_node_id as the display name when the node lookup is missing it", async () => {
    projectsRows = [
      { id: "p1", name: "RAG Bot", ladder_position: 1, prerequisite_skill_node_ids: ["n-missing"], spec: {} },
    ];
    skillNodesRows = []; // lookup never resolves n-missing
    scoresRows = [];

    const res = await GET();
    const json = await res.json();
    expect(json.projects[0].missing_prerequisites).toEqual([{ id: "n-missing", name: "n-missing" }]);
  });

  it("prefers 'passed' as the best_submission_status if it appears anywhere in history, even when a later attempt regressed", async () => {
    projectsRows = [{ id: "p1", name: "RAG Bot", ladder_position: 1, prerequisite_skill_node_ids: [], spec: {} }];
    // Ordered desc by created_at — most recent first is "failed", but an
    // earlier attempt "passed" should still win.
    submissionsRows = [
      { project_id: "p1", status: "failed", created_at: "2026-08-02T00:00:00Z" },
      { project_id: "p1", status: "passed", created_at: "2026-08-01T00:00:00Z" },
    ];

    const res = await GET();
    const json = await res.json();
    expect(json.projects[0].best_submission_status).toBe("passed");
  });

  it("reports null best_submission_status when the user has never submitted to that project", async () => {
    projectsRows = [{ id: "p1", name: "RAG Bot", ladder_position: 1, prerequisite_skill_node_ids: [], spec: {} }];
    submissionsRows = [];

    const res = await GET();
    const json = await res.json();
    expect(json.projects[0].best_submission_status).toBeNull();
  });

  it("returns 500 when getServerUser/aggregation throws unexpectedly", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("unexpected");
    });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
