import {
  LLMProviderName,
  InternalLLMOptions,
  LLMProxyResponse,
} from "@/types/llm";
import { callAnthropic } from "./anthropic";
import { callOpenAI } from "./openai";

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
