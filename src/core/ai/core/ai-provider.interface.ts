import type { AIAnalysisResponse, AIAuthType, AIProviderManifest, AIProviderType, AITaskType } from '@shared/types/workspace'

export interface AIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface AIToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
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
  tools?: AIToolDefinition[]
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
 * Contrato unico que deben implementar todos los proveedores IA.
 * Mantiene un comportamiento consistente entre OpenAI, Anthropic, Gemini y otros adaptadores.
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

  /** Devuelve el manifest usado por la interfaz de configuracion. */
  manifest(): AIProviderManifest

  /** Valida si la configuracion es suficiente para ejecutar el proveedor. */
  validateConfig(config: AIProviderRuntimeConfig): { ok: boolean; message: string }

  /** Prueba la conexion real con la API del proveedor. */
  testConnection(config: AIProviderRuntimeConfig): Promise<{ ok: boolean; message: string }>

  /** Envia una solicitud de chat al proveedor. */
  chat(config: AIProviderRuntimeConfig, request: AIChatRequest): Promise<AIChatResult>

  /** Envia una solicitud de chat en streaming si el proveedor lo soporta. */
  streamChat?(config: AIProviderRuntimeConfig, request: AIChatRequest): AsyncIterable<string>

  /** Devuelve el ultimo reporte de uso cuando el proveedor lo expone. */
  getUsage?(): Promise<AIUsageReport | null>
}
