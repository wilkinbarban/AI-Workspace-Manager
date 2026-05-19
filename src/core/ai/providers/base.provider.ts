import axios from 'axios'
import type {
  AIChatRequest,
  AIChatResult,
  AIProviderAdapter,
  AIProviderRuntimeConfig
} from '@core/ai/core/ai-provider.interface'
import type { AIAuthType, AIProviderManifest, AIProviderType } from '@shared/types/workspace'
import { extractUsageFromUnknown, normalizeAIResponse } from '@core/ai/core/ai-response'

export interface BaseProviderOptions {
  id: AIProviderType
  name: string
  authType: AIAuthType
  defaultBaseUrl: string | null
  defaultModel: string
  availableModels: string[]
  description: string
  requiresApiKey: boolean
  oauthPrepared?: boolean
  supportsStreaming?: boolean
  supportsTools?: boolean
  supportsVision?: boolean
  supportsLocal?: boolean
  status?: 'ready' | 'prepared' | 'experimental'
}

export class OpenAICompatibleProvider implements AIProviderAdapter {
  readonly id: AIProviderType
  readonly name: string
  readonly authType: AIAuthType
  readonly baseUrl: string | null
  readonly availableModels: string[]
  readonly supportsStreaming: boolean
  readonly supportsTools: boolean
  readonly supportsVision: boolean
  readonly supportsLocal: boolean

  constructor(protected readonly options: BaseProviderOptions) {
    this.id = options.id
    this.name = options.name
    this.authType = options.authType
    this.baseUrl = options.defaultBaseUrl
    this.availableModels = options.availableModels
    this.supportsStreaming = options.supportsStreaming ?? true
    this.supportsTools = options.supportsTools ?? false
    this.supportsVision = options.supportsVision ?? false
    this.supportsLocal = options.supportsLocal ?? false
  }

  manifest(): AIProviderManifest {
    return {
      type: this.options.id,
      name: this.options.name,
      authType: this.options.authType,
      defaultBaseUrl: this.options.defaultBaseUrl,
      defaultModel: this.options.defaultModel,
      availableModels: this.options.availableModels,
      description: this.options.description,
      requiresApiKey: this.options.requiresApiKey,
      oauthPrepared: this.options.oauthPrepared ?? false,
      supportsStreaming: this.supportsStreaming,
      supportsTools: this.supportsTools,
      supportsVision: this.supportsVision,
      supportsLocal: this.supportsLocal,
      status: this.options.status ?? 'ready'
    }
  }

  validateConfig(config: AIProviderRuntimeConfig): { ok: boolean; message: string } {
    if (this.options.requiresApiKey && !config.apiKey) {
      return { ok: false, message: `${this.name} requiere API key.` }
    }

    if (!config.model.trim()) {
      return { ok: false, message: 'Selecciona un modelo.' }
    }

    if (!this.options.defaultBaseUrl && !config.baseUrl) {
      return { ok: false, message: `${this.name} requiere URL base.` }
    }

    return { ok: true, message: 'Configuracion valida.' }
  }

  async testConnection(config: AIProviderRuntimeConfig): Promise<{ ok: boolean; message: string }> {
    const validation = this.validateConfig(config)
    if (!validation.ok) return validation

    try {
      await this.chat(config, {
        taskType: 'analysis',
        responseFormat: 'text',
        messages: [{ role: 'user', content: 'Responde solo: ok' }]
      })
      return { ok: true, message: 'Conexion correcta.' }
    } catch (error) {
      return { ok: false, message: this.formatProviderError(error) }
    }
  }

  async chat(config: AIProviderRuntimeConfig, request: AIChatRequest): Promise<AIChatResult> {
    const response = await axios
      .post(
        `${this.resolveBaseUrl(config)}/chat/completions`,
        {
          model: config.model,
          messages: request.messages,
          temperature: 0.2,
          max_tokens: request.responseFormat === 'json' ? 8192 : request.tools ? 8192 : 64,
          ...(request.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
          ...(request.tools && request.tools.length > 0 ? { tools: request.tools, tool_choice: 'auto' } : {})
        },
        {
          timeout: 300000,
          headers: this.headers(config)
        }
      )
      .catch((error: unknown) => {
        throw new Error(this.formatProviderError(error), { cause: error })
      })
    
    const choice = response.data?.choices?.[0]?.message
    const content = choice?.content ?? null
    const reasoningContent = choice?.reasoning_content
    const toolCalls = choice?.tool_calls

    const isAnalysisRequest = request.responseFormat === 'json' && content && !toolCalls
    const analysis = isAnalysisRequest ? normalizeAIResponse(content) : undefined

    return {
      content,
      reasoningContent,
      analysis,
      usage: extractUsageFromUnknown(response.data),
      toolCalls
    }
  }

  protected resolveBaseUrl(config: AIProviderRuntimeConfig): string {
    return (config.baseUrl || this.options.defaultBaseUrl || '').replace(/\/$/, '')
  }

  protected headers(config: AIProviderRuntimeConfig): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`
    }

    return headers
  }

  protected formatProviderError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const providerMessage = extractProviderErrorMessage(error.response?.data)
      const suffix = providerMessage || error.message || 'No se pudo completar la solicitud.'

      return status ? `${this.name}: HTTP ${status} - ${suffix}` : `${this.name}: ${suffix}`
    }

    return error instanceof Error ? error.message : 'No se pudo probar la conexion.'
  }
}

function extractProviderErrorMessage(data: unknown): string | null {
  if (!data) return null
  if (typeof data === 'string') return data
  if (typeof data !== 'object') return null

  const record = data as Record<string, unknown>
  const nestedError = record.error && typeof record.error === 'object'
    ? record.error as Record<string, unknown>
    : null
  const candidates = [
    nestedError?.message,
    nestedError?.code,
    record.message,
    record.detail,
    record.code
  ]
  const message = candidates.find((candidate): candidate is string => typeof candidate === 'string' && Boolean(candidate.trim()))

  return message ?? null
}
