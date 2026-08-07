import { describe, it, expect, vi, beforeEach } from "vitest";

const mockVerifyAdminAuth = vi.fn();
vi.mock("@/lib/admin/verifyAdminAuth", () => ({
  verifyAdminAuth: () => mockVerifyAdminAuth(),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "gte", "order"]) {
    chain[m] = vi.fn(() => chain);
  }
  // The real query has no terminal .single()/.maybeSingle() — awaiting the
  // chain itself resolves it, so make the chain thenable too.
  chain.then = (resolve: (value: typeof result) => void) => resolve(result);
  return chain;
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => mockFrom(table) }),
}));

import { GET } from "@/app/api/admin/cost-analytics/route";

describe("GET /api/admin/cost-analytics — real aggregation logic (previously 500'd on wrong column names)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminAuth.mockResolvedValue({
      authorized: true,
      user: { id: "admin-1" },
      profile: { role: "admin" },
    });
  });

  it("returns the admin's own 403 response unmodified when the caller isn't an admin", async () => {
    const forbidden = new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
    mockVerifyAdminAuth.mockResolvedValue({ authorized: false, response: forbidden });

    const res = await GET(new Request("http://localhost/api/admin/cost-analytics"));
    expect(res.status).toBe(403);
  });

  it("selects only real cost_logs columns (no provider/total_tokens/details) and derives totals correctly", async () => {
    const rows = [
      { user_id: "u1", feature: "tutor_chat", model: "claude-haiku-4-5", tokens_in: 100, tokens_out: 50, cost_usd: 0.01, created_at: "2026-08-01T10:00:00Z" },
      { user_id: "u2", feature: "roadmap_generation", model: "claude-sonnet-5", tokens_in: 200, tokens_out: 100, cost_usd: 0.02, created_at: "2026-08-01T14:00:00Z" },
      { user_id: "u1", feature: "tutor_chat", model: "claude-haiku-4-5", tokens_in: 80, tokens_out: 40, cost_usd: 0.005, created_at: "2026-08-02T09:00:00Z" },
      { user_id: "u1", feature: "tutor_chat_cache", model: "cache-hit", tokens_in: 0, tokens_out: 0, cost_usd: 0, created_at: "2026-08-02T10:00:00Z" },
    ];

    let selectedColumns = "";
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe("cost_logs");
      const chain = makeChainable({ data: rows, error: null });
      const realSelect = chain.select as (cols: string) => unknown;
      chain.select = vi.fn((cols: string) => {
        selectedColumns = cols;
        return realSelect(cols);
      });
      return chain;
    });

    const res = await GET(new Request("http://localhost/api/admin/cost-analytics?days=30"));
    expect(res.status).toBe(200);
    const json = await res.json();

    // The real, previously-broken bug: querying nonexistent provider/total_tokens/details columns.
    expect(selectedColumns).not.toMatch(/provider|total_tokens|details/);
    expect(selectedColumns).toContain("tokens_in");
    expect(selectedColumns).toContain("tokens_out");

    expect(json.totalCalls).toBe(4);
    expect(json.activeUsers).toBe(2); // u1, u2
    expect(json.totalCost).toBeCloseTo(0.035, 5);
    expect(json.costPerActiveUser).toBeCloseTo(0.035 / 2, 5);
    expect(json.cacheHitCount).toBe(1); // model === "cache-hit" is the real marker

    expect(json.timeSeries).toHaveLength(2);
    expect(json.timeSeries[0]).toMatchObject({ date: "2026-08-01" });
    expect(json.timeSeries[1]).toMatchObject({ date: "2026-08-02" });

    const tutorFeature = json.featureBreakdown.find((f: { feature: string }) => f.feature === "tutor_chat");
    expect(tutorFeature.calls).toBe(2);
  });

  it("propagates a DB error as a 500 instead of silently returning empty data", async () => {
    mockFrom.mockImplementation(() => makeChainable({ data: null, error: { message: "connection refused" } }));

    const res = await GET(new Request("http://localhost/api/admin/cost-analytics"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/connection refused/);
  });

  it("clamps the days window to a maximum of 90 even if a larger value is requested", async () => {
    let capturedSince: string | null = null;
    mockFrom.mockImplementation(() => {
      const chain = makeChainable({ data: [], error: null });
      const realGte = chain.gte as (col: string, since: string) => unknown;
      chain.gte = vi.fn((_col: string, since: string) => {
        capturedSince = since;
        return realGte(_col, since);
      });
      return chain;
    });

    const res = await GET(new Request("http://localhost/api/admin/cost-analytics?days=365"));
    const json = await res.json();
    expect(json.days).toBe(90);

    const daysAgo = Math.round((Date.now() - new Date(capturedSince!).getTime()) / (1000 * 60 * 60 * 24));
    expect(daysAgo).toBeGreaterThanOrEqual(89);
    expect(daysAgo).toBeLessThanOrEqual(91);
  });
});
