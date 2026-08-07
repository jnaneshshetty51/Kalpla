/**
 * In-memory token bucket rate limiter.
 *
 * Each (userId, endpoint) key gets its own bucket.
 * The bucket allows `maxRequests` calls per `windowMs`.
 * On cold start the map resets — this is intentional for serverless;
 * it provides abuse prevention without needing Redis.
 *
 * Usage:
 *   const limited = checkRateLimit(userId, 'llm', 20, 60_000);
 *   if (limited) return NextResponse.json({ error: '...' }, { status: 429 });
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Returns true if the request should be rejected (rate limit exceeded).
 * Returns false if the request is allowed.
 */
export function checkRateLimit(
  userId: string,
  endpoint: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const key = `${userId}:${endpoint}`;
  const now = Date.now();

  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    // Start fresh window
    buckets.set(key, { count: 1, windowStart: now });
    return false; // allowed
  }

  if (bucket.count >= maxRequests) {
    return true; // rate limited
  }

  bucket.count += 1;
  return false; // allowed
}

/** Convenience: returns a 429 JSON body string for rate limit responses. */
export function rateLimitedResponse() {
  return {
    error: "Too many requests — please wait before trying again.",
    code: "RATE_LIMITED",
  };
}
