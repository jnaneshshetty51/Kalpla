import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "fs";

// vitest doesn't auto-load .env.local the way Next.js does, and this
// file's last test (below) needs real Supabase credentials — so load it
// manually, exactly like e2e/*.spec.ts's loadEnv() helper, but guarded so
// a CI checkout with no .env.local file (and no real secrets set) doesn't
// crash the whole suite — it just leaves process.env unpopulated, and the
// one test that actually needs it skips itself instead.
if (existsSync(".env.local")) {
  const envVars = Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
  );
  for (const [k, v] of Object.entries(envVars)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

describe("Prompt 76: project unlock logic (pure)", () => {
  it("a project unlocks when every prerequisite skill node is complete", async () => {
    const { computeProjectUnlockState } = await import("@/lib/projects/unlockLogic");
    const scoreByNode = new Map([
      ["node-a", 85],
      ["node-b", 92],
    ]);
    const result = computeProjectUnlockState(["node-a", "node-b"], scoreByNode);
    expect(result.unlocked).toBe(true);
    expect(result.missingSkillNodeIds).toEqual([]);
  });

  it("stays locked if any single prerequisite is below the completion threshold", async () => {
    const { computeProjectUnlockState } = await import("@/lib/projects/unlockLogic");
    const scoreByNode = new Map([
      ["node-a", 85],
      ["node-b", 79.9], // just under the 80 threshold
    ]);
    const result = computeProjectUnlockState(["node-a", "node-b"], scoreByNode);
    expect(result.unlocked).toBe(false);
    expect(result.missingSkillNodeIds).toEqual(["node-b"]);
  });

  it("stays locked if a prerequisite has no score at all yet", async () => {
    const { computeProjectUnlockState } = await import("@/lib/projects/unlockLogic");
    const scoreByNode = new Map([["node-a", 90]]);
    const result = computeProjectUnlockState(["node-a", "node-never-attempted"], scoreByNode);
    expect(result.unlocked).toBe(false);
    expect(result.missingSkillNodeIds).toEqual(["node-never-attempted"]);
  });

  it("a project with no prerequisites is always unlocked", async () => {
    const { computeProjectUnlockState } = await import("@/lib/projects/unlockLogic");
    const result = computeProjectUnlockState([], new Map());
    expect(result.unlocked).toBe(true);
  });
});

// --- Publish flow: unique slug generation / rejection ---
const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "update", "eq", "neq"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.single = vi.fn(() => Promise.resolve(result));
  return chain;
}

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => mockFrom(table) }),
}));

describe("Prompt 76: publish flow slug uniqueness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ user: { id: "user-1" }, profile: null });
  });

  it("publishing with a custom slug that's already taken by another user is rejected with 409", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "portfolios") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({
                  data: { user_id: "user-1", slug: "old-slug", published_projects: ["sub-1"] },
                  error: null,
                }),
              ),
              neq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: { user_id: "some-other-user" }, error: null }),
                ),
              })),
            })),
          })),
        };
      }
      return makeChainable({ data: null, error: null });
    });

    const { POST } = await import("@/app/api/portfolio/publish/route");
    const req = new Request("http://localhost/api/portfolio/publish", {
      method: "POST",
      body: JSON.stringify({ action: "publish", custom_slug: "jane-doe" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/already taken/i);
  });

  it("publishing with a syntactically invalid slug is rejected with 400 before any uniqueness check", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "portfolios") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({
                  data: { user_id: "user-1", slug: "old-slug", published_projects: ["sub-1"] },
                  error: null,
                }),
              ),
            })),
          })),
        };
      }
      return makeChainable({ data: null, error: null });
    });

    const { POST } = await import("@/app/api/portfolio/publish/route");
    const req = new Request("http://localhost/api/portfolio/publish", {
      method: "POST",
      body: JSON.stringify({ action: "publish", custom_slug: "Not Valid! Slug" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("publishing with a free (untaken) custom slug succeeds and sets is_public true", async () => {
    let updatedWith: Record<string, unknown> | null = null;
    mockFrom.mockImplementation((table: string) => {
      if (table === "portfolios") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({
                  data: { user_id: "user-1", slug: "old-slug", published_projects: ["sub-1"] },
                  error: null,
                }),
              ),
              neq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedWith = payload;
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({ data: { slug: payload.slug, is_public: true }, error: null }),
                  ),
                })),
              })),
            };
          }),
        };
      }
      return makeChainable({ data: null, error: null });
    });

    const { POST } = await import("@/app/api/portfolio/publish/route");
    const req = new Request("http://localhost/api/portfolio/publish", {
      method: "POST",
      body: JSON.stringify({ action: "publish", custom_slug: "brand-new-slug" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(updatedWith).toMatchObject({ slug: "brand-new-slug", is_public: true });
  });
});

// --- Public portfolio page: live competency scores, not a stale cache ---
// Deliberately a real-DB integration check, not mocked: "no stale cache"
// can't be meaningfully proven against a mock, which would just return
// whatever it's told regardless of any real caching bug. Requires real
// Supabase credentials (a local .env.local, or real secrets in CI) —
// skipped rather than failing the whole suite when neither is present.
const hasRealSupabaseCredentials = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("Prompt 76: public portfolio reflects live competency scores", () => {
  it.skipIf(!hasRealSupabaseCredentials)("a competency score change between two page loads is reflected on the second load, proving no stale cache", async () => {
    vi.doUnmock("@/lib/supabase/admin");
    vi.resetModules();

    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const email = `portfolio-live-${Date.now()}@example.com`;
    const { data: created } = await admin.auth.admin.createUser({ email, password: crypto.randomUUID(), email_confirm: true });
    const userId = created!.user!.id;
    const slug = `live-test-${Date.now()}`;

    const { data: node } = await admin.from("skill_nodes").select("id").limit(1).single();

    await admin.from("portfolios").insert({ user_id: userId, slug, is_public: true, published_projects: [] });
    await admin.from("competency_scores").upsert({ user_id: userId, skill_node_id: node!.id, score: 40 });

    const { getPublicPortfolioData } = await import("@/lib/portfolio/getPublicPortfolioData");

    const firstLoad = await getPublicPortfolioData(slug);
    const firstScore = firstLoad?.categories.flatMap((c) => c.nodes).find((n) => n.score === 40);
    expect(firstScore).toBeDefined();

    // User improves — score updates in the DB.
    await admin.from("competency_scores").upsert({ user_id: userId, skill_node_id: node!.id, score: 95 });

    const secondLoad = await getPublicPortfolioData(slug);
    const updatedNode = secondLoad?.categories.flatMap((c) => c.nodes).find((n) => n.name === firstLoad?.categories[0]?.nodes[0]?.name);
    expect(updatedNode?.score).toBe(95); // reflects the NEW score, not the cached 40

    await admin.from("portfolios").delete().eq("user_id", userId);
    await admin.from("competency_scores").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  });
});
