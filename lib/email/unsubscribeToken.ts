import { createHmac, timingSafeEqual } from "crypto";

/**
 * One-click unsubscribe links (Prompt 79) need to work without a login
 * session (RFC 8058 style), but a bare user_id in a public URL would let
 * anyone unsubscribe anyone else. Sign it with an HMAC instead, keyed off
 * the service-role secret (already a securely-held server secret — no new
 * env var needed just for this).
 */
function getSigningSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to sign unsubscribe tokens");
  }
  return secret;
}

export function generateUnsubscribeToken(userId: string): string {
  return createHmac("sha256", getSigningSecret()).update(userId).digest("hex");
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = generateUnsubscribeToken(userId);
  const expectedBuf = Buffer.from(expected, "hex");
  const tokenBuf = Buffer.from(token, "hex");
  if (expectedBuf.length !== tokenBuf.length) return false;
  return timingSafeEqual(expectedBuf, tokenBuf);
}
