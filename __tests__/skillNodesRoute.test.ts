import { describe, it, expect, vi, beforeEach } from "vitest";

const mockVerifyAdminAuth = vi.fn();
vi.mock("@/lib/admin/verifyAdminAuth", () => ({
  verifyAdminAuth: () => mockVerifyAdminAuth(),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "contains", "insert", "update", "delete"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => mockFrom(table) }),
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/admin/skill-nodes/route";

const TEMP_ID = "00000000-0000-0000-0000-000000000000";

const forbidden = () =>
  new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
const unauthorized = () =>
  new Response(JSON.stringify({ error: "Unauthorized: No active session" }), { status: 401 });

function postReq(body: unknown, raw = false) {
  return new Request("http://localhost/api/admin/skill-nodes", {
    method: "POST",
    body: raw ? (body as string) : JSON.stringify(body),
  });
}
function patchReq(body: unknown) {
  return new Request("http://localhost/api/admin/skill-nodes", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
function deleteReq(id?: string) {
  const url = id
    ? `http://localhost/api/admin/skill-nodes?id=${encodeURIComponent(id)}`
    : "http://localhost/api/admin/skill-nodes";
  return new Request(url, { method: "DELETE" });
}

describe("app/api/admin/skill-nodes/route.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminAuth.mockResolvedValue({
      authorized: true,
      user: { id: "admin-1" },
      profile: { role: "admin" },
    });
    // Re-established every test even after vi.clearAllMocks(), since that
    // does NOT undo a prior test's .mockImplementation()/.mockImplementationOnce()
    // override on this same mock function.
    mockFrom.mockImplementation(() => makeChainable({ data: [], error: null }));
  });

  describe("auth gating", () => {
    it("GET: 401 when unauthenticated", async () => {
      mockVerifyAdminAuth.mockResolvedValue({ authorized: false, response: unauthorized() });
      const res = await GET();
      expect(res.status).toBe(401);
    });
    it("GET: 403 when authenticated but not admin", async () => {
      mockVerifyAdminAuth.mockResolvedValue({ authorized: false, response: forbidden() });
      const res = await GET();
      expect(res.status).toBe(403);
    });
    it("POST: 401 when unauthenticated", async () => {
      mockVerifyAdminAuth.mockResolvedValue({ authorized: false, response: unauthorized() });
      const res = await POST(postReq({}));
      expect(res.status).toBe(401);
    });
    it("POST: 403 when authenticated but not admin", async () => {
      mockVerifyAdminAuth.mockResolvedValue({ authorized: false, response: forbidden() });
      const res = await POST(postReq({}));
      expect(res.status).toBe(403);
    });
    it("PATCH: 401 when unauthenticated", async () => {
      mockVerifyAdminAuth.mockResolvedValue({ authorized: false, response: unauthorized() });
      const res = await PATCH(patchReq({}));
      expect(res.status).toBe(401);
    });
    it("PATCH: 403 when authenticated but not admin", async () => {
      mockVerifyAdminAuth.mockResolvedValue({ authorized: false, response: forbidden() });
      const res = await PATCH(patchReq({}));
      expect(res.status).toBe(403);
    });
    it("DELETE: 401 when unauthenticated", async () => {
      mockVerifyAdminAuth.mockResolvedValue({ authorized: false, response: unauthorized() });
      const res = await DELETE(deleteReq("node-1"));
      expect(res.status).toBe(401);
    });
    it("DELETE: 403 when authenticated but not admin", async () => {
      mockVerifyAdminAuth.mockResolvedValue({ authorized: false, response: forbidden() });
      const res = await DELETE(deleteReq("node-1"));
      expect(res.status).toBe(403);
    });
  });

  describe("GET", () => {
    it("returns nodes ordered by order_index", async () => {
      mockFrom.mockImplementation(() =>
        makeChainable({
          data: [{ id: "a", order_index: 1, prerequisite_ids: [] }],
          error: null,
        }),
      );
      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
    });

    it("propagates a DB error as 500", async () => {
      mockFrom.mockImplementation(() => makeChainable({ data: null, error: { message: "db down" } }));
      const res = await GET();
      expect(res.status).toBe(500);
    });
  });

  describe("POST", () => {
    it("rejects invalid JSON with 400", async () => {
      const res = await POST(postReq("not json", true));
      expect(res.status).toBe(400);
    });

    it("rejects a request missing required fields with 400", async () => {
      const res = await POST(postReq({ name: "X" }));
      expect(res.status).toBe(400);
    });

    it("rejects an out-of-range difficulty with 400", async () => {
      const res = await POST(
        postReq({ name: "X", category: "c", difficulty: 9, order_index: 1 }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects a new node whose prerequisites would introduce a cycle", async () => {
      // Existing node x1 depends on the not-yet-created node (tempId). If the
      // new node also depends on x1, that closes a cycle: tempId -> x1 -> tempId.
      mockFrom.mockImplementationOnce(() =>
        makeChainable({
          data: [
            {
              id: "x1",
              name: "X1",
              category: "c",
              description: null,
              difficulty: 1,
              order_index: 1,
              prerequisite_ids: [TEMP_ID],
            },
          ],
          error: null,
        }),
      );

      const res = await POST(
        postReq({
          name: "NewNode",
          category: "c2",
          difficulty: 2,
          order_index: 2,
          prerequisite_ids: ["x1"],
        }),
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Cycle validation failed/);
    });

    it("creates a node with no cycle, inserting the correct payload", async () => {
      let insertPayload: unknown = null;
      mockFrom
        .mockImplementationOnce(() => makeChainable({ data: [], error: null })) // fetch existing
        .mockImplementationOnce(() => {
          const chain = makeChainable({
            data: { id: "new-1", name: "NewNode", category: "c2", difficulty: 2, order_index: 2, prerequisite_ids: [] },
            error: null,
          });
          const realInsert = chain.insert as (p: unknown) => unknown;
          chain.insert = vi.fn((payload: unknown) => {
            insertPayload = payload;
            return realInsert(payload);
          });
          return chain;
        });

      const res = await POST(
        postReq({ name: "NewNode", category: "c2", difficulty: 2, order_index: 2 }),
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.id).toBe("new-1");
      expect(insertPayload).toMatchObject({
        name: "NewNode",
        category: "c2",
        difficulty: 2,
        order_index: 2,
        prerequisite_ids: [],
      });
    });

    it("propagates a DB error while fetching existing nodes as 500", async () => {
      mockFrom.mockImplementationOnce(() =>
        makeChainable({ data: null, error: { message: "fetch failed" } }),
      );
      const res = await POST(
        postReq({ name: "X", category: "c", difficulty: 1, order_index: 1 }),
      );
      expect(res.status).toBe(500);
    });

    it("propagates a DB error on insert as 500", async () => {
      mockFrom
        .mockImplementationOnce(() => makeChainable({ data: [], error: null }))
        .mockImplementationOnce(() => makeChainable({ data: null, error: { message: "insert failed" } }));

      const res = await POST(
        postReq({ name: "X", category: "c", difficulty: 1, order_index: 1 }),
      );
      expect(res.status).toBe(500);
    });
  });

  describe("PATCH", () => {
    it("rejects a request missing id with 400", async () => {
      const res = await PATCH(patchReq({ name: "X" }));
      expect(res.status).toBe(400);
    });

    it("returns 404 when the target node doesn't exist", async () => {
      mockFrom.mockImplementationOnce(() => makeChainable({ data: [], error: null }));
      const res = await PATCH(patchReq({ id: "missing" }));
      expect(res.status).toBe(404);
    });

    it("rejects an out-of-range difficulty with 400", async () => {
      mockFrom.mockImplementationOnce(() =>
        makeChainable({
          data: [{ id: "a", name: "A", category: "c", difficulty: 1, order_index: 1, prerequisite_ids: [] }],
          error: null,
        }),
      );
      const res = await PATCH(patchReq({ id: "a", difficulty: 10 }));
      expect(res.status).toBe(400);
    });

    it("rejects an update whose new prerequisites would introduce a cycle", async () => {
      // a -> (none), b -> [a], c -> [b]. Patching a to depend on c closes a cycle.
      mockFrom.mockImplementationOnce(() =>
        makeChainable({
          data: [
            { id: "a", name: "A", category: "c", difficulty: 1, order_index: 1, prerequisite_ids: [] },
            { id: "b", name: "B", category: "c", difficulty: 1, order_index: 2, prerequisite_ids: ["a"] },
            { id: "c", name: "C", category: "c", difficulty: 1, order_index: 3, prerequisite_ids: ["b"] },
          ],
          error: null,
        }),
      );

      const res = await PATCH(patchReq({ id: "a", prerequisite_ids: ["c"] }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Cycle validation failed/);
    });

    it("updates a node with no cycle, committing the correct payload", async () => {
      let updatePayload: unknown = null;
      mockFrom
        .mockImplementationOnce(() =>
          makeChainable({
            data: [{ id: "a", name: "A", category: "c", difficulty: 1, order_index: 1, prerequisite_ids: [] }],
            error: null,
          }),
        )
        .mockImplementationOnce(() => {
          const chain = makeChainable({
            data: { id: "a", name: "A2", category: "c", difficulty: 3, order_index: 1, prerequisite_ids: [] },
            error: null,
          });
          const realUpdate = chain.update as (p: unknown) => unknown;
          chain.update = vi.fn((payload: unknown) => {
            updatePayload = payload;
            return realUpdate(payload);
          });
          return chain;
        });

      const res = await PATCH(patchReq({ id: "a", name: "A2", difficulty: 3 }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.name).toBe("A2");
      expect(updatePayload).toMatchObject({ name: "A2", difficulty: 3 });
    });

    it("propagates a DB error while fetching existing nodes as 500", async () => {
      mockFrom.mockImplementationOnce(() =>
        makeChainable({ data: null, error: { message: "fetch failed" } }),
      );
      const res = await PATCH(patchReq({ id: "a" }));
      expect(res.status).toBe(500);
    });

    it("propagates a DB error on update as 500", async () => {
      mockFrom
        .mockImplementationOnce(() =>
          makeChainable({
            data: [{ id: "a", name: "A", category: "c", difficulty: 1, order_index: 1, prerequisite_ids: [] }],
            error: null,
          }),
        )
        .mockImplementationOnce(() => makeChainable({ data: null, error: { message: "update failed" } }));

      const res = await PATCH(patchReq({ id: "a", name: "A2" }));
      expect(res.status).toBe(500);
    });
  });

  describe("DELETE", () => {
    it("rejects a request missing the id query param with 400", async () => {
      const res = await DELETE(deleteReq());
      expect(res.status).toBe(400);
    });

    it("refuses to delete a node other nodes depend on as a prerequisite", async () => {
      mockFrom.mockImplementationOnce(() =>
        makeChainable({ data: [{ id: "dependent-1", name: "Dependent Node" }], error: null }),
      );
      const res = await DELETE(deleteReq("node-1"));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Dependent Node/);
    });

    it("deletes a node with no dependents", async () => {
      mockFrom
        .mockImplementationOnce(() => makeChainable({ data: [], error: null }))
        .mockImplementationOnce(() => makeChainable({ data: null, error: null }));

      const res = await DELETE(deleteReq("node-1"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.message).toMatch(/node-1/);
    });

    it("propagates a DB error on delete as 500", async () => {
      mockFrom
        .mockImplementationOnce(() => makeChainable({ data: [], error: null }))
        .mockImplementationOnce(() => makeChainable({ data: null, error: { message: "delete failed" } }));

      const res = await DELETE(deleteReq("node-1"));
      expect(res.status).toBe(500);
    });
  });
});
