import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "or", "order", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { GET } from "@/app/api/learn/[skill]/route";

function reqWithSkill(skill: string) {
  return GET(new Request("http://localhost/api/learn/" + skill), { params: Promise.resolve({ skill }) });
}

function defaultFromImpl(table: string) {
  if (table === "skill_nodes") return makeChainable({ data: null, error: null });
  if (table === "tutor_conversations") return makeChainable({ data: null, error: null });
  if (table === "lessons") return makeChainable({ data: null, error: null });
  return makeChainable({ data: null, error: null });
}

describe("GET /api/learn/[skill] — lesson content + conversation history for the tutor page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultFromImpl);
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null });
    const res = await reqWithSkill("node-1");
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("URI-decodes the skill param before querying", async () => {
    let queriedOr = "";
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") {
        const chain = makeChainable({ data: null, error: null });
        chain.or = vi.fn((filter: string) => {
          queriedOr = filter;
          return chain;
        });
        return chain;
      }
      return defaultFromImpl(table);
    });

    await reqWithSkill(encodeURIComponent("node one"));
    expect(queriedOr).toContain("node one");
  });

  it("uses the DB skill_nodes row when one is found, rather than synthesizing a fallback", async () => {
    const dbNode = {
      id: "node-1",
      name: "Vector Databases",
      category: "Embeddings & Retrieval",
      difficulty: 3,
      order_index: 5,
      description: "Real DB description.",
      prerequisite_ids: ["node-0"],
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") return makeChainable({ data: dbNode, error: null });
      return defaultFromImpl(table);
    });

    const res = await reqWithSkill("node-1");
    const json = await res.json();
    expect(json.node).toEqual(dbNode);
  });

  it("synthesizes a fallback skill node when none exists in the DB, referencing the requested skill", async () => {
    const res = await reqWithSkill("prompt-engineering");
    const json = await res.json();

    expect(json.node.id).toBe("prompt-engineering");
    expect(json.node.name).toBe("prompt engineering"); // dashes replaced with spaces
    expect(json.node.category).toBe("GenAI Engineering");
    expect(json.node.difficulty).toBe(2);
    expect(json.node.prerequisite_ids).toEqual([]);
    expect(json.node.description).toContain("prompt-engineering");
  });

  it("returns the real conversation history array when one exists for this user/node", async () => {
    const messages = [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }];
    mockFrom.mockImplementation((table: string) => {
      if (table === "tutor_conversations") return makeChainable({ data: { messages }, error: null });
      return defaultFromImpl(table);
    });

    const res = await reqWithSkill("node-1");
    const json = await res.json();
    expect(json.conversation_history).toEqual(messages);
  });

  it("returns an empty conversation_history array when none exists, or messages isn't an array", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "tutor_conversations") return makeChainable({ data: { messages: "not-an-array" }, error: null });
      return defaultFromImpl(table);
    });

    const res = await reqWithSkill("node-1");
    const json = await res.json();
    expect(json.conversation_history).toEqual([]);
  });

  it("uses the real lesson row's content, code, version, and discussion questions when a lesson exists", async () => {
    const dbLesson = {
      version: 4,
      title: "Deep Dive: Vector Databases",
      content_markdown: "# Real lesson content",
      code_example: "const x = realCode();",
      discussion_questions: ["Why does indexing matter?"],
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "lessons") return makeChainable({ data: dbLesson, error: null });
      return defaultFromImpl(table);
    });

    const res = await reqWithSkill("node-1");
    const json = await res.json();

    expect(json.lesson.title).toBe("Deep Dive: Vector Databases");
    expect(json.lesson.version).toBe(4);
    expect(json.lesson.sections[0].content).toBe("# Real lesson content");
    expect(json.lesson.sections[1].code).toBe("const x = realCode();");
    expect(json.lesson.sections[2].bullets).toEqual(["Why does indexing matter?"]);
  });

  it("synthesizes fallback lesson content (markdown, code example, discussion questions) referencing the node name when no lesson row exists", async () => {
    const res = await reqWithSkill("retrieval-augmented-generation");
    const json = await res.json();

    expect(json.lesson.version).toBe(1);
    expect(json.lesson.title).toBe(json.node.name);

    const [conceptSection, codeSection, discussionSection] = json.lesson.sections;
    expect(typeof conceptSection.content).toBe("string");
    expect(conceptSection.content).toContain(json.node.name);

    expect(typeof codeSection.code).toBe("string");
    expect(codeSection.code.length).toBeGreaterThan(0);

    expect(Array.isArray(discussionSection.bullets)).toBe(true);
    expect(discussionSection.bullets.length).toBeGreaterThan(0);
    for (const q of discussionSection.bullets) {
      expect(q).toContain(json.node.name);
    }
  });

  it("returns 500 rather than crashing when a DB call throws unexpectedly", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("connection pool exhausted");
    });

    const res = await reqWithSkill("node-1");
    expect(res.status).toBe(500);
  });
});
