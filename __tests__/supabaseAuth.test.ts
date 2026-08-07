import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
      signOut: mockSignOut,
    },
  }),
}));

import { signUpWithEmail, signInWithEmail, signInWithGoogle, signOut } from "@/lib/supabase/auth";

describe("lib/supabase/auth.ts — client-side auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // These functions read window.location.origin to build absolute
    // redirect URLs — vitest's node environment has no real window, so
    // stub just enough of it for `new URL(path, origin)` to resolve.
    vi.stubGlobal("window", { location: { origin: "https://kalpla.app" } });
    mockSignUp.mockResolvedValue({ data: {}, error: null });
    mockSignInWithPassword.mockResolvedValue({ data: {}, error: null });
    mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
    mockSignOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("signUpWithEmail", () => {
    it("passes email/password through and puts the name in raw_user_meta_data as full_name so the DB trigger can read it", async () => {
      await signUpWithEmail({ email: "jane@example.com", password: "hunter2", name: "Jane Doe" });

      expect(mockSignUp).toHaveBeenCalledWith({
        email: "jane@example.com",
        password: "hunter2",
        options: expect.objectContaining({
          data: { full_name: "Jane Doe" },
        }),
      });
    });

    it("sends undefined full_name (not an empty string) when no name is given", async () => {
      await signUpWithEmail({ email: "jane@example.com", password: "hunter2" });

      const call = mockSignUp.mock.calls[0][0] as { options: { data: { full_name?: string } } };
      expect(call.options.data.full_name).toBeUndefined();
    });

    it("sets emailRedirectTo to the auth callback route", async () => {
      await signUpWithEmail({ email: "jane@example.com", password: "hunter2" });

      const call = mockSignUp.mock.calls[0][0] as { options: { emailRedirectTo: string } };
      expect(call.options.emailRedirectTo).toContain("/auth/callback");
    });

    it("returns the real response from Supabase verbatim, including an error", async () => {
      const errorResponse = { data: null, error: { message: "Email already registered" } };
      mockSignUp.mockResolvedValue(errorResponse);

      const result = await signUpWithEmail({ email: "jane@example.com", password: "hunter2" });
      expect(result).toEqual(errorResponse);
    });
  });

  describe("signInWithEmail", () => {
    it("passes email/password straight through to signInWithPassword", async () => {
      await signInWithEmail({ email: "jane@example.com", password: "hunter2" });
      expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: "jane@example.com", password: "hunter2" });
    });
  });

  describe("signInWithGoogle", () => {
    it("uses the google provider with the auth callback as the redirect target", async () => {
      await signInWithGoogle();

      expect(mockSignInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          options: expect.objectContaining({
            redirectTo: expect.stringContaining("/auth/callback"),
          }),
        }),
      );
    });

    it("threads a redirectTo target through as a ?next= query param on the callback URL, for post-login redirect", async () => {
      await signInWithGoogle({ redirectTo: "/roadmap" });

      const call = mockSignInWithOAuth.mock.calls[0][0] as { options: { redirectTo: string } };
      const url = new URL(call.options.redirectTo);
      expect(url.searchParams.get("next")).toBe("/roadmap");
    });

    it("requests offline access + consent prompt so a refresh token is actually issued", async () => {
      await signInWithGoogle();

      const call = mockSignInWithOAuth.mock.calls[0][0] as { options: { queryParams: Record<string, string> } };
      expect(call.options.queryParams).toEqual({ access_type: "offline", prompt: "consent" });
    });
  });

  describe("signOut", () => {
    it("calls the real signOut and returns its result", async () => {
      const result = await signOut();
      expect(mockSignOut).toHaveBeenCalled();
      expect(result).toEqual({ error: null });
    });
  });
});
