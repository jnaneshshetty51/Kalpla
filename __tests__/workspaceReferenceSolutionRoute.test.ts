import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockExecuteLLMCallWithCap = vi.fn();
vi.mock("@/lib/llm/executeLLMCallWithCap", async (importOriginal) => {
  // Keep the REAL UsageCapExceededError class so `instanceof` checks in the
  // route still work against errors thrown from this mock.
  const actual = await importOriginal<typeof import("@/lib/llm/executeLLMCallWithCap")>();
  return {
    ...actual,
    executeLLMCallWithCap: (params: unknown) => mockExecuteLLMCallWithCap(params),
  };
});

vi.mock("@/lib/llm/models", () => ({
  resolveModelConfig: () => ({ provider: "anthropic", modelId: "claude-sonnet-5" }),
}));

function makeChainable(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
  );
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const PROJECT_NO_CACHE = {
  id: "proj-1",
  name: "Build a RAG Pipeline",
  spec: { description: "desc", requirements: ["req 1"] },
  starter_template: "def solve(): pass",
  reference_solution: null,
};

const PROJECT_CACHED = {
  ...PROJECT_NO_CACHE,
  reference_solution: "def solve(): return 42  # cached",
};

let projectRow: typeof PROJECT_NO_CACHE | typeof PROJECT_CACHED = PROJECT_NO_CACHE;
const updateCalls: Array<{ payload: Record<string, unknown> }> = [];

// Default caller has a passing submission on record — matches the
// pre-existing happy-path tests below, which predate the "must pass first"
// gate and assume a legitimate, already-earned request.
let hasPassingSubmission = true;

function defaultMockFromImpl(table: string) {
  if (table === "projects") {
    const chain = makeChainable({ data: projectRow, error: null });
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      updateCalls.push({ payload });
      return chain;
    });
    return chain;
  }
  if (table === "submissions") {
    return makeChainable({ data: hasPassingSubmission ? { id: "sub-1" } : null, error: null });
  }
  return makeChainable({ data: null, error: null });
}

const mockFrom = vi.fn(defaultMockFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { POST } from "@/app/api/workspace/reference-solution/route";
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/workspace/reference-solution", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("app/api/workspace/reference-solution/route.ts — POST (cached, usage-capped solution generation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFromImpl);
    projectRow = PROJECT_NO_CACHE;
    hasPassingSubmission = true;
    updateCalls.length = 0;
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: null });
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: "  def solve(): return 42\n  " });
  });

  it("returns 401 when unauthenticated, without calling the LLM", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });

    const res = await POST(makeRequest({ project_id: "proj-1" }));

    expect(res.status).toBe(401);
    expect(mockExecuteLLMCallWithCap).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON body", async () => {
    const badReq = new Request("http://localhost/api/workspace/reference-solution", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("returns 400 when project_id is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the project doesn't exist", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "projects") return makeChainable({ data: null, error: null });
      return defaultMockFromImpl(table);
    });

    const res = await POST(makeRequest({ project_id: "missing" }));
    expect(res.status).toBe(404);
  });

  it("cache hit: returns the cached reference_solution and never calls the LLM or the usage cap", async () => {
    projectRow = PROJECT_CACHED;

    const res = await POST(makeRequest({ project_id: "proj-1" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ reference_solution: PROJECT_CACHED.reference_solution, cached: true });
    expect(mockExecuteLLMCallWithCap).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("cache miss: generates via the capped LLM call using the 'expensive' tier and feature 'workspace_reference_solution'", async () => {
    const res = await POST(makeRequest({ project_id: "proj-1" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.cached).toBe(false);
    expect(json.reference_solution).toBe("def solve(): return 42");
    expect(mockExecuteLLMCallWithCap).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "usr-1", feature: "workspace_reference_solution" }),
    );
  });

  it("cache miss: persists the newly generated solution back onto the project row", async () => {
    await POST(makeRequest({ project_id: "proj-1" }));

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toMatchObject({ reference_solution: "def solve(): return 42" });
    expect(typeof updateCalls[0].payload.reference_solution_generated_at).toBe("string");
  });

  it("forwards usageWarning from the LLM call on a cache-miss generation", async () => {
    mockExecuteLLMCallWithCap.mockResolvedValue({
      content: "def solve(): return 42",
      usageWarning: { feature: "workspace_reference_solution", currentUsage: 4, limit: 5, percentUsed: 80 },
    });

    const res = await POST(makeRequest({ project_id: "proj-1" }));
    const json = await res.json();
    expect(json.usageWarning).toEqual({ feature: "workspace_reference_solution", currentUsage: 4, limit: 5, percentUsed: 80 });
  });

  it("returns 429 with the cap's error details when the usage cap is exceeded, and never caches a solution", async () => {
    const capDetails = {
      allowed: false as const,
      error: "usage_cap_exceeded" as const,
      feature: "workspace_reference_solution",
      resetDate: "2026-09-01T00:00:00.000Z",
      limit: 5,
      currentUsage: 5,
    };
    mockExecuteLLMCallWithCap.mockRejectedValue(new UsageCapExceededError(capDetails));

    const res = await POST(makeRequest({ project_id: "proj-1" }));

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json).toEqual(capDetails);
    expect(updateCalls).toHaveLength(0);
  });

  it("returns 500 on an unexpected error from the LLM call", async () => {
    mockExecuteLLMCallWithCap.mockRejectedValue(new Error("provider unreachable"));

    const res = await POST(makeRequest({ project_id: "proj-1" }));
    expect(res.status).toBe(500);
  });

  it("blocks (403) a caller with no passing submission for this project — no LLM call, no cache read either", async () => {
    hasPassingSubmission = false;
    projectRow = PROJECT_CACHED; // even an already-cached solution must not leak to someone who hasn't earned it

    const res = await POST(makeRequest({ project_id: "proj-1" }));

    expect(res.status).toBe(403);
    expect(mockExecuteLLMCallWithCap).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.reference_solution).toBeUndefined();
  });

  it("allows a caller who has a real passing submission on record", async () => {
    hasPassingSubmission = true;

    const res = await POST(makeRequest({ project_id: "proj-1" }));
    expect(res.status).toBe(200);
  });
});
