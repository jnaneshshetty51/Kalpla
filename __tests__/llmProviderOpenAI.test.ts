import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { InternalLLMOptions, LLMStreamEvent } from "@/types/llm";
import { callOpenAI, streamOpenAI } from "@/lib/llm/providers/openai";

// lib/llm/providers/openai.ts talks to the OpenAI REST API directly via
// global `fetch` (no `openai` SDK import) — so we mock fetch itself, matching
// the pattern already used in sendDailyCoachEmail.test.ts / sandboxExecution.test.ts.
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
    modelId: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a helpful tutor." },
      { role: "user", content: "Explain recursion." },
    ],
    feature: "tutor_chat",
    ...overrides,
  };
}

describe("lib/llm/providers/openai.ts", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    process.env.OPENAI_API_KEY = "test-openai-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  describe("callOpenAI", () => {
    it("sends messages verbatim (system included) with the bearer auth header and maps the response", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Recursion is..." } }],
          usage: { prompt_tokens: 40, completion_tokens: 18, total_tokens: 58 },
        }),
      });

      const result = await callOpenAI(baseOptions({ maxTokens: 300, temperature: 0.5 }));

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      expect(init.headers).toMatchObject({
        "Content-Type": "application/json",
        Authorization: "Bearer test-openai-key",
      });

      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("gpt-4o-mini");
      expect(body.max_tokens).toBe(300);
      expect(body.temperature).toBe(0.5);
      expect(body.messages).toEqual([
        { role: "system", content: "You are a helpful tutor." },
        { role: "user", content: "Explain recursion." },
      ]);

      expect(result).toEqual({
        content: "Recursion is...",
        model: "gpt-4o-mini",
        provider: "openai",
        feature: "tutor_chat",
        usage: { promptTokens: 40, completionTokens: 18, totalTokens: 58 },
      });
    });

    it("defaults max_tokens to 1024 and derives total_tokens from prompt+completion when missing from the response", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "hi" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      const result = await callOpenAI(baseOptions());

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.max_tokens).toBe(1024);
      expect(body).not.toHaveProperty("temperature");
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    });

    it("defaults content and usage to empty/zero when the response has no choices or usage", async () => {
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ choices: [], usage: {} }) });

      const result = await callOpenAI(baseOptions());

      expect(result.content).toBe("");
      expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    });

    it("throws with the status and body text when the OpenAI API responds with a non-OK status", async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 401, text: async () => "invalid api key" });

      await expect(callOpenAI(baseOptions())).rejects.toThrow(
        /OpenAI API request failed \(401\): invalid api key/,
      );
    });

    it("falls back to a deterministic mock response when OPENAI_API_KEY is not set, without calling fetch", async () => {
      delete process.env.OPENAI_API_KEY;

      const result = await callOpenAI(baseOptions());

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.provider).toBe("openai");
      expect(result.content).toContain("Mock OpenAI");
      expect(result.usage).toEqual({ promptTokens: 15, completionTokens: 25, totalTokens: 40 });
    });
  });

  describe("streamOpenAI", () => {
    it("parses SSE delta chunks into events, ignores [DONE], and yields a final done event with estimated token usage", async () => {
      const sse =
        `data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n` +
        `data: {"choices":[{"delta":{"content":" world"}}]}\n\n` +
        `data: [DONE]\n\n`;
      fetchSpy.mockResolvedValue({ ok: true, body: makeSSEBody(sse) });

      const options = baseOptions();
      const events: LLMStreamEvent[] = [];
      for await (const ev of streamOpenAI(options)) events.push(ev);

      expect(events[0]).toEqual({ type: "delta", text: "Hello" });
      expect(events[1]).toEqual({ type: "delta", text: " world" });

      const promptChars = options.messages.reduce((s, m) => s + m.content.length, 0);
      const expectedPromptTokens = Math.ceil(promptChars / 4);
      const expectedCompletionTokens = Math.ceil("Hello world".length / 4);

      expect(events[2]).toEqual({
        type: "done",
        fullText: "Hello world",
        model: "gpt-4o-mini",
        provider: "openai",
        usage: {
          promptTokens: expectedPromptTokens,
          completionTokens: expectedCompletionTokens,
          totalTokens: expectedPromptTokens + expectedCompletionTokens,
        },
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.stream).toBe(true);
    });

    it("throws when the streaming response is not OK", async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 503, body: {}, text: async () => "unavailable" });

      const gen = streamOpenAI(baseOptions());
      await expect(gen.next()).rejects.toThrow(/OpenAI streaming API request failed \(503\): unavailable/);
    });

    it("falls back to a simulated word-by-word mock stream ending in a done event when OPENAI_API_KEY is not set", async () => {
      delete process.env.OPENAI_API_KEY;

      const events: LLMStreamEvent[] = [];
      for await (const ev of streamOpenAI(baseOptions())) events.push(ev);

      expect(fetchSpy).not.toHaveBeenCalled();
      const last = events[events.length - 1];
      expect(last.type).toBe("done");
      if (last.type === "done") {
        expect(last.fullText).toContain("Mock OpenAI");
        expect(last.usage).toEqual({ promptTokens: 15, completionTokens: 25, totalTokens: 40 });
      }
    }, 10000);
  });
});
