import { InternalLLMOptions, LLMProxyResponse } from "@/types/llm";

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
