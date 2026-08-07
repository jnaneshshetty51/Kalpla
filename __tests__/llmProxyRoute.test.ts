import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetServerUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  rateLimitedResponse: () => ({ error: "Too many requests — please wait before trying again.", code: "RATE_LIMITED" }),
}));

const mockResolveModelConfig = vi.fn();
vi.mock("@/lib/llm/models", () => ({
  resolveModelConfig: (...args: unknown[]) => mockResolveModelConfig(...args),
}));

const mockExecuteLLMCallWithCap = vi.fn();
vi.mock("@/lib/llm/executeLLMCallWithCap", async (importOriginal) => {
  // Keep the REAL UsageCapExceededError class so `instanceof` checks in the
  // route still work against errors thrown from the mocked call.
  const actual = await importOriginal<typeof import("@/lib/llm/executeLLMCallWithCap")>();
  return { ...actual, executeLLMCallWithCap: (...args: unknown[]) => mockExecuteLLMCallWithCap(...args) };
});

import { POST } from "@/app/api/llm/route";
import { UsageCapExceededError } from "@/lib/llm/executeLLMCallWithCap";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/llm", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  feature: "tutor_chat",
  model: "cheap" as const,
  messages: [{ role: "user", content: "hello" }],
};

describe("app/api/llm/route.ts — auth, rate limit, validation, and cap enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModelConfig.mockReturnValue({ provider: "anthropic", modelId: "claude-fake" });
  });

  it("returns 401 when there is no authenticated user", async () => {
    mockGetServerUser.mockResolvedValue({ user: null });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(mockExecuteLLMCallWithCap).not.toHaveBeenCalled();
  });

  it("returns 429 when the caller is rate-limited, before ever reaching the LLM call", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockCheckRateLimit.mockReturnValue(true);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.code).toBe("RATE_LIMITED");
    expect(mockExecuteLLMCallWithCap).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockCheckRateLimit.mockReturnValue(false);

    const req = new Request("http://localhost/api/llm", { method: "POST", body: "{not json" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when 'feature' is missing", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockCheckRateLimit.mockReturnValue(false);

    const res = await POST(makeRequest({ ...VALID_BODY, feature: undefined }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when 'model' is not 'cheap' or 'expensive'", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockCheckRateLimit.mockReturnValue(false);

    const res = await POST(makeRequest({ ...VALID_BODY, model: "ultra" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when 'messages' is missing or empty", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockCheckRateLimit.mockReturnValue(false);

    const res = await POST(makeRequest({ ...VALID_BODY, messages: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a message has an invalid role or non-string content", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockCheckRateLimit.mockReturnValue(false);

    const res = await POST(makeRequest({ ...VALID_BODY, messages: [{ role: "narrator", content: "hi" }] }));
    expect(res.status).toBe(400);
  });

  it("resolves the model config and delegates to executeLLMCallWithCap on a valid request", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockCheckRateLimit.mockReturnValue(false);
    mockExecuteLLMCallWithCap.mockResolvedValue({ content: "hi there", usage: { inputTokens: 1, outputTokens: 1 } });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ content: "hi there", usage: { inputTokens: 1, outputTokens: 1 } });

    expect(mockResolveModelConfig).toHaveBeenCalledWith("cheap", undefined);
    expect(mockExecuteLLMCallWithCap).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "usr-1", feature: "tutor_chat", provider: "anthropic", modelId: "claude-fake" }),
    );
  });

  it("translates a UsageCapExceededError into a 429 with the error's details, not a generic 500", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockCheckRateLimit.mockReturnValue(false);
    const details = { feature: "tutor_chat", currentUsage: 30, limit: 30, tier: "free" };
    mockExecuteLLMCallWithCap.mockRejectedValue(new UsageCapExceededError(details as never));

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json).toEqual(details);
  });

  it("returns 500 with the error message when executeLLMCallWithCap throws an unexpected error", async () => {
    mockGetServerUser.mockResolvedValue({ user: { id: "usr-1" } });
    mockCheckRateLimit.mockReturnValue(false);
    mockExecuteLLMCallWithCap.mockRejectedValue(new Error("provider exploded"));

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("provider exploded");
  });
});
