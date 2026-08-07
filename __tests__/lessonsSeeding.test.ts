import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => mockFrom(table) }),
}));

import { GET } from "@/app/api/admin/lessons/route";

interface Row {
  [key: string]: unknown;
}

/**
 * A query-builder chain whose `.order()` performs a REAL sort of the
 * underlying rows (unlike a typical no-op stub). This matters here because
 * the route trusts the DB to have already sorted results and does no
 * re-sorting itself (e.g. it just takes `versions[0]` as "latest") — so
 * feeding it out-of-order rows only proves the route reads real ordering
 * behavior if the mock actually sorts on `.order()`, exactly like Supabase
 * would.
 */
function makeOrderedChain(initialRows: Row[], errorOverride: { message: string } | null = null) {
  let rows = [...initialRows];
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn((col: string, opts: { ascending: boolean }) => {
    rows = [...rows].sort((a, b) => {
      const diff = Number(a[col]) - Number(b[col]);
      return opts.ascending ? diff : -diff;
    });
    return chain;
  });
  chain.then = (resolve: (v: { data: unknown; error: unknown }) => void) =>
    resolve(errorOverride ? { data: null, error: errorOverride } : { data: rows, error: null });
  return chain;
}

describe("GET /api/admin/lessons — nodes with latest lesson + version history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({
      user: { id: "admin-1" },
      profile: { role: "admin" },
    });
  });

  it("returns 403 when the caller isn't an admin", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "u1" }, profile: { role: "student" } });

    const res = await GET();
    expect(res.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns skill nodes ordered by order_index, regardless of DB row order", async () => {
    const nodes: Row[] = [
      { id: "node-c", name: "Node C", category: "cat", difficulty: "easy", order_index: 2, description: "" },
      { id: "node-a", name: "Node A", category: "cat", difficulty: "easy", order_index: 0, description: "" },
      { id: "node-b", name: "Node B", category: "cat", difficulty: "easy", order_index: 1, description: "" },
    ];
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") return makeOrderedChain(nodes);
      if (table === "lessons") return makeOrderedChain([]);
      throw new Error(`unexpected table ${table}`);
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.nodes.map((n: { order_index: number }) => n.order_index)).toEqual([0, 1, 2]);
    expect(json.nodes.map((n: { id: string }) => n.id)).toEqual(["node-a", "node-b", "node-c"]);
  });

  it("for a node WITH lesson rows, current_version/latest_lesson reflect the HIGHEST version (built from out-of-order mock rows), and all_versions covers every version with just {version, title, created_at}", async () => {
    const nodes: Row[] = [
      { id: "node-1", name: "RAG Basics", category: "cat", difficulty: "easy", order_index: 0, description: "" },
    ];
    // Deliberately out of insertion order (2, 1, 3) — only a real `.order()`
    // sort (simulated by makeOrderedChain) makes versions[0] resolve to v3.
    const lessons: Row[] = [
      { id: "l2", skill_node_id: "node-1", version: 2, title: "v2 title", content_markdown: "c2", code_example: null, discussion_questions: [], created_at: "2026-01-02T00:00:00Z" },
      { id: "l1", skill_node_id: "node-1", version: 1, title: "v1 title", content_markdown: "c1", code_example: null, discussion_questions: [], created_at: "2026-01-01T00:00:00Z" },
      { id: "l3", skill_node_id: "node-1", version: 3, title: "v3 title", content_markdown: "c3", code_example: null, discussion_questions: [], created_at: "2026-01-03T00:00:00Z" },
    ];
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") return makeOrderedChain(nodes);
      if (table === "lessons") return makeOrderedChain(lessons);
      throw new Error(`unexpected table ${table}`);
    });

    const res = await GET();
    const json = await res.json();
    const node = json.nodes[0];

    expect(node.current_version).toBe(3);
    expect(node.latest_lesson).toMatchObject({ version: 3, title: "v3 title" });

    expect(node.all_versions).toHaveLength(3);
    expect(node.all_versions.map((v: { version: number }) => v.version).sort()).toEqual([1, 2, 3]);
    for (const v of node.all_versions) {
      expect(Object.keys(v).sort()).toEqual(["created_at", "title", "version"]);
    }
  });

  it("for a node with ZERO lesson rows, synthesizes fallback lesson content referencing the node's name", async () => {
    const nodes: Row[] = [
      { id: "node-2", name: "Vector Databases", category: "cat", difficulty: "medium", order_index: 0, description: "" },
    ];
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") return makeOrderedChain(nodes);
      if (table === "lessons") return makeOrderedChain([]);
      throw new Error(`unexpected table ${table}`);
    });

    const res = await GET();
    const json = await res.json();
    const node = json.nodes[0];

    expect(node.current_version).toBe(1);
    expect(node.all_versions).toEqual([]);

    const lesson = node.latest_lesson;
    expect(typeof lesson.content_markdown).toBe("string");
    expect(lesson.content_markdown.length).toBeGreaterThan(0);
    expect(lesson.content_markdown).toContain("Vector Databases");

    expect(typeof lesson.code_example).toBe("string");
    expect(lesson.code_example.length).toBeGreaterThan(0);

    expect(Array.isArray(lesson.discussion_questions)).toBe(true);
    expect(lesson.discussion_questions.length).toBeGreaterThan(0);
    for (const q of lesson.discussion_questions) {
      expect(typeof q).toBe("string");
      expect(q).toContain("Vector Databases");
    }
  });

  it("returns 500 on a skill_nodes fetch error and does NOT proceed to fetch lessons", async () => {
    const lessonsQueried = vi.fn();
    mockFrom.mockImplementation((table: string) => {
      if (table === "skill_nodes") return makeOrderedChain([], { message: "connection refused" });
      if (table === "lessons") {
        lessonsQueried();
        return makeOrderedChain([]);
      }
      throw new Error(`unexpected table ${table}`);
    });

    const res = await GET();
    expect(res.status).toBe(500);
    expect(lessonsQueried).not.toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("skill_nodes");
  });
});
