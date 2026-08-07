import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => mockFrom(table) }),
}));

import { POST } from "@/app/api/admin/lessons/route";

function req(body: unknown) {
  return new Request("http://localhost/api/admin/lessons", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  skill_node_id: "node-1",
  title: "Intro to RAG",
  content_markdown: "# RAG\n\nRetrieval augmented generation combines retrieval with generation.",
};

/** Covers the `.select("version").eq(...).order(...).limit(1)` version lookup chain. */
function makeVersionLookupChain(existingVersions: Array<{ version: number }>) {
  const eqCalls: unknown[][] = [];
  const orderCalls: unknown[][] = [];
  const limitCalls: unknown[] = [];
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((...args: unknown[]) => {
    eqCalls.push(args);
    return chain;
  });
  chain.order = vi.fn((...args: unknown[]) => {
    orderCalls.push(args);
    return chain;
  });
  chain.limit = vi.fn((n: unknown) => {
    limitCalls.push(n);
    return chain;
  });
  chain.then = (resolve: (v: { data: unknown; error: unknown }) => void) =>
    resolve({ data: existingVersions, error: null });
  return { chain, eqCalls, orderCalls, limitCalls };
}

/** Covers the `.insert(payload).select().single()` chain. */
function makeInsertChain(result: { data: unknown; error: unknown }) {
  let insertPayload: unknown;
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn((payload: unknown) => {
    insertPayload = payload;
    return chain;
  });
  chain.select = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(result));
  return { chain, getInsertPayload: () => insertPayload };
}

/** Wires mockFrom so the 1st `.from("lessons")` call (version lookup) gets `lookupChain`
 *  and the 2nd (`insert`) gets `insertChain` — matching the real handler's call order. */
function wireLessonsCalls(lookupChain: unknown, insertChain: unknown) {
  let call = 0;
  mockFrom.mockImplementation((table: string) => {
    expect(table).toBe("lessons");
    call += 1;
    return call === 1 ? lookupChain : insertChain;
  });
}

describe("POST /api/admin/lessons — creating a new lesson version", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({
      user: { id: "admin-1" },
      profile: { role: "admin" },
    });
  });

  it("returns 403 when the caller isn't an admin", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "u1" }, profile: { role: "student" } });

    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 401 (not 403) when there is no authenticated user at all — distinct from the logged-in-but-not-admin case", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });

    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 when title is missing", async () => {
    const { title, ...rest } = validBody;
    void title;
    const res = await POST(req(rest));
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 when content_markdown is missing", async () => {
    const { content_markdown, ...rest } = validBody;
    void content_markdown;
    const res = await POST(req(rest));
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 when skill_node_id is missing", async () => {
    const { skill_node_id, ...rest } = validBody;
    void skill_node_id;
    const res = await POST(req(rest));
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("assigns version 1 when no prior versions exist for the skill_node_id", async () => {
    const lookup = makeVersionLookupChain([]);
    const insert = makeInsertChain({
      data: { id: "lesson-1", skill_node_id: "node-1", version: 1, title: "Intro to RAG" },
      error: null,
    });
    wireLessonsCalls(lookup.chain, insert.chain);

    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.version).toBe(1);

    expect(lookup.eqCalls[0]).toEqual(["skill_node_id", "node-1"]);
    expect(lookup.orderCalls[0]).toEqual(["version", { ascending: false }]);
    expect(lookup.limitCalls[0]).toBe(1);
    expect((insert.getInsertPayload() as { version: number }).version).toBe(1);
  });

  it("assigns version 3 when versions 1 and 2 already exist", async () => {
    // A real `.order("version",{ascending:false}).limit(1)` query returns only the
    // single highest-version row (2), not the full [1,2] history.
    const lookup = makeVersionLookupChain([{ version: 2 }]);
    const insert = makeInsertChain({
      data: { id: "lesson-3", skill_node_id: "node-1", version: 3, title: "Intro to RAG" },
      error: null,
    });
    wireLessonsCalls(lookup.chain, insert.chain);

    const res = await POST(req(validBody));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.version).toBe(3);

    expect(lookup.eqCalls[0]).toEqual(["skill_node_id", "node-1"]);
    expect(lookup.orderCalls[0]).toEqual(["version", { ascending: false }]);
    expect(lookup.limitCalls[0]).toBe(1);
    expect((insert.getInsertPayload() as { version: number }).version).toBe(3);
  });

  it("stores code_example as null (not undefined or empty string) when omitted", async () => {
    const lookup = makeVersionLookupChain([]);
    const insert = makeInsertChain({ data: { id: "lesson-1", version: 1 }, error: null });
    wireLessonsCalls(lookup.chain, insert.chain);

    await POST(req(validBody)); // validBody has no code_example key

    const payload = insert.getInsertPayload() as { code_example: unknown };
    expect(payload.code_example).toBeNull();
  });

  it("defaults discussion_questions to [] when the field isn't an array", async () => {
    const lookup = makeVersionLookupChain([]);
    const insert = makeInsertChain({ data: { id: "lesson-1", version: 1 }, error: null });
    wireLessonsCalls(lookup.chain, insert.chain);

    await POST(req({ ...validBody, discussion_questions: "not-an-array" }));

    const payload = insert.getInsertPayload() as { discussion_questions: unknown };
    expect(payload.discussion_questions).toEqual([]);
  });

  it("returns 500 with the DB error message when the insert fails, not a silent success", async () => {
    const lookup = makeVersionLookupChain([]);
    const insert = makeInsertChain({ data: null, error: { message: "unique constraint violated" } });
    wireLessonsCalls(lookup.chain, insert.chain);

    const res = await POST(req(validBody));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("unique constraint violated");
  });
});
