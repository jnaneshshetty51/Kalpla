import { InternalLLMOptions, LLMProxyResponse, LLMStreamEvent } from "@/types/llm";

function buildAnthropicPayload(options: InternalLLMOptions, stream: boolean) {
  const systemMessages = options.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const nonSystemMessages = options.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

  if (nonSystemMessages.length === 0) {
    nonSystemMessages.push({ role: "user", content: "Hello" });
  }

  const payload: Record<string, unknown> = {
    model: options.modelId,
    max_tokens: options.maxTokens || 1024,
    messages: nonSystemMessages,
    stream,
  };

  if (systemMessages) {
    payload.system = systemMessages;
  }
  if (typeof options.temperature === "number") {
    payload.temperature = options.temperature;
  }

  return payload;
}

export async function callAnthropic(
  options: InternalLLMOptions,
): Promise<LLMProxyResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    // Extract system message(s) for Anthropic's top-level system parameter
    const systemMessages = options.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const nonSystemMessages = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role:
          m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

    // Ensure at least one user message exists
    if (nonSystemMessages.length === 0) {
      nonSystemMessages.push({ role: "user", content: "Hello" });
    }

    const payload: Record<string, unknown> = {
      model: options.modelId,
      max_tokens: options.maxTokens || 1024,
      messages: nonSystemMessages,
    };

    if (systemMessages) {
      payload.system = systemMessages;
    }

    if (typeof options.temperature === "number") {
      payload.temperature = options.temperature;
    }
    if (options.tools && options.tools.length > 0) {
      payload.tools = options.tools;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(
        `Anthropic API request failed (${response.status}): ${errBody}`,
      );
    }

    const data = await response.json();
    const textContent =
      data.content && data.content.length > 0
        ? data.content
            .filter((c: { type: string; text?: string }) => c.type === "text")
            .map((c: { text?: string }) => c.text || "")
            .join("\n")
        : "";

    const toolCalls =
      data.content && data.content.length > 0
        ? data.content
            .filter((c: { type: string }) => c.type === "tool_use")
            .map((c: { id: string; name: string; input: Record<string, unknown> }) => ({
              id: c.id,
              name: c.name,
              input: c.input,
            }))
        : [];

    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;

    return {
      content: textContent,
      model: options.modelId,
      provider: "anthropic",
      feature: options.feature,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: data.stop_reason,
    };
  }

  // Development Fallback Mock
  if (options.tools && options.tools.length > 0) {
    console.warn(
      `[lib/llm/providers/anthropic] ANTHROPIC_API_KEY not found. Using development mock tool-call for feature "${options.feature}".`,
    );
    const firstTool = options.tools[0];
    return {
      content: "",
      model: options.modelId,
      provider: "anthropic",
      feature: options.feature,
      usage: { promptTokens: 15, completionTokens: 10, totalTokens: 25 },
      toolCalls: [{ id: `mock_tool_${Date.now()}`, name: firstTool.name, input: {} }],
      stopReason: "tool_use",
    };
  }

  console.warn(
    `[lib/llm/providers/anthropic] ANTHROPIC_API_KEY not found. Using development mock for feature "${options.feature}".`,
  );

  const mockText = `[Mock Anthropic ${options.modelId}] Processed feature "${options.feature}" successfully.`;
  return {
    content: mockText,
    model: options.modelId,
    provider: "anthropic",
    feature: options.feature,
    usage: {
      promptTokens: 15,
      completionTokens: 25,
      totalTokens: 40,
    },
  };
}

/**
 * Streaming variant of callAnthropic, for endpoints that need to render
 * tokens progressively (e.g. the tutor chat) rather than wait for the full
 * response. Yields text deltas as they arrive, then a final "done" event
 * carrying the assembled full text and usage for cost logging.
 */
export async function* streamAnthropic(
  options: InternalLLMOptions,
): AsyncGenerator<LLMStreamEvent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn(
      `[lib/llm/providers/anthropic] ANTHROPIC_API_KEY not found. Using development mock stream for feature "${options.feature}".`,
    );

    const mockText = `[Mock Anthropic ${options.modelId}] Processed feature "${options.feature}" successfully. This is a simulated streaming response so the chat UI can be exercised end-to-end without a live API key — each word arrives as its own chunk, the same shape a real token stream would take.`;
    const words = mockText.split(" ");
    let fullText = "";
    for (let i = 0; i < words.length; i++) {
      const chunk = (i === 0 ? "" : " ") + words[i];
      fullText += chunk;
      yield { type: "delta", text: chunk };
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    yield {
      type: "done",
      fullText,
      model: options.modelId,
      provider: "anthropic",
      usage: { promptTokens: 15, completionTokens: 25, totalTokens: 40 },
    };
    return;
  }

  const payload = buildAnthropicPayload(options, true);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    const errBody = await response.text().catch(() => "");
    throw new Error(
      `Anthropic streaming API request failed (${response.status}): ${errBody}`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last (possibly incomplete) line in the buffer for next read.
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice("data: ".length).trim();
      if (!jsonStr) continue;

      let event: {
        type?: string;
        delta?: { type?: string; text?: string };
        message?: { usage?: { input_tokens?: number } };
        usage?: { output_tokens?: number };
      };
      try {
        event = JSON.parse(jsonStr);
      } catch {
        continue;
      }

      if (event.type === "message_start" && event.message?.usage) {
        inputTokens = event.message.usage.input_tokens || 0;
      } else if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta" &&
        event.delta.text
      ) {
        fullText += event.delta.text;
        yield { type: "delta", text: event.delta.text };
      } else if (event.type === "message_delta" && event.usage) {
        outputTokens = event.usage.output_tokens || 0;
      }
    }
  }

  yield {
    type: "done",
    fullText,
    model: options.modelId,
    provider: "anthropic",
    usage: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
  };
}
