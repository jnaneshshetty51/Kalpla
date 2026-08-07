import { describe, it, expect, vi, beforeEach } from "vitest";

const mockVerifyAdminAuth = vi.fn();
vi.mock("@/lib/admin/verifyAdminAuth", () => ({
  verifyAdminAuth: () => mockVerifyAdminAuth(),
}));

const mockRecomputeAndSaveNodeScore = vi.fn();
vi.mock("@/lib/skillGraph/updateScore", () => ({
  recomputeAndSaveNodeScore: (userId: string, skillNodeId: string) =>
    mockRecomputeAndSaveNodeScore(userId, skillNodeId),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "order", "update"]) {
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

import { GET, POST } from "@/app/api/admin/grading-review/route";

describe("app/api/admin/grading-review/route.ts — approve/override resolution (Prompt 63 review queue)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminAuth.mockResolvedValue({
      authorized: true,
      user: { id: "admin-1" },
      profile: { role: "admin" },
    });
  });

  describe("GET", () => {
    it("returns the admin's 403 response unmodified when the caller isn't an admin", async () => {
      const forbidden = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
      mockVerifyAdminAuth.mockResolvedValue({ authorized: false, response: forbidden });

      const res = await GET();
      expect(res.status).toBe(403);
    });

    it("shapes joined attempt/task data and filters out entries with no matching attempt", async () => {
      mockFrom.mockReturnValue(
        makeChainable({
          data: [
            {
              id: "q1",
              attempt_id: "att-1",
              reason: "low_confidence",
              status: "pending",
              created_at: "2026-08-01T00:00:00Z",
              assessment_attempts: {
                id: "att-1",
                user_id: "usr-1",
                task_id: "task-1",
                response: { answer: "x" },
                ai_score: 65,
                ai_feedback: { summary: "ok" },
                confidence: 0.5,
                assessment_tasks: { id: "task-1", prompt: "Explain X", skill_node_id: "node-1", type: "short_answer" },
              },
            },
            {
              id: "q2",
              attempt_id: "att-missing",
              reason: "low_confidence",
              status: "pending",
              created_at: "2026-08-01T00:00:00Z",
              assessment_attempts: null, // orphaned/deleted attempt — must be filtered out
            },
          ],
          error: null,
        }),
      );

      const res = await GET();
      const json = await res.json();
      expect(json.queue).toHaveLength(1);
      expect(json.queue[0]).toMatchObject({
        id: "q1",
        user_id: "usr-1",
        ai_score: 65,
        tasks: { skill_node_id: "node-1" },
      });
    });

    it("propagates a DB error as 500", async () => {
      mockFrom.mockReturnValue(makeChainable({ data: null, error: { message: "db down" } }));
      const res = await GET();
      expect(res.status).toBe(500);
    });
  });

  describe("POST", () => {
    function req(body: unknown) {
      return new Request("http://localhost/api/admin/grading-review", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    it("rejects a request missing entryId or action with 400", async () => {
      const res = await POST(req({ action: "approve" }));
      expect(res.status).toBe(400);
    });

    it("rejects an invalid action value with 400", async () => {
      const res = await POST(req({ entryId: "q1", action: "delete" }));
      expect(res.status).toBe(400);
    });

    it("returns 404 when the queue entry (or its attempt) doesn't exist", async () => {
      mockFrom.mockReturnValue(makeChainable({ data: null, error: null }));
      const res = await POST(req({ entryId: "missing", action: "approve" }));
      expect(res.status).toBe(404);
    });

    it("approve: does NOT touch ai_score or trigger a recompute, just resolves the queue entry", async () => {
      const updateCalls: Array<{ table: string; payload: unknown }> = [];
      mockFrom.mockImplementation((table: string) => {
        if (table === "grading_review_queue") {
          const chain = makeChainable({
            data: {
              id: "q1",
              attempt_id: "att-1",
              assessment_attempts: { id: "att-1", user_id: "usr-1", task_id: "task-1", assessment_tasks: { skill_node_id: "node-1" } },
            },
            error: null,
          });
          chain.update = vi.fn((payload: unknown) => {
            updateCalls.push({ table, payload });
            return chain;
          });
          return chain;
        }
        return makeChainable({ data: null, error: null });
      });

      const res = await POST(req({ entryId: "q1", action: "approve" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe("approve");
      expect(json.finalScore).toBeNull();

      expect(mockRecomputeAndSaveNodeScore).not.toHaveBeenCalled();
      expect(updateCalls[0].payload).toMatchObject({
        status: "resolved",
        reviewer_id: "admin-1",
        reviewer_notes: "AI score approved by admin",
      });
    });

    it("override: writes the corrected score onto the real attempt AND cascades through recomputeAndSaveNodeScore, not just the queue row", async () => {
      const attemptUpdates: Array<Record<string, unknown>> = [];
      mockRecomputeAndSaveNodeScore.mockResolvedValue({ score: 91.5 });

      mockFrom.mockImplementation((table: string) => {
        if (table === "grading_review_queue") {
          return makeChainable({
            data: {
              id: "q1",
              attempt_id: "att-1",
              assessment_attempts: { id: "att-1", user_id: "usr-1", task_id: "task-1", assessment_tasks: { skill_node_id: "node-1" } },
            },
            error: null,
          });
        }
        if (table === "assessment_attempts") {
          const chain = makeChainable({ data: null, error: null });
          chain.update = vi.fn((payload: Record<string, unknown>) => {
            attemptUpdates.push(payload);
            return chain;
          });
          return chain;
        }
        return makeChainable({ data: null, error: null });
      });

      const res = await POST(req({ entryId: "q1", action: "override", overrideScore: 95 }));
      expect(res.status).toBe(200);
      const json = await res.json();

      // The recomputed score (91.5) is what's returned, not the raw override
      // input (95) — proving the recompute step is load-bearing.
      expect(json.finalScore).toBe(91.5);
      expect(attemptUpdates[0]).toEqual({ ai_score: 95 });
      expect(mockRecomputeAndSaveNodeScore).toHaveBeenCalledWith("usr-1", "node-1");
    });

    it("override with no skill_node_id on the task falls back to the raw override score without a recompute call", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "grading_review_queue") {
          return makeChainable({
            data: {
              id: "q1",
              attempt_id: "att-1",
              assessment_attempts: { id: "att-1", user_id: "usr-1", task_id: "task-1", assessment_tasks: null },
            },
            error: null,
          });
        }
        return makeChainable({ data: null, error: null });
      });

      const res = await POST(req({ entryId: "q1", action: "override", overrideScore: 77 }));
      const json = await res.json();
      expect(json.finalScore).toBe(77);
      expect(mockRecomputeAndSaveNodeScore).not.toHaveBeenCalled();
    });
  });
});
