import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callLLM } from "@/lib/llm/client";
import type { LLMProxyRequest } from "@/types/llm";

// lib/llm/client.ts is a client-side fetch("/api/llm", ...) wrapper —
// mock global fetch the same way sendDailyCoachEmail.test.ts /
// sandboxExecution.test.ts do (vi.stubGlobal + vi.unstubAllGlobals in afterEach).
describe("lib/llm/client.ts — callLLM", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const request: LLMProxyRequest = {
    feature: "tutor_chat",
    model: "cheap",
    messages: [{ role: "user", content: "hi" }],
  };

  it("POSTs to /api/llm with the request body and JSON headers, and returns the parsed response on success", async () => {
    const responseBody = {
      content: "hello there",
      model: "claude-haiku-4-5",
      provider: "anthropic",
      feature: "tutor_chat",
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
    };
    fetchSpy.mockResolvedValue({ ok: true, json: async () => responseBody });

    const result = await callLLM(request);

    expect(fetchSpy).toHaveBeenCalledWith("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    expect(result).toEqual(responseBody);
  });

  it("throws the server-provided error message when the response is not OK", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "Rate limit exceeded" }),
    });

    await expect(callLLM(request)).rejects.toThrow("Rate limit exceeded");
  });

  it("falls back to a generic status-code message when the error response body isn't valid JSON", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(callLLM(request)).rejects.toThrow("LLM proxy call failed with status 500");
  });

  it("passes maxTokens, temperature, and provider through unchanged in the request body", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ content: "ok", model: "m", provider: "openai", feature: "f", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }),
    });

    const fullRequest: LLMProxyRequest = {
      feature: "tutor_chat",
      model: "expensive",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 500,
      temperature: 0.7,
      provider: "openai",
    };

    await callLLM(fullRequest);

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual(fullRequest);
  });
});
