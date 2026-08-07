import { describe, it, expect } from "vitest";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

describe("In-memory rate limiter (lib/rateLimit.ts)", () => {
  it("should allow requests under the limit", () => {
    const userId = "user-test-1";
    const endpoint = "test_endpoint_1";

    expect(checkRateLimit(userId, endpoint, 3, 60_000)).toBe(false);
    expect(checkRateLimit(userId, endpoint, 3, 60_000)).toBe(false);
    expect(checkRateLimit(userId, endpoint, 3, 60_000)).toBe(false);
  });

  it("should block requests exceeding the limit", () => {
    const userId = "user-test-2";
    const endpoint = "test_endpoint_2";

    expect(checkRateLimit(userId, endpoint, 2, 60_000)).toBe(false);
    expect(checkRateLimit(userId, endpoint, 2, 60_000)).toBe(false);
    // 3rd call exceeds 2 req limit
    expect(checkRateLimit(userId, endpoint, 2, 60_000)).toBe(true);
  });

  it("should return expected rateLimitedResponse payload", () => {
    const response = rateLimitedResponse();
    expect(response).toEqual({
      error: "Too many requests — please wait before trying again.",
      code: "RATE_LIMITED",
    });
  });
});
