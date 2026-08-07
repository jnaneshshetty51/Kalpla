import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  rateLimitedResponse: () => ({
    error: "Too many requests — please wait before trying again.",
    code: "RATE_LIMITED",
  }),
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
  resolveModelConfig: () => ({ provider: "anthropic", modelId: "claude-haiku-4-5" }),
}));

function makeChainable(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "insert"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
  );
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const PROJECT = {
  id: "proj-1",
  name: "Build a RAG Pipeline",
  spec: { description: "desc", requirements: ["req 1", "req 2"] },
};

let priorHintCount = 0;
const insertedHints: Array<Record<string, unknown>> = [];

function defaultMockFromImpl(table: string) {
  if (table === "projects") return makeChainable({ data: PROJECT, error: null });
  if (table === "workspace_hints") {
    const chain = makeChainable({ count: priorHintCount, error: null });
    chain.insert = vi.fn((payload: Record<string, unknown>) => {
      insertedHints.push(payload);
      return Promise.resolve({ data: null, error: null });
    });
    return chain;
  }
  return makeChainable({ data: null, error: null });
}

const mockFrom = vi.fn(defaultMockFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { POST } from "@/app/api/workspace/hint/route";
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/workspace/hint", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("app/api/workspace/hint/route.ts — POST (escalating AI hints, usage-capped)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFromImpl);
    priorHintCount = 0;
    insertedHints.length = 0;
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: null });
    mockCheckRateLimit.mockReturnValue(false);
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: "  Focus on the loop bounds.  " });
  });

  it("returns 401 when unauthenticated, without calling the LLM", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });

    const res = await POST(makeRequest({ project_id: "proj-1", code: "" }));

    expect(res.status).toBe(401);
    expect(mockExecuteLLMCallWithCap).not.toHaveBeenCalled();
  });

  it("returns 429 (rate limited) before touching the LLM", async () => {
    mockCheckRateLimit.mockReturnValue(true);

    const res = await POST(makeRequest({ project_id: "proj-1", code: "" }));

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.code).toBe("RATE_LIMITED");
    expect(mockExecuteLLMCallWithCap).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON body", async () => {
    const badReq = new Request("http://localhost/api/workspace/hint", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("returns 400 when project_id is missing", async () => {
    const res = await POST(makeRequest({ code: "print(1)" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the project doesn't exist", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "projects") return makeChainable({ data: null, error: null });
      return defaultMockFromImpl(table);
    });

    const res = await POST(makeRequest({ project_id: "missing", code: "" }));
    expect(res.status).toBe(404);
  });

  it("computes level 1 for a first-time hint request (no prior hints)", async () => {
    priorHintCount = 0;

    const res = await POST(makeRequest({ project_id: "proj-1", code: "" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.level).toBe(1);
    const callArgs = mockExecuteLLMCallWithCap.mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(callArgs.messages[0].content).toContain("LEVEL 1 hint");
  });

  it("escalates to level 2 after one prior hint", async () => {
    priorHintCount = 1;

    const res = await POST(makeRequest({ project_id: "proj-1", code: "" }));
    const json = await res.json();

    expect(json.level).toBe(2);
    const callArgs = mockExecuteLLMCallWithCap.mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(callArgs.messages[0].content).toContain("LEVEL 2 hint");
  });

  it("caps the level at 3 even with many prior hints on record", async () => {
    priorHintCount = 9;

    const res = await POST(makeRequest({ project_id: "proj-1", code: "" }));
    const json = await res.json();

    expect(json.level).toBe(3);
    const callArgs = mockExecuteLLMCallWithCap.mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(callArgs.messages[0].content).toContain("LEVEL 3 hint");
  });

  it("ignores a client-supplied 'level' and always computes it server-side from real hint history (prevents skipping straight to level 3)", async () => {
    priorHintCount = 0; // server history says this should be level 1...

    // ...but the client tries to request level 3 directly.
    const res = await POST(makeRequest({ project_id: "proj-1", code: "", level: 3 }));
    const json = await res.json();

    expect(json.level).toBe(1);
    const callArgs = mockExecuteLLMCallWithCap.mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(callArgs.messages[0].content).toContain("LEVEL 1 hint");
    expect(callArgs.messages[0].content).not.toContain("LEVEL 3 hint");
  });

  it("returns the trimmed hint text, level, and forwards usageWarning from the LLM call", async () => {
    mockExecuteLLMCallWithCap.mockResolvedValue({
      content: "  Try iterating with a sliding window.  ",
      usageWarning: { feature: "workspace_hint", currentUsage: 8, limit: 10, percentUsed: 80 },
    });

    const res = await POST(makeRequest({ project_id: "proj-1", code: "" }));
    const json = await res.json();

    expect(json.hint).toBe("Try iterating with a sliding window.");
    expect(json.usageWarning).toEqual({ feature: "workspace_hint", currentUsage: 8, limit: 10, percentUsed: 80 });
  });

  it("passes userId and feature 'workspace_hint' through to the capped LLM call", async () => {
    await POST(makeRequest({ project_id: "proj-1", code: "x = 1" }));

    expect(mockExecuteLLMCallWithCap).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "usr-1", feature: "workspace_hint" }),
    );
  });

  it("records the hint (user, project, level, code snapshot) after a successful LLM call", async () => {
    priorHintCount = 1;

    await POST(makeRequest({ project_id: "proj-1", code: "def f(): pass" }));

    expect(insertedHints).toHaveLength(1);
    expect(insertedHints[0]).toMatchObject({
      user_id: "usr-1",
      project_id: "proj-1",
      level: 2,
      code_snapshot: "def f(): pass",
    });
  });

  it("returns 429 with the cap's error details when the usage cap is exceeded, and never records a hint", async () => {
    const capDetails = {
      allowed: false as const,
      error: "usage_cap_exceeded" as const,
      feature: "workspace_hint",
      resetDate: "2026-09-01T00:00:00.000Z",
      limit: 10,
      currentUsage: 10,
    };
    mockExecuteLLMCallWithCap.mockRejectedValue(new UsageCapExceededError(capDetails));

    const res = await POST(makeRequest({ project_id: "proj-1", code: "" }));

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json).toEqual(capDetails);
    expect(insertedHints).toHaveLength(0);
  });

  it("returns 500 on an unexpected error from the LLM call", async () => {
    mockExecuteLLMCallWithCap.mockRejectedValue(new Error("provider unreachable"));

    const res = await POST(makeRequest({ project_id: "proj-1", code: "" }));
    expect(res.status).toBe(500);
  });
});
