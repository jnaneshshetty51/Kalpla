import { InternalLLMOptions, LLMProxyResponse, LLMStreamEvent } from "@/types/llm";

export async function callOpenAI(
  options: InternalLLMOptions,
): Promise<LLMProxyResponse> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    const payload: Record<string, unknown> = {
      model: options.modelId,
      messages: options.messages,
      max_tokens: options.maxTokens || 1024,
    };

    if (typeof options.temperature === "number") {
      payload.temperature = options.temperature;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(
        `OpenAI API request failed (${response.status}): ${errBody}`,
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const totalTokens =
      data.usage?.total_tokens || promptTokens + completionTokens;

    return {
      content,
      model: options.modelId,
      provider: "openai",
      feature: options.feature,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
    };
  }

  // Development Fallback Mock
  console.warn(
    `[lib/llm/providers/openai] OPENAI_API_KEY not found. Using development mock for feature "${options.feature}".`,
  );

  const mockText = `[Mock OpenAI ${options.modelId}] Processed feature "${options.feature}" successfully.`;
  return {
    content: mockText,
    model: options.modelId,
    provider: "openai",
    feature: options.feature,
    usage: {
      promptTokens: 15,
      completionTokens: 25,
      totalTokens: 40,
    },
  };
}

/**
 * Streaming variant of callOpenAI for endpoints that render tokens
 * progressively. Yields text deltas, then a final "done" event with the
 * assembled full text and usage.
 */
export async function* streamOpenAI(
  options: InternalLLMOptions,
): AsyncGenerator<LLMStreamEvent> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn(
      `[lib/llm/providers/openai] OPENAI_API_KEY not found. Using development mock stream for feature "${options.feature}".`,
    );

    const mockText = `[Mock OpenAI ${options.modelId}] Processed feature "${options.feature}" successfully. This is a simulated streaming response so the chat UI can be exercised end-to-end without a live API key.`;
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
      provider: "openai",
      usage: { promptTokens: 15, completionTokens: 25, totalTokens: 40 },
    };
    return;
  }

  const payload: Record<string, unknown> = {
    model: options.modelId,
    messages: options.messages,
    max_tokens: options.maxTokens || 1024,
    stream: true,
  };
  if (typeof options.temperature === "number") {
    payload.temperature = options.temperature;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    const errBody = await response.text().catch(() => "");
    throw new Error(
      `OpenAI streaming API request failed (${response.status}): ${errBody}`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  // OpenAI's streaming chat completions API doesn't include token usage in
  // each chunk by default; approximate from character count as a fallback
  // so cost logging still has a number rather than silently zero.
  const promptCharsEstimate = options.messages.reduce((sum, m) => sum + m.content.length, 0);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice("data: ".length).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;

      let event: { choices?: Array<{ delta?: { content?: string } }> };
      try {
        event = JSON.parse(jsonStr);
      } catch {
        continue;
      }

      const deltaText = event.choices?.[0]?.delta?.content;
      if (deltaText) {
        fullText += deltaText;
        yield { type: "delta", text: deltaText };
      }
    }
  }

  const promptTokensEstimate = Math.ceil(promptCharsEstimate / 4);
  const completionTokensEstimate = Math.ceil(fullText.length / 4);

  yield {
    type: "done",
    fullText,
    model: options.modelId,
    provider: "openai",
    usage: {
      promptTokens: promptTokensEstimate,
      completionTokens: completionTokensEstimate,
      totalTokens: promptTokensEstimate + completionTokensEstimate,
    },
  };
}
