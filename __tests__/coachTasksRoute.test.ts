import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockGenerateDailyTasks = vi.fn();
vi.mock("@/lib/coach/generateDailyTasks", () => ({
  generateDailyTasks: (userId: string) => mockGenerateDailyTasks(userId),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "insert", "update"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.single = vi.fn(() => Promise.resolve(result));
  return chain;
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { GET, PATCH } from "@/app/api/dashboard/coach-tasks/route";

const SAMPLE_TASKS = [
  { title: "Task 1", description: "d1", estimated_minutes: 10, type: "roadmap" },
  { title: "Task 2", description: "d2", estimated_minutes: 15, type: "review" },
];

describe("app/api/dashboard/coach-tasks/route.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: null });
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetServerUser.mockResolvedValue({ user: null, profile: null });
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("returns the existing row untouched, with generated_fresh:false, when today's log already exists", async () => {
      const existing = { id: "log-1", date: "2026-08-06", tasks: SAMPLE_TASKS, completed: false };
      mockFrom.mockReturnValue(makeChainable({ data: existing, error: null }));

      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ log: existing, generated_fresh: false });
      expect(mockGenerateDailyTasks).not.toHaveBeenCalled();
    });

    it("generates and inserts a fresh task list when no row exists yet for today, and returns generated_fresh:true", async () => {
      let insertPayload: unknown = null;
      mockFrom.mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
        chain.insert = vi.fn((payload: unknown) => {
          insertPayload = payload;
          return chain;
        });
        chain.single = vi.fn(() =>
          Promise.resolve({ data: { id: "log-new", date: "2026-08-06", tasks: SAMPLE_TASKS, completed: false }, error: null }),
        );
        return chain;
      });
      mockGenerateDailyTasks.mockResolvedValue({ tasks: SAMPLE_TASKS, user_state: "active" });

      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.generated_fresh).toBe(true);
      expect(json.log.tasks).toEqual(SAMPLE_TASKS);
      expect(insertPayload).toMatchObject({ user_id: "usr-1", tasks: SAMPLE_TASKS, completed: false });
    });

    it("returns 500 when the insert fails after generation", async () => {
      mockFrom.mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
        chain.insert = vi.fn(() => chain);
        chain.single = vi.fn(() => Promise.resolve({ data: null, error: { message: "insert failed" } }));
        return chain;
      });
      mockGenerateDailyTasks.mockResolvedValue({ tasks: SAMPLE_TASKS, user_state: "active" });

      const res = await GET();
      expect(res.status).toBe(500);
    });

    it("returns 500 when generateDailyTasks throws", async () => {
      mockFrom.mockReturnValue(makeChainable({ data: null, error: null }));
      mockGenerateDailyTasks.mockRejectedValue(new Error("LLM down"));

      const res = await GET();
      expect(res.status).toBe(500);
    });
  });

  describe("PATCH", () => {
    function req(body: unknown) {
      return new Request("http://localhost/api/dashboard/coach-tasks", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    }

    it("returns 401 when unauthenticated", async () => {
      mockGetServerUser.mockResolvedValue({ user: null, profile: null });
      const res = await PATCH(req({ task_index: 0, done: true }));
      expect(res.status).toBe(401);
    });

    it("returns 400 on unparseable JSON body", async () => {
      const badReq = new Request("http://localhost/api/dashboard/coach-tasks", {
        method: "PATCH",
        body: "not json",
      });
      const res = await PATCH(badReq);
      expect(res.status).toBe(400);
    });

    it("returns 400 when task_index or done is missing/wrong type", async () => {
      const res1 = await PATCH(req({ done: true }));
      expect(res1.status).toBe(400);

      const res2 = await PATCH(req({ task_index: 0 }));
      expect(res2.status).toBe(400);

      const res3 = await PATCH(req({ task_index: "0", done: true }));
      expect(res3.status).toBe(400);
    });

    it("returns 404 when no log exists for today", async () => {
      mockFrom.mockReturnValue(makeChainable({ data: null, error: null }));
      const res = await PATCH(req({ task_index: 0, done: true }));
      expect(res.status).toBe(404);
    });

    it("returns 400 when task_index is out of range", async () => {
      mockFrom.mockImplementation(() =>
        makeChainable({ data: { id: "log-1", tasks: SAMPLE_TASKS }, error: null }),
      );
      const res = await PATCH(req({ task_index: 5, done: true }));
      expect(res.status).toBe(400);
    });

    it("marks a single task done, and sets completed:true only once every task is done", async () => {
      let updatePayload: Record<string, unknown> | null = null;
      mockFrom.mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(() =>
          Promise.resolve({ data: { id: "log-1", tasks: SAMPLE_TASKS.map((t) => ({ ...t, done: false })) }, error: null }),
        );
        chain.update = vi.fn((payload: Record<string, unknown>) => {
          updatePayload = payload;
          return chain;
        });
        chain.single = vi.fn(() =>
          Promise.resolve({ data: { id: "log-1", date: "2026-08-06", tasks: updatePayload!.tasks, completed: updatePayload!.completed }, error: null }),
        );
        return chain;
      });

      // Only task_index 0 marked done -> not all done -> completed:false
      const res = await PATCH(req({ task_index: 0, done: true }));
      expect(res.status).toBe(200);
      expect(updatePayload).toMatchObject({ completed: false });
      expect((updatePayload!.tasks as Array<{ done?: boolean }>)[0].done).toBe(true);
      expect((updatePayload!.tasks as Array<{ done?: boolean }>)[1].done).toBe(false);
    });

    it("sets completed:true once the last remaining task is checked off", async () => {
      let updatePayload: Record<string, unknown> | null = null;
      mockFrom.mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        // Task 0 already done, task 1 still pending.
        chain.maybeSingle = vi.fn(() =>
          Promise.resolve({
            data: { id: "log-1", tasks: [{ ...SAMPLE_TASKS[0], done: true }, { ...SAMPLE_TASKS[1], done: false }] },
            error: null,
          }),
        );
        chain.update = vi.fn((payload: Record<string, unknown>) => {
          updatePayload = payload;
          return chain;
        });
        chain.single = vi.fn(() => Promise.resolve({ data: { id: "log-1" }, error: null }));
        return chain;
      });

      const res = await PATCH(req({ task_index: 1, done: true }));
      expect(res.status).toBe(200);
      expect(updatePayload).toMatchObject({ completed: true });
    });

    it("returns 500 when the update fails", async () => {
      mockFrom.mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(() =>
          Promise.resolve({ data: { id: "log-1", tasks: SAMPLE_TASKS }, error: null }),
        );
        chain.update = vi.fn(() => chain);
        chain.single = vi.fn(() => Promise.resolve({ data: null, error: { message: "update failed" } }));
        return chain;
      });

      const res = await PATCH(req({ task_index: 0, done: true }));
      expect(res.status).toBe(500);
    });
  });
});
