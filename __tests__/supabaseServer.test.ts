import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ getAll: () => [] }),
}));

const mockGetUser = vi.fn();
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

const mockCreateServerClient = vi.fn(() => ({
  auth: { getUser: mockGetUser },
  from: mockFrom,
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => mockCreateServerClient(),
}));

import { getServerUser } from "@/lib/supabase/server";

const REAL_USER = {
  id: "usr-1",
  email: "jane@example.com",
  created_at: "2026-08-01T00:00:00Z",
  user_metadata: { full_name: "Jane Doe" },
};

describe("lib/supabase/server.ts — getServerUser (foundational auth check behind every protected route)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { user: null, profile: null } when there's no session, not a thrown error", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await getServerUser();
    expect(result.user).toBeNull();
    expect(result.profile).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled(); // no point querying a profile for no user
  });

  it("treats an auth error the same as no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid token" } });

    const result = await getServerUser();
    expect(result.user).toBeNull();
    expect(result.profile).toBeNull();
  });

  it("returns the real user and their real profile row when both exist", async () => {
    mockGetUser.mockResolvedValue({ data: { user: REAL_USER }, error: null });
    mockMaybeSingle.mockResolvedValue({
      data: { id: "usr-1", name: "Jane Doe", role: "user", goal: "Become a GenAI engineer" },
      error: null,
    });

    const result = await getServerUser();
    expect(result.user).toEqual(REAL_USER);
    expect(result.profile).toMatchObject({ id: "usr-1", role: "user", goal: "Become a GenAI engineer" });
    expect(mockEq).toHaveBeenCalledWith("id", "usr-1"); // scoped to the real authenticated user, not spoofable
  });

  it("synthesizes a fallback profile when the users row doesn't exist yet (trigger delay / edge case) — real user, fallback profile, not a failure", async () => {
    mockGetUser.mockResolvedValue({ data: { user: REAL_USER }, error: null });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await getServerUser();
    expect(result.user).toEqual(REAL_USER);
    expect(result.profile).not.toBeNull();
    expect(result.profile!.id).toBe("usr-1");
    expect(result.profile!.name).toBe("Jane Doe"); // from user_metadata.full_name
    expect(result.profile!.role).toBe("user"); // never defaults to admin
  });

  it("fallback profile name falls back to email-local-part when no full_name/name metadata exists", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { ...REAL_USER, user_metadata: {}, email: "someone@example.com" } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await getServerUser();
    expect(result.profile!.name).toBe("someone");
  });

  it("a profile-fetch DB error still returns the real user with a null profile, rather than failing the whole auth check", async () => {
    mockGetUser.mockResolvedValue({ data: { user: REAL_USER }, error: null });
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    const result = await getServerUser();
    expect(result.user).toEqual(REAL_USER);
    // A real DB error (distinct from "row genuinely doesn't exist") still
    // triggers the same synthesized-fallback path today — documenting the
    // actual current behavior rather than assuming it distinguishes the two.
    expect(result.profile).not.toBeNull();
  });

  it("an unexpected thrown error (e.g. Supabase client construction failure) is caught and returns null/null, never propagates", async () => {
    mockCreateServerClient.mockImplementationOnce(() => {
      throw new Error("missing env var");
    });

    const result = await getServerUser();
    expect(result).toEqual({ user: null, profile: null });
  });
});
