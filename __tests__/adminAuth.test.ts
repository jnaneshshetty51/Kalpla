import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

import { verifyAdminAuth } from "@/lib/admin/verifyAdminAuth";

describe("lib/admin/verifyAdminAuth.ts — shared admin RBAC guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated callers with 401, not 403", async () => {
    mockGetServerUser.mockResolvedValue({ user: null, profile: null });

    const result = await verifyAdminAuth();

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(401);
    }
  });

  it("rejects a logged-in non-admin user with 403", async () => {
    mockGetServerUser.mockResolvedValue({
      user: { id: "usr-1" },
      profile: { role: "user" },
    });

    const result = await verifyAdminAuth();

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(403);
    }
  });

  it("rejects a logged-in user with no profile row at all", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-orphan" }, profile: null });

    const result = await verifyAdminAuth();

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(403);
    }
  });

  it("authorizes a logged-in admin and returns the real user/profile", async () => {
    const user = { id: "usr-admin" };
    const profile = { role: "admin", name: "Admin User" };
    mockGetServerUser.mockResolvedValue({ user, profile });

    const result = await verifyAdminAuth();

    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.user).toBe(user);
      expect(result.profile).toBe(profile);
    }
  });
});
