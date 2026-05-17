import type { AIAnalysisResponse, AIAuthType, AIProviderManifest, AIProviderType, AITaskType } from '@shared/types/workspace'

export interface AIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: AIToolCall[]
  tool_call_id?: string
  name?: string
  reasoning_content?: string
}

export interface AIChatRequest {
  messages: AIChatMessage[]
  taskType: AITaskType
  responseFormat?: 'json' | 'text'
  tools?: any[]
}

export interface AIUsageReport {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  remainingTokens: number | null
  estimatedCostUsd: number | null
  isEstimate: boolean
}

export interface AIChatResult {
  content: string | null
  reasoningContent?: string
  analysis?: AIAnalysisResponse
  usage: AIUsageReport
  toolCalls?: AIToolCall[]
}

export interface AIProviderRuntimeConfig {
  id: string
  name: string
  type: AIProviderType
  authType: AIAuthType
  apiKey: string | null
  baseUrl: string | null
  model: string
}

/**
 * Standard interface for all AI Providers (OpenAI, Anthropic, Gemini, etc.).
 * Adapters must implement this to ensure consistent behavior across the application.
 */
export interface AIProviderAdapter {
  readonly id: AIProviderType
  readonly name: string
  readonly authType: AIAuthType
  readonly baseUrl: string | null
  readonly availableModels: string[]
  readonly supportsStreaming: boolean
  readonly supportsTools: boolean
  readonly supportsVision: boolean
  readonly supportsLocal: boolean

  /** Generates the provider manifest for UI configuration. */
  manifest(): AIProviderManifest

  /** Validates if the given configuration is correct for this provider. */
  validateConfig(config: AIProviderRuntimeConfig): { ok: boolean; message: string }

  /** Tests the connection to the provider's API. */
  testConnection(config: AIProviderRuntimeConfig): Promise<{ ok: boolean; message: string }>

  /** Sends a chat completion request to the provider. */
  chat(config: AIProviderRuntimeConfig, request: AIChatRequest): Promise<AIChatResult>

  /** Streams a chat completion request to the provider. */
  streamChat?(config: AIProviderRuntimeConfig, request: AIChatRequest): AsyncIterable<string>

  /** Retrieves the latest usage report for token tracking. */
  getUsage?(): Promise<AIUsageReport | null>
}

