import { describe, it, expect, vi, beforeEach } from "vitest";

const mockVerifyAdminAuth = vi.fn();
vi.mock("@/lib/admin/verifyAdminAuth", () => ({
  verifyAdminAuth: () => mockVerifyAdminAuth(),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const mockFrom = vi.fn();
const mockListUsers = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => mockFrom(table),
    auth: { admin: { listUsers: (...args: unknown[]) => mockListUsers(...args) } },
  }),
}));

import { GET } from "@/app/api/admin/users/route";

function req(qs = "") {
  return new Request(`http://localhost/api/admin/users${qs}`);
}

// Table -> default empty result for the paginated-list code path. Every
// table used by the route must be present or a stray call resolves
// `undefined`, and awaiting `undefined` throws.
function defaultListTables(overrides: Record<string, { data: unknown; error: unknown }> = {}) {
  const base: Record<string, { data: unknown; error: unknown }> = {
    users: { data: [], error: null },
    subscriptions: { data: [], error: null },
    cost_logs: { data: [], error: null },
    assessment_attempts: { data: [], error: null },
    competency_scores: { data: [], error: null },
    ...overrides,
  };
  return (table: string) => makeChainable(base[table] ?? { data: [], error: null });
}

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminAuth.mockResolvedValue({
      authorized: true,
      user: { id: "admin-1" },
      profile: { role: "admin" },
    });
    // Re-established every test even after vi.clearAllMocks() — that does
    // NOT undo a prior test's .mockImplementation() override on mockFrom.
    mockFrom.mockImplementation(defaultListTables());
    mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });
  });

  describe("auth gating", () => {
    it("returns 401 for an unauthenticated caller", async () => {
      mockVerifyAdminAuth.mockResolvedValue({
        authorized: false,
        response: new Response(JSON.stringify({ error: "Unauthorized: No active session" }), { status: 401 }),
      });
      const res = await GET(req());
      expect(res.status).toBe(401);
    });

    it("returns 403 for an authenticated non-admin caller", async () => {
      mockVerifyAdminAuth.mockResolvedValue({
        authorized: false,
        response: new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 }),
      });
      const res = await GET(req());
      expect(res.status).toBe(403);
    });
  });

  describe("single-user detail view (?userId=)", () => {
    it("merges profile, scores, roadmap, and recent submissions, computing rounded average readiness", async () => {
      mockFrom.mockImplementation((table: string) => {
        switch (table) {
          case "users":
            return makeChainable({ data: { id: "u1", name: "Alice" }, error: null });
          case "competency_scores":
            return makeChainable({
              data: [
                { skill_node_id: "n1", score: 70, updated_at: "2026-08-01" },
                { skill_node_id: "n2", score: 91, updated_at: "2026-08-02" },
              ],
              error: null,
            });
          case "roadmaps":
            return makeChainable({ data: { nodes: ["n1", "n2"], generated_at: "2026-07-01" }, error: null });
          case "assessment_attempts":
            return makeChainable({
              data: [{ id: "att-1", task_id: "t1", ai_score: 88, created_at: "2026-08-02" }],
              error: null,
            });
          default:
            return makeChainable({ data: [], error: null });
        }
      });

      const res = await GET(req("?userId=u1"));
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.profile).toMatchObject({ id: "u1", name: "Alice" });
      expect(json.readinessPct).toBe(Math.round((70 + 91) / 2)); // 81
      expect(json.competencyScores).toHaveLength(2);
      expect(json.roadmap).toMatchObject({ generated_at: "2026-07-01" });
      expect(json.recentSubmissions).toHaveLength(1);
    });

    it("defaults readinessPct to 0 and empty arrays when the user has no scores/submissions", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "users") return makeChainable({ data: { id: "u2" }, error: null });
        if (table === "roadmaps") return makeChainable({ data: null, error: null });
        return makeChainable({ data: [], error: null });
      });

      const res = await GET(req("?userId=u2"));
      const json = await res.json();
      expect(json.readinessPct).toBe(0);
      expect(json.competencyScores).toEqual([]);
      expect(json.recentSubmissions).toEqual([]);
      expect(json.roadmap).toBeNull();
    });
  });

  describe("paginated list — DB error propagation", () => {
    it("propagates a users-table fetch error as 500", async () => {
      mockFrom.mockImplementation(defaultListTables({ users: { data: null, error: { message: "db down" } } }));
      const res = await GET(req());
      expect(res.status).toBe(500);
    });

    it("propagates an auth.admin.listUsers error as 500", async () => {
      mockFrom.mockImplementation(
        defaultListTables({ users: { data: [{ id: "u1", name: "A", role: "user", created_at: "2026-01-01", updated_at: "2026-01-01" }], error: null } }),
      );
      mockListUsers.mockResolvedValue({ data: null, error: { message: "auth admin unavailable" } });
      const res = await GET(req());
      expect(res.status).toBe(500);
    });
  });

  describe("paginated list — last-active merge logic", () => {
    it("uses the cost_logs timestamp when it is newer than the assessment_attempts timestamp", async () => {
      mockFrom.mockImplementation(
        defaultListTables({
          users: {
            data: [{ id: "u1", name: "Cost User", role: "user", created_at: "2026-01-01", updated_at: "2026-01-05" }],
            error: null,
          },
          cost_logs: { data: [{ user_id: "u1", created_at: "2026-08-01T10:00:00Z" }], error: null },
          assessment_attempts: { data: [{ user_id: "u1", created_at: "2026-07-01T10:00:00Z" }], error: null },
        }),
      );

      const res = await GET(req());
      const json = await res.json();
      const u1 = json.users.find((u: { id: string }) => u.id === "u1");
      expect(u1.last_active_at).toBe("2026-08-01T10:00:00Z");
    });

    it("uses the assessment_attempts timestamp when it is newer than the cost_logs timestamp", async () => {
      mockFrom.mockImplementation(
        defaultListTables({
          users: {
            data: [{ id: "u2", name: "Attempt User", role: "user", created_at: "2026-01-01", updated_at: "2026-01-05" }],
            error: null,
          },
          cost_logs: { data: [{ user_id: "u2", created_at: "2026-07-01T10:00:00Z" }], error: null },
          assessment_attempts: { data: [{ user_id: "u2", created_at: "2026-08-01T10:00:00Z" }], error: null },
        }),
      );

      const res = await GET(req());
      const json = await res.json();
      const u2 = json.users.find((u: { id: string }) => u.id === "u2");
      expect(u2.last_active_at).toBe("2026-08-01T10:00:00Z");
    });

    it("falls back to the profile's updated_at when there is no cost_logs or assessment_attempts activity", async () => {
      mockFrom.mockImplementation(
        defaultListTables({
          users: {
            data: [{ id: "u3", name: "Quiet User", role: "user", created_at: "2026-01-01", updated_at: "2026-02-01" }],
            error: null,
          },
        }),
      );

      const res = await GET(req());
      const json = await res.json();
      const u3 = json.users.find((u: { id: string }) => u.id === "u3");
      expect(u3.last_active_at).toBe("2026-02-01");
    });

    it("falls back all the way to created_at when updated_at is also absent", async () => {
      mockFrom.mockImplementation(
        defaultListTables({
          users: {
            data: [{ id: "u4", name: "No Signal", role: "user", created_at: "2026-01-01", updated_at: null }],
            error: null,
          },
        }),
      );

      const res = await GET(req());
      const json = await res.json();
      const u4 = json.users.find((u: { id: string }) => u.id === "u4");
      expect(u4.last_active_at).toBe("2026-01-01");
    });
  });

  describe("paginated list — sorting, search, tier, email, readiness", () => {
    it("sorts users by last_active_at descending", async () => {
      mockFrom.mockImplementation(
        defaultListTables({
          users: {
            data: [
              { id: "old", name: "Old", role: "user", created_at: "2026-01-01", updated_at: "2026-01-01" },
              { id: "new", name: "New", role: "user", created_at: "2026-01-01", updated_at: "2026-06-01" },
              { id: "mid", name: "Mid", role: "user", created_at: "2026-01-01", updated_at: "2026-03-01" },
            ],
            error: null,
          },
        }),
      );

      const res = await GET(req());
      const json = await res.json();
      expect(json.users.map((u: { id: string }) => u.id)).toEqual(["new", "mid", "old"]);
    });

    it("filters by case-insensitive email or full_name substring match", async () => {
      mockFrom.mockImplementation(
        defaultListTables({
          users: {
            data: [
              { id: "u1", name: "Alice Wonderland", role: "user", created_at: "2026-01-01", updated_at: "2026-01-01" },
              { id: "u2", name: "Bob Builder", role: "user", created_at: "2026-01-01", updated_at: "2026-01-01" },
            ],
            error: null,
          },
        }),
      );
      mockListUsers.mockResolvedValue({
        data: { users: [{ id: "u1", email: "alice@example.com" }, { id: "u2", email: "bob@other.com" }] },
        error: null,
      });

      const byName = await (await GET(req("?search=wonderland"))).json();
      expect(byName.users).toHaveLength(1);
      expect(byName.users[0].id).toBe("u1");

      const byEmail = await (await GET(req("?search=OTHER.COM"))).json();
      expect(byEmail.users).toHaveLength(1);
      expect(byEmail.users[0].id).toBe("u2");
    });

    it("maps tier from subscriptions and defaults to 'free' when absent", async () => {
      mockFrom.mockImplementation(
        defaultListTables({
          users: {
            data: [
              { id: "u1", name: "Pro User", role: "user", created_at: "2026-01-01", updated_at: "2026-01-01" },
              { id: "u2", name: "Free User", role: "user", created_at: "2026-01-01", updated_at: "2026-01-01" },
            ],
            error: null,
          },
          subscriptions: { data: [{ user_id: "u1", tier: "pro" }], error: null },
        }),
      );

      const res = await GET(req());
      const json = await res.json();
      expect(json.users.find((u: { id: string }) => u.id === "u1").tier).toBe("pro");
      expect(json.users.find((u: { id: string }) => u.id === "u2").tier).toBe("free");
    });

    it("computes readinessPct as the rounded average of competency_scores", async () => {
      mockFrom.mockImplementation(
        defaultListTables({
          users: {
            data: [{ id: "u1", name: "Scored", role: "user", created_at: "2026-01-01", updated_at: "2026-01-01" }],
            error: null,
          },
          competency_scores: {
            data: [
              { user_id: "u1", score: 60 },
              { user_id: "u1", score: 81 },
            ],
            error: null,
          },
        }),
      );

      const res = await GET(req());
      const json = await res.json();
      expect(json.users[0].readinessPct).toBe(Math.round((60 + 81) / 2)); // 71
    });

    it("paginates: page 1 returns up to 20 of N users, later pages return the remainder", async () => {
      const users = Array.from({ length: 25 }, (_, i) => ({
        id: `u${i}`,
        name: `User ${i}`,
        role: "user",
        created_at: "2026-01-01",
        updated_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
      }));
      mockFrom.mockImplementation(defaultListTables({ users: { data: users, error: null } }));

      const page1 = await (await GET(req("?page=1"))).json();
      expect(page1.total).toBe(25);
      expect(page1.pageSize).toBe(20);
      expect(page1.page).toBe(1);
      expect(page1.users).toHaveLength(20);

      const page2 = await (await GET(req("?page=2"))).json();
      expect(page2.page).toBe(2);
      expect(page2.users).toHaveLength(5);
    });
  });
});
