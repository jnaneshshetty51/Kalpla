import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockMarkLessonComplete = vi.fn();
vi.mock("@/lib/lessons/markComplete", () => ({
  markLessonComplete: (params: unknown) => mockMarkLessonComplete(params),
}));

import { POST } from "@/app/api/learn/mark-complete/route";

function req(body: unknown) {
  return new Request("http://localhost/api/learn/mark-complete", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/learn/mark-complete — thin auth/validation wrapper around markLessonComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockMarkLessonComplete.mockResolvedValue({ success: true, score: 85.0, source: "manual_button" });
  });

  it("returns 401 when unauthenticated, without calling markLessonComplete", async () => {
    mockGetServerUser.mockResolvedValue({ user: null });
    const res = await POST(req({ skill_node_id: "node-1" }));
    expect(res.status).toBe(401);
    expect(mockMarkLessonComplete).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await POST(new Request("http://localhost/api/learn/mark-complete", { method: "POST", body: "{not json" }));
    expect(res.status).toBe(400);
    expect(mockMarkLessonComplete).not.toHaveBeenCalled();
  });

  it("returns 400 when skill_node_id is missing", async () => {
    const res = await POST(req({ score: 90 }));
    expect(res.status).toBe(400);
    expect(mockMarkLessonComplete).not.toHaveBeenCalled();
  });

  it("returns 400 when skill_node_id is not a string", async () => {
    const res = await POST(req({ skill_node_id: 123 }));
    expect(res.status).toBe(400);
  });

  it("always uses the authenticated session's userId, never a spoofed one from the body", async () => {
    await POST(req({ skill_node_id: "node-1", user_id: "victim-user" }));
    expect(mockMarkLessonComplete).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "usr-1" }),
    );
  });

  it("defaults score to 85.0 and source to 'manual_button' when omitted", async () => {
    await POST(req({ skill_node_id: "node-1" }));
    expect(mockMarkLessonComplete).toHaveBeenCalledWith({
      userId: "usr-1",
      skillNodeId: "node-1",
      score: 85.0,
      source: "manual_button",
    });
  });

  it("defaults score to 85.0 when a non-numeric score is provided", async () => {
    await POST(req({ skill_node_id: "node-1", score: "not-a-number" }));
    expect(mockMarkLessonComplete).toHaveBeenCalledWith(
      expect.objectContaining({ score: 85.0 }),
    );
  });

  it("passes through an explicit score and source unchanged", async () => {
    await POST(req({ skill_node_id: "node-1", score: 92.5, source: "check_understanding" }));
    expect(mockMarkLessonComplete).toHaveBeenCalledWith({
      userId: "usr-1",
      skillNodeId: "node-1",
      score: 92.5,
      source: "check_understanding",
    });
  });

  it("returns 200 with { success: true, result } wrapping markLessonComplete's real return value", async () => {
    const realResult = {
      success: true,
      score: 91.5,
      source: "check_understanding",
      updatedNodes: [{ skill_node_id: "node-1", status: "completed" }],
      newlyUnlockedNodes: [],
    };
    mockMarkLessonComplete.mockResolvedValue(realResult);

    const res = await POST(req({ skill_node_id: "node-1", source: "check_understanding" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, result: realResult });
  });

  it("returns 500 when markLessonComplete throws, rather than a fake success", async () => {
    mockMarkLessonComplete.mockRejectedValue(new Error("roadmap row not found"));
    const res = await POST(req({ skill_node_id: "node-1" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal Server Error");
  });
});
