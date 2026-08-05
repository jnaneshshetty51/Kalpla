export type ModelTier = "cheap" | "expensive";

export type LLMProviderName = "anthropic" | "openai";

export type LLMRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMProxyRequest {
  feature: string;
  model: ModelTier;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  provider?: LLMProviderName;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export interface LLMProxyResponse {
  content: string;
  model: string;
  provider: LLMProviderName;
  usage: LLMUsage;
  feature: string;
}

export interface InternalLLMOptions {
  modelId: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  feature: string;
}

export interface LogCostParams {
  userId: string;
  feature: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export interface UsageCapAllowed {
  allowed: true;
  tier: string;
}

export interface UsageCapExceeded {
  allowed: false;
  error: "usage_cap_exceeded";
  feature: string;
  resetDate: string;
  limit: number;
  currentUsage: number;
}

export type UsageCapCheckResult = UsageCapAllowed | UsageCapExceeded;
