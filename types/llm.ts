export type ModelTier = "cheap" | "expensive";

export type LLMProviderName = "anthropic" | "openai";

export type LLMRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

/** Anthropic-shaped tool definition (Prompt 70's function-calling support). */
export interface LLMToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMProxyRequest {
  feature: string;
  model: ModelTier;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  provider?: LLMProviderName;
  tools?: LLMToolDefinition[];
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
  /** Present when the model chose to call one or more tools instead of (or alongside) replying with text. */
  toolCalls?: LLMToolUse[];
  stopReason?: string;
}

export interface InternalLLMOptions {
  modelId: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  feature: string;
  tools?: LLMToolDefinition[];
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
  /** Usage/limit as of the check, before this call's increment — lets the
   * caller compute the post-increment 80% soft-warning threshold (Prompt 84). */
  currentUsage: number;
  limit: number;
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

/** Soft warning once a call pushes usage to/past 80% of the tier cap, but before the hard block at 100% (Prompt 84). */
export interface UsageWarning {
  feature: string;
  currentUsage: number;
  limit: number;
  percentUsed: number;
}

export type LLMStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; fullText: string; usage: LLMUsage; model: string; provider: LLMProviderName };
