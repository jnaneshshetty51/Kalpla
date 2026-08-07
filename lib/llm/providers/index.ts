import {
  LLMProviderName,
  InternalLLMOptions,
  LLMProxyResponse,
  LLMStreamEvent,
} from "@/types/llm";
import { callAnthropic, streamAnthropic } from "./anthropic";
import { callOpenAI, streamOpenAI } from "./openai";

export interface ExecuteLLMCallOptions extends InternalLLMOptions {
  provider: LLMProviderName;
}

export async function executeLLMCall(
  options: ExecuteLLMCallOptions,
): Promise<LLMProxyResponse> {
  if (options.provider === "openai") {
    return await callOpenAI(options);
  }

  // Default to Anthropic
  return await callAnthropic(options);
}

/**
 * Streaming counterpart to executeLLMCall, for endpoints that need to
 * render tokens progressively (e.g. the tutor chat) rather than wait for
 * the full response.
 */
export async function* executeLLMCallStream(
  options: ExecuteLLMCallOptions,
): AsyncGenerator<LLMStreamEvent> {
  if (options.provider === "openai") {
    yield* streamOpenAI(options);
    return;
  }

  yield* streamAnthropic(options);
}
