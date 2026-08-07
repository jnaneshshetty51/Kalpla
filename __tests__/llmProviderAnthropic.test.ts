import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { InternalLLMOptions, LLMStreamEvent } from "@/types/llm";
import { callAnthropic, streamAnthropic } from "@/lib/llm/providers/anthropic";

// lib/llm/providers/anthropic.ts talks to the Anthropic REST API directly via
// global `fetch` (no @anthropic-ai/sdk import) — so we mock fetch itself,
// matching the pattern already used in sendDailyCoachEmail.test.ts /
// sandboxExecution.test.ts (vi.stubGlobal("fetch", ...) + vi.unstubAllGlobals()).
function makeSSEBody(raw: string) {
  const encoder = new TextEncoder();
  let sent = false;
  return {
    getReader() {
      return {
        read: async () => {
          if (!sent) {
            sent = true;
            return { done: false, value: encoder.encode(raw) };
          }
          return { done: true, value: undefined };
        },
      };
    },
  };
}

function baseOptions(overrides: Partial<InternalLLMOptions> = {}): InternalLLMOptions {
  return {
    modelId: "claude-sonnet-5",
    messages: [
      { role: "system", content: "You are a helpful tutor." },
      { role: "user", content: "Explain recursion." },
    ],
    feature: "tutor_chat",
    ...overrides,
  };
}

describe("lib/llm/providers/anthropic.ts", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe("callAnthropic", () => {
    it("sends the correctly-shaped request (system extracted, temperature/max_tokens mapped, correct headers) and parses the response", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "Recursion is a function calling itself." }],
          usage: { input_tokens: 30, output_tokens: 12 },
          stop_reason: "end_turn",
        }),
      });

      const result = await callAnthropic(baseOptions({ maxTokens: 500, temperature: 0.3 }));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({
        "Content-Type": "application/json",
        "x-api-key": "test-anthropic-key",
        "anthropic-version": "2023-06-01",
      });

      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("claude-sonnet-5");
      expect(body.max_tokens).toBe(500);
      expect(body.temperature).toBe(0.3);
      expect(body.system).toBe("You are a helpful tutor.");
      expect(body.messages).toEqual([{ role: "user", content: "Explain recursion." }]);

      expect(result).toEqual({
        content: "Recursion is a function calling itself.",
        model: "claude-sonnet-5",
        provider: "anthropic",
        feature: "tutor_chat",
        usage: { promptTokens: 30, completionTokens: 12, totalTokens: 42 },
        toolCalls: undefined,
        stopReason: "end_turn",
      });
    });

    it("defaults max_tokens to 1024 when not supplied and omits temperature when not a number", async () => {
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ content: [], usage: {} }) });

      await callAnthropic(baseOptions());

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.max_tokens).toBe(1024);
      expect(body).not.toHaveProperty("temperature");
    });

    it("pushes a placeholder user message when only system messages are given", async () => {
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ content: [], usage: {} }) });

      await callAnthropic(baseOptions({ messages: [{ role: "system", content: "System only." }] }));

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("maps tool_use content blocks into toolCalls and forwards tool definitions in the request", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            { type: "text", text: "Let me check that." },
            { type: "tool_use", id: "tool_1", name: "lookup_skill", input: { skillId: "abc" } },
          ],
          usage: { input_tokens: 20, output_tokens: 8 },
          stop_reason: "tool_use",
        }),
      });

      const tools = [{ name: "lookup_skill", description: "Looks up a skill", input_schema: {} }];
      const result = await callAnthropic(baseOptions({ tools }));

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.tools).toEqual(tools);

      expect(result.toolCalls).toEqual([{ id: "tool_1", name: "lookup_skill", input: { skillId: "abc" } }]);
      expect(result.content).toBe("Let me check that.");
      expect(result.stopReason).toBe("tool_use");
    });

    it("throws with the status and body text when the Anthropic API responds with a non-OK status", async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 429, text: async () => "rate limit exceeded" });

      await expect(callAnthropic(baseOptions())).rejects.toThrow(
        /Anthropic API request failed \(429\): rate limit exceeded/,
      );
    });

    it("falls back to a deterministic mock response when ANTHROPIC_API_KEY is not set, without calling fetch", async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const result = await callAnthropic(baseOptions());

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.provider).toBe("anthropic");
      expect(result.content).toContain("Mock Anthropic");
      expect(result.usage).toEqual({ promptTokens: 15, completionTokens: 25, totalTokens: 40 });
    });

    it("falls back to a mock tool-call when ANTHROPIC_API_KEY is not set and tools were requested", async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const tools = [{ name: "lookup_skill", description: "d", input_schema: {} }];

      const result = await callAnthropic(baseOptions({ tools }));

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.toolCalls).toEqual([expect.objectContaining({ name: "lookup_skill", input: {} })]);
      expect(result.stopReason).toBe("tool_use");
    });
  });

  describe("streamAnthropic", () => {
    it("parses SSE frames into delta events followed by a final done event with accumulated text and usage", async () => {
      const sse =
        `data: {"type":"message_start","message":{"usage":{"input_tokens":50}}}\n\n` +
        `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n` +
        `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}\n\n` +
        `data: {"type":"message_delta","usage":{"output_tokens":12}}\n\n`;

      fetchSpy.mockResolvedValue({ ok: true, body: makeSSEBody(sse) });

      const events: LLMStreamEvent[] = [];
      for await (const ev of streamAnthropic(baseOptions())) {
        events.push(ev);
      }

      expect(events).toEqual([
        { type: "delta", text: "Hello" },
        { type: "delta", text: " world" },
        {
          type: "done",
          fullText: "Hello world",
          model: "claude-sonnet-5",
          provider: "anthropic",
          usage: { promptTokens: 50, completionTokens: 12, totalTokens: 62 },
        },
      ]);

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      const body = JSON.parse(init.body as string);
      expect(body.stream).toBe(true);
      expect(body.messages).toEqual([{ role: "user", content: "Explain recursion." }]);
    });

    it("throws when the streaming response is not OK", async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 500, body: {}, text: async () => "server error" });

      const gen = streamAnthropic(baseOptions());
      await expect(gen.next()).rejects.toThrow(/Anthropic streaming API request failed \(500\): server error/);
    });

    it("throws when the response has no body even if ok is true", async () => {
      fetchSpy.mockResolvedValue({ ok: true, body: null, text: async () => "" });

      const gen = streamAnthropic(baseOptions());
      await expect(gen.next()).rejects.toThrow(/Anthropic streaming API request failed/);
    });

    it("falls back to a simulated word-by-word mock stream ending in a done event when ANTHROPIC_API_KEY is not set", async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const events: LLMStreamEvent[] = [];
      for await (const ev of streamAnthropic(baseOptions())) {
        events.push(ev);
      }

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(events.length).toBeGreaterThan(1);
      expect(events.slice(0, -1).every((e) => e.type === "delta")).toBe(true);

      const last = events[events.length - 1];
      expect(last.type).toBe("done");
      if (last.type === "done") {
        expect(last.fullText).toContain("Mock Anthropic");
        expect(last.usage).toEqual({ promptTokens: 15, completionTokens: 25, totalTokens: 40 });
        const deltaConcat = events
          .slice(0, -1)
          .map((e) => (e.type === "delta" ? e.text : ""))
          .join("");
        expect(deltaConcat).toBe(last.fullText);
      }
    }, 10000);
  });
});
