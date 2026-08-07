import { describe, it, expect, vi, beforeEach } from "vitest";

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["update", "eq", "select"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const mockGetServerUser = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
  createClient: () => Promise.resolve({ from: mockFrom }),
}));

import { POST } from "@/app/api/onboarding/complete/route";

function req(body: unknown) {
  return new Request("http://localhost/api/onboarding/complete", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  name: "Jane Doe",
  goal: "Become a GenAI engineer",
  experience_level: "beginner",
  time_budget_minutes_per_day: 45,
  timeline_days: 90,
};

const UPDATED_ROW = { id: "usr-1", ...VALID_BODY, onboarding_complete: true };

describe("POST /api/onboarding/complete — writes onboarding answers via the RLS-scoped session client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockFrom.mockImplementation(() => makeChainable({ data: UPDATED_ROW, error: null }));
  });

  it("returns 401 when unauthenticated, without touching the DB", async () => {
    mockGetServerUser.mockResolvedValue({ user: null });
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await POST(new Request("http://localhost/api/onboarding/complete", { method: "POST", body: "{not json" }));
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing or blank", async () => {
    const res = await POST(req({ ...VALID_BODY, name: "   " }));
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 when goal is missing", async () => {
    const rest: Partial<typeof VALID_BODY> = { ...VALID_BODY };
    delete rest.goal;
    const res = await POST(req(rest));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid experience_level", async () => {
    const res = await POST(req({ ...VALID_BODY, experience_level: "expert" }));
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 when time_budget_minutes_per_day is non-positive", async () => {
    const res = await POST(req({ ...VALID_BODY, time_budget_minutes_per_day: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when time_budget_minutes_per_day is missing/non-numeric", async () => {
    const rest: Partial<typeof VALID_BODY> = { ...VALID_BODY };
    delete rest.time_budget_minutes_per_day;
    const res = await POST(req(rest));
    expect(res.status).toBe(400);
  });

  it("returns 400 when timeline_days is non-positive", async () => {
    const res = await POST(req({ ...VALID_BODY, timeline_days: -5 }));
    expect(res.status).toBe(400);
  });

  it("accepts numeric fields passed as numeric strings", async () => {
    const res = await POST(
      req({ ...VALID_BODY, time_budget_minutes_per_day: "45", timeline_days: "90" }),
    );
    expect(res.status).toBe(200);
  });

  it("trims whitespace from name and goal before writing", async () => {
    let updatePayload: Record<string, unknown> | null = null;
    mockFrom.mockImplementation(() => {
      const chain = makeChainable({ data: UPDATED_ROW, error: null });
      chain.update = vi.fn((payload: Record<string, unknown>) => {
        updatePayload = payload;
        return chain;
      });
      return chain;
    });

    await POST(req({ ...VALID_BODY, name: "  Jane Doe  ", goal: "  Become a GenAI engineer  " }));
    expect((updatePayload as unknown as { name: string; goal: string }).name).toBe("Jane Doe");
    expect((updatePayload as unknown as { name: string; goal: string }).goal).toBe("Become a GenAI engineer");
  });

  it("on success, writes all five fields to the users table scoped to the caller's own id and returns { data }", async () => {
    let updatePayload: Record<string, unknown> | null = null;
    let eqArgs: unknown[] = [];
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe("users");
      const chain = makeChainable({ data: UPDATED_ROW, error: null });
      chain.update = vi.fn((payload: Record<string, unknown>) => {
        updatePayload = payload;
        return chain;
      });
      chain.eq = vi.fn((...args: unknown[]) => {
        eqArgs = args;
        return chain;
      });
      return chain;
    });

    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual(UPDATED_ROW);

    expect(updatePayload).toEqual({
      name: "Jane Doe",
      goal: "Become a GenAI engineer",
      experience_level: "beginner",
      time_budget_minutes_per_day: 45,
      timeline_days: 90,
    });
    expect(eqArgs).toEqual(["id", "usr-1"]);
  });

  it("propagates a DB update error as 500 with the real error message, rather than a fake success", async () => {
    mockFrom.mockImplementation(() => makeChainable({ data: null, error: { message: "column violates check constraint" } }));

    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("column violates check constraint");
  });
});
