import { LLMProxyRequest, LLMProxyResponse } from "@/types/llm";

/**
 * Client and service helper function to invoke the unified backend LLM proxy.
 * All AI interactions across the application MUST use this proxy call.
 *
 * @param params LLM request parameters: { feature, model, messages, maxTokens, temperature, provider }
 * @returns LLMProxyResponse containing generated text content and token usage metadata.
 */
export async function callLLM(
  params: LLMProxyRequest,
): Promise<LLMProxyResponse> {
  const response = await fetch("/api/llm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      errorData.error || `LLM proxy call failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  const data: LLMProxyResponse = await response.json();
  return data;
}
