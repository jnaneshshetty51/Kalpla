import { describe, it, expect, vi, beforeEach } from "vitest";

// server-only is a build-time guard (throws if imported outside a real
// Next.js server context) — irrelevant to the actual logic under test here.
vi.mock("server-only", () => ({}));

const mockMaybeSingle = vi.fn();
const mockInsert = vi.fn();
const mockFrom = vi.fn((table: string) => {
  if (table === "users") {
    return {
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle })) })),
      insert: mockInsert,
    };
  }
  return {};
});

const mockCreateServerClient = vi.fn(() => ({ from: mockFrom }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateServerClient(),
}));

import { ensureUserProfileExists } from "@/lib/supabase/auth-server";

describe("lib/supabase/auth-server.ts — ensureUserProfileExists (backfill fallback for delayed/missed handle_new_user trigger)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
  });

  it("does nothing (no insert) when a profile row already exists", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "usr-1" }, error: null });

    await ensureUserProfileExists("usr-1", { name: "Jane", email: "jane@example.com" });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("inserts a new profile row with the given name when none exists yet", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await ensureUserProfileExists("usr-1", { name: "Jane Doe", email: "jane@example.com" });

    expect(mockInsert).toHaveBeenCalledWith({ id: "usr-1", name: "Jane Doe", role: "user" });
  });

  it("falls back to the email's local part when no name is given", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await ensureUserProfileExists("usr-1", { email: "someone@example.com" });

    expect(mockInsert).toHaveBeenCalledWith({ id: "usr-1", name: "someone", role: "user" });
  });

  it("inserts with a null name when neither name nor email metadata is given", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await ensureUserProfileExists("usr-1");

    expect(mockInsert).toHaveBeenCalledWith({ id: "usr-1", name: null, role: "user" });
  });

  it("always inserts role 'user', never anything self-escalatable", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await ensureUserProfileExists("usr-1", { name: "Attempted Admin" });

    const insertedPayload = mockInsert.mock.calls[0][0] as { role: string };
    expect(insertedPayload.role).toBe("user");
  });

  it("swallows an unexpected error (e.g. DB unreachable) rather than throwing — this is a best-effort fallback hook", async () => {
    mockMaybeSingle.mockRejectedValue(new Error("connection refused"));

    await expect(ensureUserProfileExists("usr-1", { name: "Jane" })).resolves.toBeUndefined();
  });
});
