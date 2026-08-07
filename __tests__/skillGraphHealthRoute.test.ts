import { describe, it, expect, vi, beforeEach } from "vitest";

const mockVerifyAdminAuth = vi.fn();
vi.mock("@/lib/admin/verifyAdminAuth", () => ({
  verifyAdminAuth: () => mockVerifyAdminAuth(),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "order", "eq"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => mockFrom(table) }),
}));

import { GET } from "@/app/api/admin/skill-graph-health/route";

// Default implementation used unless a test overrides it with
// mockFrom.mockImplementationOnce(...) or mockFrom.mockImplementation(...).
// Re-established in beforeEach because vi.clearAllMocks() does NOT undo a
// prior test's .mockImplementation() override.
function defaultImpl(table: string) {
  switch (table) {
    case "skill_nodes":
      return makeChainable({ data: [], error: null });
    case "competency_scores":
      return makeChainable({ data: [], error: null });
    case "assessment_attempts":
      return makeChainable({ data: [], error: null });
    case "tasks":
      return makeChainable({ data: [], error: null });
    default:
      return makeChainable({ data: [], error: null });
  }
}

describe("GET /api/admin/skill-graph-health — completion/drop-off aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminAuth.mockResolvedValue({
      authorized: true,
      user: { id: "admin-1" },
      profile: { role: "admin" },
    });
    mockFrom.mockImplementation(defaultImpl);
  });

  it("rejects unauthenticated callers with the shared 401 response", async () => {
    const unauthorized = new Response(
      JSON.stringify({ error: "Unauthorized: No active session" }),
      { status: 401 },
    );
    mockVerifyAdminAuth.mockResolvedValue({ authorized: false, response: unauthorized });

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("rejects a logged-in non-admin caller with the shared 403 response", async () => {
    const forbidden = new Response(
      JSON.stringify({ error: "Forbidden: Admin access required" }),
      { status: 403 },
    );
    mockVerifyAdminAuth.mockResolvedValue({ authorized: false, response: forbidden });

    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("propagates a skill_nodes fetch error as 500", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") {
        return makeChainable({ data: null, error: { message: "db down" } });
      }
      return defaultImpl(table);
    });

    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("db down");
  });

  it("computes completion rate, avg attempts, and drop-off rate per node, sorted worst-first", async () => {
    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case "skill_nodes":
          return makeChainable({
            data: [
              { id: "node-a", name: "Node A", category: "cat1" },
              { id: "node-b", name: "Node B", category: "cat1" },
            ],
            error: null,
          });
        case "competency_scores":
          // Node A: 2 users scored, only 1 hit >=80 (mastery threshold).
          return makeChainable({
            data: [
              { skill_node_id: "node-a", user_id: "u1", score: 100 },
              { skill_node_id: "node-a", user_id: "u2", score: 0 },
            ],
            error: null,
          });
        case "assessment_attempts":
          // Node A: 4 distinct users attempted task-1, one attempt each.
          return makeChainable({
            data: [
              { task_id: "task-1", user_id: "u1" },
              { task_id: "task-1", user_id: "u2" },
              { task_id: "task-1", user_id: "u3" },
              { task_id: "task-1", user_id: "u4" },
              // Orphaned attempt referencing a task with no matching row in
              // `tasks` — must be silently skipped, not crash the route.
              { task_id: "task-ghost", user_id: "u5" },
            ],
            error: null,
          });
        case "tasks":
          return makeChainable({
            data: [{ id: "task-1", skill_node_id: "node-a" }],
            error: null,
          });
        default:
          return defaultImpl(table);
      }
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();

    const nodeA = json.nodes.find((n: { id: string }) => n.id === "node-a");
    const nodeB = json.nodes.find((n: { id: string }) => n.id === "node-b");

    // Node A: completionRate = 1/2 scored users >=80 => 50.0
    expect(nodeA).toMatchObject({
      completionRate: 50,
      avgAttempts: 1,
      dropOffRate: 75, // (4 started - 1 completed) / 4 started => 75.0
      totalUsers: 2,
      startedUsers: 4,
    });

    // Node B: no scores, no attempts routed to it at all.
    expect(nodeB).toMatchObject({
      completionRate: 0,
      avgAttempts: 0,
      dropOffRate: 0,
      totalUsers: 0,
      startedUsers: 0,
    });

    // Sorted worst (lowest completionRate) first.
    expect(json.nodes[0].id).toBe("node-b");
    expect(json.nodes[1].id).toBe("node-a");
  });
});
