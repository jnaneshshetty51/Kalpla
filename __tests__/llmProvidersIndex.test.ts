import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallAnthropic = vi.fn();
const mockStreamAnthropic = vi.fn();
vi.mock("@/lib/llm/providers/anthropic", () => ({
  callAnthropic: (...args: unknown[]) => mockCallAnthropic(...args),
  streamAnthropic: (...args: unknown[]) => mockStreamAnthropic(...args),
}));

const mockCallOpenAI = vi.fn();
const mockStreamOpenAI = vi.fn();
vi.mock("@/lib/llm/providers/openai", () => ({
  callOpenAI: (...args: unknown[]) => mockCallOpenAI(...args),
  streamOpenAI: (...args: unknown[]) => mockStreamOpenAI(...args),
}));

import { executeLLMCall, executeLLMCallStream } from "@/lib/llm/providers";
import type { ExecuteLLMCallOptions } from "@/lib/llm/providers";
import type { LLMStreamEvent } from "@/types/llm";

function baseOptions(provider: ExecuteLLMCallOptions["provider"]): ExecuteLLMCallOptions {
  return {
    provider,
    modelId: "some-model",
    messages: [{ role: "user", content: "hi" }],
    feature: "test_feature",
  };
}

async function* fakeGenerator(tag: string): AsyncGenerator<LLMStreamEvent> {
  yield { type: "delta", text: tag };
}

describe("lib/llm/providers/index.ts — provider routing (dispatcher only; anthropic.ts/openai.ts internals mocked out)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeLLMCall", () => {
    it("routes to callOpenAI when provider is 'openai'", async () => {
      mockCallOpenAI.mockResolvedValue({ content: "openai-response" });
      const options = baseOptions("openai");

      const result = await executeLLMCall(options);

      expect(mockCallOpenAI).toHaveBeenCalledWith(options);
      expect(mockCallAnthropic).not.toHaveBeenCalled();
      expect(result).toEqual({ content: "openai-response" });
    });

    it("routes to callAnthropic when provider is 'anthropic'", async () => {
      mockCallAnthropic.mockResolvedValue({ content: "anthropic-response" });
      const options = baseOptions("anthropic");

      const result = await executeLLMCall(options);

      expect(mockCallAnthropic).toHaveBeenCalledWith(options);
      expect(mockCallOpenAI).not.toHaveBeenCalled();
      expect(result).toEqual({ content: "anthropic-response" });
    });

    it("defaults to callAnthropic for any provider value other than 'openai'", async () => {
      mockCallAnthropic.mockResolvedValue({ content: "anthropic-response" });
      // Cast to simulate a caller passing an unexpected runtime value — the
      // route code's `if (provider === "openai")` check means anything else,
      // including a bogus string, falls through to the Anthropic default.
      const options = {
        ...baseOptions("anthropic"),
        provider: "unknown",
      } as unknown as ExecuteLLMCallOptions;

      await executeLLMCall(options);

      expect(mockCallAnthropic).toHaveBeenCalledWith(options);
      expect(mockCallOpenAI).not.toHaveBeenCalled();
    });
  });

  describe("executeLLMCallStream", () => {
    it("delegates to streamOpenAI when provider is 'openai' and forwards its yielded events", async () => {
      mockStreamOpenAI.mockImplementation(() => fakeGenerator("openai-chunk"));
      const options = baseOptions("openai");

      const events: LLMStreamEvent[] = [];
      for await (const ev of executeLLMCallStream(options)) events.push(ev);

      expect(mockStreamOpenAI).toHaveBeenCalledWith(options);
      expect(mockStreamAnthropic).not.toHaveBeenCalled();
      expect(events).toEqual([{ type: "delta", text: "openai-chunk" }]);
    });

    it("delegates to streamAnthropic when provider is 'anthropic' (and for any non-openai value)", async () => {
      mockStreamAnthropic.mockImplementation(() => fakeGenerator("anthropic-chunk"));
      const options = baseOptions("anthropic");

      const events: LLMStreamEvent[] = [];
      for await (const ev of executeLLMCallStream(options)) events.push(ev);

      expect(mockStreamAnthropic).toHaveBeenCalledWith(options);
      expect(mockStreamOpenAI).not.toHaveBeenCalled();
      expect(events).toEqual([{ type: "delta", text: "anthropic-chunk" }]);
    });
  });
});
