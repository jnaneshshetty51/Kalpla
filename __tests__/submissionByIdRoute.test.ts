import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
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

const SUBMISSION_ROW = {
  id: "sub-1",
  user_id: "usr-owner",
  project_id: "proj-1",
  code: "def f(): pass",
  reflection: "it was hard",
  ai_review: { overall_score: 80 },
  status: "passed",
  metadata: {},
  created_at: "2026-08-01T00:00:00Z",
};

const PROJECT_ROW = { id: "proj-1", name: "RAG Chunker", spec: { type: "rag" } };

let submissionRow: unknown = SUBMISSION_ROW;
let submissionError: unknown = null;
let projectRow: unknown = PROJECT_ROW;

function defaultMockFromImpl(table: string) {
  if (table === "submissions") return makeChainable({ data: submissionRow, error: submissionError });
  if (table === "projects") return makeChainable({ data: projectRow, error: null });
  return makeChainable({ data: null, error: null });
}

const mockFrom = vi.fn(defaultMockFromImpl);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { GET } from "@/app/api/submissions/[id]/route";

function reqWithParams(id: string) {
  const request = new Request(`http://localhost/api/submissions/${id}`);
  return { request, params: Promise.resolve({ id }) };
}

describe("app/api/submissions/[id]/route.ts — GET (fetch a single submission, ownership-gated)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultMockFromImpl);
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-owner" }, profile: { role: "user" } });
    submissionRow = SUBMISSION_ROW;
    submissionError = null;
    projectRow = PROJECT_ROW;
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });
    const { request, params } = reqWithParams("sub-1");
    const res = await GET(request, { params });
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 404 when the submission does not exist", async () => {
    submissionRow = null;
    const { request, params } = reqWithParams("missing");
    const res = await GET(request, { params });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the submission lookup errors", async () => {
    submissionRow = null;
    submissionError = { message: "db down" };
    const { request, params } = reqWithParams("sub-1");
    const res = await GET(request, { params });
    expect(res.status).toBe(404);
  });

  it("SECURITY: returns 403, not the data, when a non-owning, non-admin user requests someone else's submission", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-attacker" }, profile: { role: "user" } });
    const { request, params } = reqWithParams("sub-1");
    const res = await GET(request, { params });
    expect(res.status).toBe(403);
    const json = await res.json();
    // Must not leak any submission fields in the forbidden response.
    expect(json.submission).toBeUndefined();
    expect(json.code).toBeUndefined();
  });

  it("returns 200 with the full submission + project when the caller owns the submission", async () => {
    const { request, params } = reqWithParams("sub-1");
    const res = await GET(request, { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.submission).toMatchObject({ id: "sub-1", user_id: "usr-owner" });
    expect(json.project).toMatchObject({ id: "proj-1", name: "RAG Chunker" });
  });

  it("allows an admin to view another user's submission", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-admin" }, profile: { role: "admin" } });
    const { request, params } = reqWithParams("sub-1");
    const res = await GET(request, { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.submission.id).toBe("sub-1");
  });

  it("returns 500 (not swallowed) when an unexpected error is thrown", async () => {
    mockGetServerUser.mockRejectedValue(new Error("session store unavailable"));
    const { request, params } = reqWithParams("sub-1");
    const res = await GET(request, { params });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal Server Error");
  });
});
