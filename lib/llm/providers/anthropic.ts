import { InternalLLMOptions, LLMProxyResponse } from "@/types/llm";

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
    };
  }

  // Development Fallback Mock
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
