import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "eq", "order", "in", "returns"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { GET, PATCH } from "@/app/api/portfolio/route";

const EXISTING_PORTFOLIO = {
  id: "portfolio-1",
  user_id: "usr-1",
  slug: "jane-doe",
  is_public: false,
  bio: null,
  custom_content: {},
  published_projects: [],
};

function defaultFromImpl(table: string) {
  if (table === "portfolios") return makeChainable({ data: EXISTING_PORTFOLIO, error: null });
  if (table === "submissions") return makeChainable({ data: [], error: null });
  if (table === "projects") return makeChainable({ data: [], error: null });
  return makeChainable({ data: null, error: null });
}

describe("app/api/portfolio/route.ts — private portfolio management API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(defaultFromImpl);
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" }, profile: { name: "Jane Doe" } });
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetServerUser.mockResolvedValue({ user: null, profile: null });
      const res = await GET();
      expect(res.status).toBe(401);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns the existing portfolio without creating a new one", async () => {
      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.portfolio).toEqual(EXISTING_PORTFOLIO);
      // Only the initial select — no insert call, since a portfolio already exists.
      const portfoliosCalls = mockFrom.mock.calls.filter((c) => c[0] === "portfolios");
      expect(portfoliosCalls).toHaveLength(1);
    });

    it("auto-creates a portfolio (slugified from profile name) when the caller has none yet", async () => {
      let portfoliosCallCount = 0;
      const created = { ...EXISTING_PORTFOLIO, id: "portfolio-new" };
      let insertedPayload: Record<string, unknown> | null = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === "portfolios") {
          portfoliosCallCount++;
          if (portfoliosCallCount === 1) {
            // Initial lookup: no portfolio exists yet.
            return makeChainable({ data: null, error: null });
          }
          const chain = makeChainable({ data: created, error: null });
          chain.insert = vi.fn((payload: Record<string, unknown>) => {
            insertedPayload = payload;
            return chain;
          });
          return chain;
        }
        if (table === "submissions") return makeChainable({ data: [], error: null });
        if (table === "projects") return makeChainable({ data: [], error: null });
        return makeChainable({ data: null, error: null });
      });

      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.portfolio).toEqual(created);
      expect(insertedPayload).toMatchObject({ user_id: "usr-1", slug: "jane-doe", is_public: false });
    });

    it("propagates a portfolio-creation DB error as 500 rather than a fake success", async () => {
      let portfoliosCallCount = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === "portfolios") {
          portfoliosCallCount++;
          if (portfoliosCallCount === 1) return makeChainable({ data: null, error: null });
          return makeChainable({ data: null, error: { message: "insert failed: unique violation" } });
        }
        return makeChainable({ data: [], error: null });
      });

      const res = await GET();
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("insert failed: unique violation");
    });

    it("builds draft_projects from the latest PASSING submission per project, applying case-study overrides over the cached summary", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "portfolios") {
          return makeChainable({
            data: {
              ...EXISTING_PORTFOLIO,
              custom_content: { case_study_overrides: { "sub-old": "manually edited case study" } },
              published_projects: ["sub-old"],
            },
            error: null,
          });
        }
        if (table === "submissions") {
          return makeChainable({
            data: [
              {
                id: "sub-new",
                project_id: "proj-1",
                code: "print('new')",
                reflection: "learned a lot",
                status: "passed",
                metadata: { case_study: { summary: "auto-generated summary" } },
                created_at: "2026-08-05T00:00:00Z",
              },
              {
                // Same project, but older -> must be excluded (only latest per project kept).
                id: "sub-old",
                project_id: "proj-1",
                code: "print('old')",
                reflection: "first try",
                status: "passed",
                metadata: null,
                created_at: "2026-08-01T00:00:00Z",
              },
              {
                id: "sub-other",
                project_id: "proj-2",
                code: "print('other')",
                reflection: null,
                status: "passed",
                metadata: null,
                created_at: "2026-08-02T00:00:00Z",
              },
            ],
            error: null,
          });
        }
        if (table === "projects") {
          return makeChainable({
            data: [
              { id: "proj-1", name: "RAG Pipeline" },
              { id: "proj-2", name: "Tokenizer" },
            ],
            error: null,
          });
        }
        return makeChainable({ data: null, error: null });
      });

      const res = await GET();
      const json = await res.json();
      expect(json.draft_projects).toHaveLength(2); // most-recent-per-project only

      const proj1 = json.draft_projects.find((p: { project_id: string }) => p.project_id === "proj-1");
      expect(proj1.submission_id).toBe("sub-new"); // the newer of the two proj-1 submissions
      expect(proj1.project_name).toBe("RAG Pipeline");
      // The override is keyed by sub-old's id in this fixture, so sub-new (the
      // selected latest) falls through to its own cached metadata summary.
      expect(proj1.case_study).toBe("auto-generated summary");
      expect(proj1.is_published).toBe(false); // published_projects only contains "sub-old"

      const proj2 = json.draft_projects.find((p: { project_id: string }) => p.project_id === "proj-2");
      expect(proj2.case_study).toBeNull(); // no cached summary, no override
      expect(proj2.project_name).toBe("Tokenizer");
    });

    it("falls back to 'Untitled Project' when no matching project row is found", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "portfolios") return makeChainable({ data: EXISTING_PORTFOLIO, error: null });
        if (table === "submissions") {
          return makeChainable({
            data: [
              {
                id: "sub-1",
                project_id: "proj-orphaned",
                code: "x",
                reflection: null,
                status: "passed",
                metadata: null,
                created_at: "2026-08-01T00:00:00Z",
              },
            ],
            error: null,
          });
        }
        if (table === "projects") return makeChainable({ data: [], error: null });
        return makeChainable({ data: null, error: null });
      });

      const res = await GET();
      const json = await res.json();
      expect(json.draft_projects[0].project_name).toBe("Untitled Project");
    });
  });

  describe("PATCH", () => {
    function req(body: unknown) {
      return new Request("http://localhost/api/portfolio", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    }

    it("returns 401 when unauthenticated", async () => {
      mockGetServerUser.mockResolvedValue({ user: null, profile: null });
      const res = await PATCH(req({ bio: "hi" }));
      expect(res.status).toBe(401);
    });

    it("returns 400 on malformed JSON", async () => {
      const res = await PATCH(new Request("http://localhost/api/portfolio", { method: "PATCH", body: "{not json" }));
      expect(res.status).toBe(400);
    });

    it("returns 404 when the caller has no portfolio yet ('load it first')", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "portfolios") return makeChainable({ data: null, error: null });
        return makeChainable({ data: null, error: null });
      });
      const res = await PATCH(req({ bio: "hi" }));
      expect(res.status).toBe(404);
    });

    it("merges case_study_overrides into existing overrides rather than replacing them wholesale", async () => {
      let portfoliosCallCount = 0;
      let updatePayload: Record<string, unknown> | null = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === "portfolios") {
          portfoliosCallCount++;
          if (portfoliosCallCount === 1) {
            return makeChainable({
              data: {
                custom_content: { case_study_overrides: { "sub-1": "old text" } },
                published_projects: [],
              },
              error: null,
            });
          }
          const chain = makeChainable({ data: { id: "portfolio-1" }, error: null });
          chain.update = vi.fn((payload: Record<string, unknown>) => {
            updatePayload = payload;
            return chain;
          });
          return chain;
        }
        return makeChainable({ data: null, error: null });
      });

      const res = await PATCH(req({ case_study_overrides: { "sub-2": "new text" } }));
      expect(res.status).toBe(200);
      expect((updatePayload as unknown as { custom_content: { case_study_overrides: Record<string, string> } }).custom_content.case_study_overrides).toEqual({
        "sub-1": "old text",
        "sub-2": "new text",
      });
    });

    it("updates bio and published_projects when provided", async () => {
      let portfoliosCallCount = 0;
      let updatePayload: Record<string, unknown> | null = null;

      mockFrom.mockImplementation((table: string) => {
        if (table === "portfolios") {
          portfoliosCallCount++;
          if (portfoliosCallCount === 1) {
            return makeChainable({ data: { custom_content: {}, published_projects: [] }, error: null });
          }
          const chain = makeChainable({ data: { id: "portfolio-1" }, error: null });
          chain.update = vi.fn((payload: Record<string, unknown>) => {
            updatePayload = payload;
            return chain;
          });
          return chain;
        }
        return makeChainable({ data: null, error: null });
      });

      const res = await PATCH(req({ bio: "New bio text", published_projects: ["sub-1", "sub-2"] }));
      expect(res.status).toBe(200);
      expect(updatePayload).toMatchObject({ bio: "New bio text", published_projects: ["sub-1", "sub-2"] });
    });

    it("propagates a DB update error as 500", async () => {
      let portfoliosCallCount = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === "portfolios") {
          portfoliosCallCount++;
          if (portfoliosCallCount === 1) {
            return makeChainable({ data: { custom_content: {}, published_projects: [] }, error: null });
          }
          return makeChainable({ data: null, error: { message: "row locked" } });
        }
        return makeChainable({ data: null, error: null });
      });

      const res = await PATCH(req({ bio: "hi" }));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("row locked");
    });
  });
});
