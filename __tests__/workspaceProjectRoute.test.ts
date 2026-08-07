import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

function makeChainable(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "update", "insert"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
  );
  // Some queries (the count/head queries) are awaited directly without a
  // terminal .maybeSingle()/.single() call — make the chain itself thenable.
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const PROJECT = {
  id: "proj-1",
  name: "Build a RAG Pipeline",
  tier: "pro",
  spec: { description: "desc", requirements: ["req 1"] },
  starter_template: "def solve(): pass",
  reference_solution: "def solve(): return 42",
};

function defaultMockFromImpl(table: string) {
  if (table === "projects") return makeChainable({ data: PROJECT, error: null });
  if (table === "submissions") return makeChainable({ data: null, error: null });
  if (table === "workspace_hints") return makeChainable({ count: 0, error: null });
  // Default fixture project is "pro" tier — default the caller to a "pro"
  // subscription too, so every pre-existing happy-path test below (which
  // predates the tier gate) keeps exercising a legitimate pro-user-accesses-
  // pro-project scenario rather than tripping the gate incidentally.
  if (table === "subscriptions") return makeChainable({ data: { tier: "pro" }, error: null });
  return makeChainable({ data: null, error: null });
}

const mockFrom = vi.fn(defaultMockFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { GET } from "@/app/api/workspace/[project]/route";

function makeParams(project: string) {
  return { params: Promise.resolve({ project }) };
}

describe("app/api/workspace/[project]/route.ts — GET (workspace bootstrap)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFromImpl);
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: null });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });

    const res = await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));

    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 404 when the project doesn't exist", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "projects") return makeChainable({ data: null, error: null });
      return defaultMockFromImpl(table);
    });

    const res = await GET(new Request("http://localhost/api/workspace/missing"), makeParams("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the projects query errors", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "projects") return makeChainable({ data: null, error: { message: "db down" } });
      return defaultMockFromImpl(table);
    });

    const res = await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));
    expect(res.status).toBe(404);
  });

  it("returns 500 when an unexpected error is thrown", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("connection refused");
    });

    const res = await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));
    expect(res.status).toBe(500);
  });

  it("shapes the happy-path response: project fields, has_reference_solution, hints_used_total", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "workspace_hints") return makeChainable({ count: 4, error: null });
      return defaultMockFromImpl(table);
    });

    const res = await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.project).toMatchObject({
      id: "proj-1",
      name: "Build a RAG Pipeline",
      tier: "pro",
      has_reference_solution: true,
    });
    expect(json.hints_used_total).toBe(4);
  });

  it("has_reference_solution is false when the project has no cached reference solution", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "projects") return makeChainable({ data: { ...PROJECT, reference_solution: null }, error: null });
      return defaultMockFromImpl(table);
    });

    const res = await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));
    const json = await res.json();
    expect(json.project.has_reference_solution).toBe(false);
  });

  it("resume_code comes from the user's latest submission when one exists, not the starter template", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "submissions") {
        return makeChainable({
          data: {
            id: "sub-1",
            code: "def solve(): return 'resumed'",
            status: "failed",
            ai_review: null,
            metadata: {},
            created_at: "2026-08-01T00:00:00Z",
          },
          error: null,
        });
      }
      return defaultMockFromImpl(table);
    });

    const res = await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));
    const json = await res.json();

    expect(json.resume_code).toBe("def solve(): return 'resumed'");
    expect(json.latest_submission).toMatchObject({ id: "sub-1", status: "failed" });
  });

  it("resume_code falls back to the project's starter_template when there is no prior submission", async () => {
    const res = await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));
    const json = await res.json();

    expect(json.resume_code).toBe("def solve(): pass");
    expect(json.latest_submission).toBeNull();
  });

  it("resume_code falls back to empty string when there's neither a submission nor a starter template", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "projects") return makeChainable({ data: { ...PROJECT, starter_template: null }, error: null });
      return defaultMockFromImpl(table);
    });

    const res = await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));
    const json = await res.json();
    expect(json.resume_code).toBe("");
  });

  it("hints_used_total defaults to 0 when the count comes back null", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "workspace_hints") return makeChainable({ count: null, error: null });
      return defaultMockFromImpl(table);
    });

    const res = await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));
    const json = await res.json();
    expect(json.hints_used_total).toBe(0);
  });

  it("a free-tier caller is blocked (403) from a 'pro' tier project's spec/starter template", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "subscriptions") return makeChainable({ data: { tier: "free" }, error: null });
      return defaultMockFromImpl(table);
    });

    const res = await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.project).toBeUndefined(); // no spec leaked in the error response
  });

  it("a caller with NO subscriptions row at all defaults to free tier and is blocked from a 'pro' project", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "subscriptions") return makeChainable({ data: null, error: null });
      return defaultMockFromImpl(table);
    });

    const res = await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));
    expect(res.status).toBe(403);
  });

  it("a pro-tier caller is allowed into a 'pro' tier project", async () => {
    const res = await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.project.tier).toBe("pro");
    expect(json.project.spec).toEqual(PROJECT.spec);
  });

  it("a premium-tier caller is also allowed into a 'pro' tier project (higher tiers include lower ones)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "subscriptions") return makeChainable({ data: { tier: "premium" }, error: null });
      return defaultMockFromImpl(table);
    });

    const res = await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));
    expect(res.status).toBe(200);
  });

  it("a free-tier caller can freely access a 'free' tier project — no subscription lookup even needed", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "projects") return makeChainable({ data: { ...PROJECT, tier: "free" }, error: null });
      if (table === "subscriptions") throw new Error("should never query subscriptions for a free project");
      return defaultMockFromImpl(table);
    });

    const res = await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));
    expect(res.status).toBe(200);
  });

  it("scopes the submission and hint-count lookups to the authenticated caller's user_id", async () => {
    const submissionsEqCalls: unknown[][] = [];
    const hintsEqCalls: unknown[][] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === "submissions") {
        const chain = makeChainable({ data: null, error: null });
        chain.eq = vi.fn((...args: unknown[]) => {
          submissionsEqCalls.push(args);
          return chain;
        });
        return chain;
      }
      if (table === "workspace_hints") {
        const chain = makeChainable({ count: 0, error: null });
        chain.eq = vi.fn((...args: unknown[]) => {
          hintsEqCalls.push(args);
          return chain;
        });
        return chain;
      }
      return defaultMockFromImpl(table);
    });

    await GET(new Request("http://localhost/api/workspace/proj-1"), makeParams("proj-1"));

    expect(submissionsEqCalls).toContainEqual(["user_id", "usr-1"]);
    expect(hintsEqCalls).toContainEqual(["user_id", "usr-1"]);
  });
});
