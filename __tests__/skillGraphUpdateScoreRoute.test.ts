import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockRecompute = vi.fn();
vi.mock("@/lib/skillGraph/updateScore", () => ({
  recomputeAndSaveNodeScore: (userId: string, skillNodeId: string) => mockRecompute(userId, skillNodeId),
}));

import { POST } from "@/app/api/skill-graph/update-score/route";

function req(body: unknown) {
  return new Request("http://localhost/api/skill-graph/update-score", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/skill-graph/update-score — user_id always from session, never from the request body", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
  });

  it("401s when unauthenticated", async () => {
    mockGetServerUser.mockResolvedValue({ user: null });
    const res = await POST(req({ skillNodeId: "node-1" }));
    expect(res.status).toBe(401);
    expect(mockRecompute).not.toHaveBeenCalled();
  });

  it("400s when skillNodeId is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("always recomputes for the AUTHENTICATED user's id, ignoring any user_id in the request body (ownership can't be spoofed)", async () => {
    mockRecompute.mockResolvedValue({ skillNodeId: "node-1", score: 91, attemptsUsed: 2, status: "completed", unlockedNodes: [] });

    // Attempt to recompute someone else's score by smuggling a user_id in the body.
    await POST(req({ skillNodeId: "node-1", user_id: "victim-user" }));

    expect(mockRecompute).toHaveBeenCalledWith("usr-1", "node-1");
  });

  it("returns the real recompute result wrapped in { data }", async () => {
    const result = { skillNodeId: "node-1", score: 91, attemptsUsed: 2, status: "completed", unlockedNodes: [{ id: "node-2", name: "B", category: "X" }] };
    mockRecompute.mockResolvedValue(result);

    const res = await POST(req({ skillNodeId: "node-1" }));
    const json = await res.json();
    expect(json.data).toEqual(result);
  });

  it("a thrown error from the recompute is translated to a 500 with the real error message", async () => {
    mockRecompute.mockRejectedValue(new Error("connection reset"));
    const res = await POST(req({ skillNodeId: "node-1" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("connection reset");
  });

  it("400s on malformed JSON body", async () => {
    const res = await POST(new Request("http://localhost/api/skill-graph/update-score", { method: "POST", body: "{not json" }));
    expect(res.status).toBe(400);
  });
});
