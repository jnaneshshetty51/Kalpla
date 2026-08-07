import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/email/unsubscribeToken";

describe("lib/email/unsubscribeToken.ts — HMAC-signed one-click unsubscribe links (no login session, so this IS the auth)", () => {
  const originalSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-signing-secret-do-not-use-in-prod";
  });

  afterEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSecret;
  });

  it("a token generated for a user verifies successfully for that exact user", () => {
    const token = generateUnsubscribeToken("usr-1");
    expect(verifyUnsubscribeToken("usr-1", token)).toBe(true);
  });

  it("generation is deterministic — the same user always produces the same token", () => {
    expect(generateUnsubscribeToken("usr-1")).toBe(generateUnsubscribeToken("usr-1"));
  });

  it("a token for one user does NOT verify for a different user — this is the whole point of signing it", () => {
    const tokenForUserA = generateUnsubscribeToken("usr-a");
    expect(verifyUnsubscribeToken("usr-b", tokenForUserA)).toBe(false);
  });

  it("a tampered token (single character changed) fails verification", () => {
    const token = generateUnsubscribeToken("usr-1");
    const tampered = token.slice(0, -1) + (token.slice(-1) === "0" ? "1" : "0");
    expect(verifyUnsubscribeToken("usr-1", tampered)).toBe(false);
  });

  it("a garbage/malformed token (wrong length, not valid hex-length-matching) fails verification without throwing", () => {
    expect(verifyUnsubscribeToken("usr-1", "not-a-real-token")).toBe(false);
    expect(verifyUnsubscribeToken("usr-1", "")).toBe(false);
  });

  it("a token signed under a different secret (e.g. after key rotation) no longer verifies", () => {
    const token = generateUnsubscribeToken("usr-1");
    process.env.SUPABASE_SERVICE_ROLE_KEY = "a-different-rotated-secret";
    expect(verifyUnsubscribeToken("usr-1", token)).toBe(false);
  });

  it("throws clearly if the signing secret is missing, rather than silently signing with an empty key", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => generateUnsubscribeToken("usr-1")).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
