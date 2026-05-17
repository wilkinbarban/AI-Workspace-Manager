import axios from 'axios'
import type {
  AIChatRequest,
  AIChatResult,
  AIToolCall,
  AIProviderRuntimeConfig
} from '@core/ai/core/ai-provider.interface'
import { OpenAICompatibleProvider } from './base.provider'
import { normalizeAIResponse } from '@core/ai/core/ai-response'

// ─── Architecture note ────────────────────────────────────────────────────────
//
// OpenRouter provides a unified, OpenAI-compatible API to access hundreds of
// LLMs. While highly compatible, it requires specific handling:
//
//  1. Headers: Expects `HTTP-Referer` and `X-Title` to identify the app.
//  2. Reasoning: Supports `include_reasoning: true` to return thinking steps
//     in the `reasoning` field of the response.
//  3. Models: Changes dynamically. We provide a robust default set, but
//     expose `fetchAvailableModels()` to query `/api/v1/models` in real-time.
//  4. SSE Streaming: Identical to OpenAI, but reasoning tokens may arrive.
//
// Reference: https://openrouter.ai/docs

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1'

/**
 * Standard robust models usually available on OpenRouter.
 * This acts as a fallback if dynamic loading is not used.
 */
const DEFAULT_OPENROUTER_MODELS = [
  'openai/gpt-4.1',
  'openai/gpt-4.1-mini',
  'openai/gpt-4o',
  'openai/o4-mini',
  'anthropic/claude-3.5-sonnet', // Note: OpenRouter uses specific naming for anthropic
  'anthropic/claude-3-opus',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'deepseek/deepseek-chat',
  'deepseek/deepseek-reasoner'
]

// ─── OpenRouter Wire Types ───────────────────────────────────────────────────

interface OpenRouterModelMetadata {
  id: string
  name: string
  description: string
  pricing: { prompt: string; completion: string }
  context_length: number
  architecture: {
    modality: string
    tokenizer: string
    instruct_type: string
  }
}

interface OpenRouterResponse {
  id: string
  model: string
  choices: Array<{
    message: {
      role: 'assistant'
      content: string | null
      /** Included if include_reasoning is true */
      reasoning?: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }
    finish_reason: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface OpenRouterStreamChunk {
  id: string
  choices: Array<{
    delta: {
      role?: string
      content?: string | null
      reasoning?: string | null
      tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// ─── Vision Helper ────────────────────────────────────────────────────────────

function isImageUrl(text: string): boolean {
  return (
    text.startsWith('data:image/') ||
    /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(text)
  )
}

function buildOpenRouterContent(
  raw: string | null
): string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'auto' } }> {
  if (!raw) return ''

  const imagePattern = /\[IMAGE:(.*?)\]/g
  const matches = [...raw.matchAll(imagePattern)]

  if (!matches.length) return raw

  const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'auto' } }> = []
  let cursor = 0

  for (const match of matches) {
    const before = raw.slice(cursor, match.index)
    if (before.trim()) parts.push({ type: 'text', text: before.trim() })

    const url = match[1].trim()
    if (isImageUrl(url)) {
      parts.push({ type: 'image_url', image_url: { url, detail: 'auto' } })
    }

    cursor = (match.index ?? 0) + match[0].length
  }

  const after = raw.slice(cursor)
  if (after.trim()) parts.push({ type: 'text', text: after.trim() })

  return parts
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class OpenRouterProvider extends OpenAICompatibleProvider {
  /** Cached list of dynamic models from OpenRouter */
  private cachedModels: string[] | null = null

  constructor() {
    super({
      id: 'openrouter',
      name: 'OpenRouter',
      authType: 'bearer',
      defaultBaseUrl: OPENROUTER_API_BASE,
      defaultModel: 'openai/gpt-4.1-mini',
      availableModels: DEFAULT_OPENROUTER_MODELS,
      description: 'Router multi-modelo OpenAI compatible. Carga dinamica de modelos disponible.',
      requiresApiKey: true,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true
    })
  }

  // ─── Dynamic Model Loading ──────────────────────────────────────────────────

  /**
   * Fetches all available models directly from the OpenRouter API.
   * Caches the result to avoid redundant network requests.
   */
  async fetchAvailableModels(config?: AIProviderRuntimeConfig): Promise<string[]> {
    if (this.cachedModels) return this.cachedModels

    try {
      const response = await axios.get<{ data: OpenRouterModelMetadata[] }>(
        `${this.resolveBaseUrl(config ?? { baseUrl: null } as AIProviderRuntimeConfig)}/models`,
        { timeout: 15_000 }
      )
      
      this.cachedModels = response.data.data.map((m) => m.id)
      
      // Merge with default to ensure core models are present if API fails partially
      const uniqueModels = new Set([...DEFAULT_OPENROUTER_MODELS, ...this.cachedModels])
      return Array.from(uniqueModels).sort()
    } catch (error) {
      console.warn('Failed to fetch OpenRouter models:', error)
      return DEFAULT_OPENROUTER_MODELS
    }
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  override validateConfig(config: AIProviderRuntimeConfig): { ok: boolean; message: string } {
    const base = super.validateConfig(config)
    if (!base.ok) return base

    if (config.apiKey && !config.apiKey.startsWith('sk-or-')) {
      return {
        ok: false,
        message: 'Las API Keys de OpenRouter suelen comenzar con "sk-or-". Verifica tu clave en openrouter.ai/keys.'
      }
    }

    return { ok: true, message: 'Configuracion OpenRouter valida.' }
  }

  // ─── Header Injection ───────────────────────────────────────────────────────

  protected override headers(config: AIProviderRuntimeConfig): Record<string, string> {
    const baseHeaders = super.headers(config)
    return {
      ...baseHeaders,
      'HTTP-Referer': 'https://github.com/wilkinbarban/AI-Workspace-Manager',
      'X-Title': 'AI Workspace Manager'
    }
  }

  // ─── Chat (non-streaming) ─────────────────────────────────────────────────

  override async chat(
    config: AIProviderRuntimeConfig,
    request: AIChatRequest
  ): Promise<AIChatResult> {
    const body = this.buildRequestBody(config, request)

    const response = await axios
      .post<OpenRouterResponse>(
        `${this.resolveBaseUrl(config)}/chat/completions`,
        body,
        { timeout: 300_000, headers: this.headers(config) }
      )
      .catch((error: unknown) => {
        throw new Error(this.formatProviderError(error), { cause: error })
      })

    return this.adaptResponse(response.data, request)
  }

  // ─── Streaming (SSE) ────────────────────────────────────────────────────────

  async *streamChat(
    config: AIProviderRuntimeConfig,
    request: AIChatRequest
  ): AsyncIterable<string> {
    const body = { ...this.buildRequestBody(config, request), stream: true }

    const response = await axios
      .post(
        `${this.resolveBaseUrl(config)}/chat/completions`,
        body,
        {
          timeout: 300_000,
          responseType: 'stream',
          headers: this.headers(config)
        }
      )
      .catch((error: unknown) => {
        throw new Error(this.formatProviderError(error), { cause: error })
      })

    let buffer = ''

    for await (const chunk of response.data as AsyncIterable<Buffer>) {
      buffer += chunk.toString('utf8')
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue

        const raw = trimmed.slice(5).trim()
        if (raw === '[DONE]') return

        try {
          const parsed = JSON.parse(raw) as OpenRouterStreamChunk
          const delta = parsed.choices?.[0]?.delta

          // Yield final answer tokens (ignoring reasoning tokens for simplicity in stream)
          const text = delta?.content
          if (typeof text === 'string' && text) yield text
        } catch {
          // Malformed SSE line — skip silently
        }
      }
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private buildRequestBody(
    config: AIProviderRuntimeConfig,
    request: AIChatRequest
  ): Record<string, unknown> {
    const messages = request.messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: msg.tool_call_id ?? '',
          content: msg.content ?? ''
        }
      }

      if (msg.role === 'assistant') {
        return {
          role: 'assistant',
          content: msg.content ?? null,
          ...(msg.reasoning_content ? { reasoning: msg.reasoning_content } : {}),
          ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {})
        }
      }

      return {
        role: msg.role,
        content: buildOpenRouterContent(msg.content)
      }
    })

    const tools = request.tools?.length ? request.tools : undefined

    return {
      model: config.model,
      messages,
      temperature: 0.2,
      include_reasoning: true, // Native OpenRouter parameter to capture thinking models
      max_tokens: tools?.length ? 8192 : request.responseFormat === 'json' ? 8192 : 4096,
      ...(request.responseFormat === 'json'
        ? { response_format: { type: 'json_object' } }
        : {}),
      ...(tools ? { tools, tool_choice: 'auto' } : {})
    }
  }

  private adaptResponse(data: OpenRouterResponse, request: AIChatRequest): AIChatResult {
    const msg = data.choices?.[0]?.message
    const content = msg?.content ?? null
    const reasoningContent = msg?.reasoning ?? undefined
    const toolCalls = msg?.tool_calls?.length
      ? (msg.tool_calls as AIToolCall[])
      : undefined

    const isAnalysis =
      request.responseFormat === 'json' && content != null && !toolCalls
    const analysis = isAnalysis ? normalizeAIResponse(content) : undefined

    return {
      content,
      reasoningContent,
      analysis,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? null,
        outputTokens: data.usage?.completion_tokens ?? null,
        totalTokens: data.usage?.total_tokens ?? null,
        remainingTokens: null,
        estimatedCostUsd: null,
        isEstimate: data.usage == null
      },
      ...(toolCalls ? { toolCalls } : {})
    }
  }

  protected override formatProviderError(error: unknown): string {
    const base = super.formatProviderError(error)
    
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      return `${base}. Límite de tasa excedido (Rate Limit) o fondos insuficientes en OpenRouter.`
    }
    
    return `${base}. Verifica: API Key activa en openrouter.ai/keys y disponibilidad del modelo ${this.options.defaultModel}.`
  }
}
