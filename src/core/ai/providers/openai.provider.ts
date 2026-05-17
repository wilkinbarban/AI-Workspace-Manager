import axios from 'axios'
import type {
  AIChatRequest,
  AIChatResult,
  AIToolCall,
  AIProviderRuntimeConfig
} from '@core/ai/core/ai-provider.interface'
import { OpenAICompatibleProvider } from './base.provider'
import { normalizeAIResponse } from '@core/ai/core/ai-response'

// ─── Architecture note ───────────────────────────────────────────────────────
//
// OpenAI offers two main API surfaces:
//
//   1. Chat Completions  POST /v1/chat/completions   (stable, widely supported)
//   2. Responses API     POST /v1/responses          (new agentic surface, March 2025)
//
// The Responses API is optimised for multi-step agentic loops with server-side
// state management. THIS project follows a client-side stateless architecture
// (full conversation history is passed on every request), which is exactly the
// use-case Chat Completions was designed for.  Migrating to the Responses API
// would require rewriting the shared AIProviderAdapter contract and all callers
// without any practical benefit for our workflow, and it would break the other
// provider adapters.
//
// Decision: use Chat Completions for all production models.  The Responses API
// will be adopted if/when the project migrates to a server-side agent loop.
//
// Reference: https://platform.openai.com/docs/api-reference/chat

// ─── Official OpenAI model IDs (May 2025 – actively available) ──────────────
//
// Source: https://platform.openai.com/docs/models
//
// GPT-4.1 family – launched April 14 2025
//   gpt-4.1            Flagship: complex reasoning, coding, 1M token context
//   gpt-4.1-mini       Balanced speed/cost for production
//   gpt-4.1-nano       Fastest / cheapest, simple extraction / classification
//
// GPT-4o family – multimodal, vision-capable
//   gpt-4o             Best multimodal (text + vision) performance
//   gpt-4o-mini        Cost-efficient multimodal
//
// Reasoning (o-series)
//   o3                 Most powerful reasoning model
//   o4-mini            Compact high-performance reasoning (supports vision)
//
// NOTE: "gpt-5.4-pro", "gpt-5.4-flash", "gpt-5.3-codex" do NOT exist in the
// API. They were placeholder identifiers added in a previous migration. They
// are replaced below with real model IDs.

/** Official, verified OpenAI model IDs. */
const OPENAI_MODELS = {
  /** Flagship GPT-4.1 – complex reasoning, 1M token context, vision. */
  GPT_4_1: 'gpt-4.1',
  /** Mid-tier GPT-4.1 – production balance of speed and quality. */
  GPT_4_1_MINI: 'gpt-4.1-mini',
  /** Fastest GPT-4.1 – high-volume classification and extraction. */
  GPT_4_1_NANO: 'gpt-4.1-nano',
  /** Most capable multimodal model – text + image inputs. */
  GPT_4O: 'gpt-4o',
  /** Most powerful reasoning model – chain-of-thought, math, science. */
  O3: 'o3',
  /** Compact high-performance reasoning – vision, tools, low latency. */
  O4_MINI: 'o4-mini'
} as const

/** Reasoning models use `max_completion_tokens` instead of `max_tokens`. */
const REASONING_MODELS: ReadonlySet<string> = new Set([
  OPENAI_MODELS.O3,
  OPENAI_MODELS.O4_MINI
])

/** Default max output tokens for standard models. */
const DEFAULT_MAX_TOKENS = 8192

// ─── OpenAI-specific wire types ─────────────────────────────────────────────

/** Single choice object inside a Chat Completions response. */
interface OpenAIChoice {
  index: number
  message: {
    role: 'assistant'
    content: string | null
    tool_calls?: Array<{
      id: string
      type: 'function'
      function: { name: string; arguments: string }
    }>
    /** Only present on reasoning models when `include` is set. */
    reasoning?: string
  }
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null
}

/** Full Chat Completions API response body. */
interface OpenAIResponse {
  id: string
  object: 'chat.completion'
  model: string
  choices: OpenAIChoice[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/** Single streaming chunk (delta) returned by SSE. */
interface OpenAIStreamChunk {
  id: string
  object: 'chat.completion.chunk'
  choices: Array<{
    index: number
    delta: {
      role?: string
      content?: string | null
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

// ─── Vision helpers ──────────────────────────────────────────────────────────

/** Detect if a string is a data URL for an image (base64 or URL). */
function isImageUrl(text: string): boolean {
  return (
    text.startsWith('data:image/') ||
    /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(text)
  )
}

/**
 * Builds a multimodal content array when the message contains an image
 * reference embedded as `[IMAGE:<url>]<remaining text>`.
 *
 * If the message is plain text, returns the string as-is (no overhead).
 */
function buildOpenAIContent(
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

/**
 * OpenAIProvider
 *
 * Implements the OpenAI Chat Completions API (`POST /v1/chat/completions`).
 *
 * Supported capabilities:
 *   - Standard text generation (all models)
 *   - Streaming via SSE (`stream: true`)
 *   - Tool / function calling (all models except o3 at low tier)
 *   - Vision / multimodal inputs (gpt-4.1, gpt-4o, o4-mini)
 *   - Reasoning models (o3, o4-mini) with `max_completion_tokens`
 *
 * Auth: `Authorization: Bearer <apiKey>` (handled by base.provider headers()).
 */
export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      id: 'openai',
      name: 'OpenAI / GPT / Codex',
      authType: 'bearer',
      defaultBaseUrl: 'https://api.openai.com/v1',
      defaultModel: OPENAI_MODELS.GPT_4_1_MINI,
      availableModels: [
        OPENAI_MODELS.GPT_4_1,
        OPENAI_MODELS.GPT_4_1_MINI,
        OPENAI_MODELS.GPT_4_1_NANO,
        OPENAI_MODELS.GPT_4O,
        OPENAI_MODELS.O3,
        OPENAI_MODELS.O4_MINI
      ],
      description:
        'Modelos GPT-4.1, GPT-4o y razonamiento o3/o4-mini mediante API Key Bearer Token.',
      requiresApiKey: true,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true
    })
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  override validateConfig(config: AIProviderRuntimeConfig): { ok: boolean; message: string } {
    const base = super.validateConfig(config)
    if (!base.ok) return base

    if (config.apiKey && !config.apiKey.startsWith('sk-')) {
      return {
        ok: false,
        message:
          'Las API Keys de OpenAI comienzan con "sk-". Verifica la clave en platform.openai.com/api-keys.'
      }
    }

    return { ok: true, message: 'Configuración OpenAI válida.' }
  }

  // ─── Chat (non-streaming) ─────────────────────────────────────────────────

  override async chat(
    config: AIProviderRuntimeConfig,
    request: AIChatRequest
  ): Promise<AIChatResult> {
    const isReasoning = REASONING_MODELS.has(config.model)
    const body = this.buildRequestBody(config, request, isReasoning)

    const response = await axios
      .post<OpenAIResponse>(
        `${this.resolveBaseUrl(config)}/chat/completions`,
        body,
        { timeout: 300_000, headers: this.headers(config) }
      )
      .catch((error: unknown) => {
        throw new Error(this.formatProviderError(error), { cause: error })
      })

    return this.adaptResponse(response.data, request)
  }

  // ─── Streaming (SSE) ──────────────────────────────────────────────────────

  /**
   * Streams tokens from `/v1/chat/completions` using `stream: true`.
   *
   * SSE format (Chat Completions):
   *   data: {"id":"...","choices":[{"delta":{"content":"Hello"},...}]}
   *   data: [DONE]
   *
   * Yields each text token as it arrives. Assembled tool calls are NOT yielded
   * incrementally — the full call is resolved after the stream closes (caller
   * should use `chat()` directly when tool use is required).
   */
  async *streamChat(
    config: AIProviderRuntimeConfig,
    request: AIChatRequest
  ): AsyncIterable<string> {
    const isReasoning = REASONING_MODELS.has(config.model)
    const body = { ...this.buildRequestBody(config, request, isReasoning), stream: true }

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
          const parsed = JSON.parse(raw) as OpenAIStreamChunk
          const delta = parsed.choices?.[0]?.delta
          const text = delta?.content
          if (typeof text === 'string' && text) yield text
        } catch {
          // Malformed SSE line – skip
        }
      }
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Builds the Chat Completions request body.
   *
   * Key differences for reasoning models (o3, o4-mini):
   *   - `max_tokens` → `max_completion_tokens`
   *   - `temperature` is not supported (omitted)
   *   - `response_format: json_object` is not supported (omitted)
   */
  private buildRequestBody(
    config: AIProviderRuntimeConfig,
    request: AIChatRequest,
    isReasoning: boolean
  ): Record<string, unknown> {
    const messages = this.buildMessages(request)
    const tools = request.tools?.length ? request.tools : undefined

    const tokenParam = isReasoning ? 'max_completion_tokens' : 'max_tokens'
    const maxTokens = request.tools?.length || request.responseFormat === 'json'
      ? DEFAULT_MAX_TOKENS
      : isReasoning
        ? DEFAULT_MAX_TOKENS
        : 4096

    return {
      model: config.model,
      messages,
      [tokenParam]: maxTokens,
      ...(!isReasoning ? { temperature: 0.2 } : {}),
      ...(!isReasoning && request.responseFormat === 'json'
        ? { response_format: { type: 'json_object' } }
        : {}),
      ...(tools ? { tools, tool_choice: 'auto' } : {})
    }
  }

  /**
   * Converts the internal AIChatMessage[] to OpenAI Chat Completions format.
   *
   * Vision: content is expanded to an array of typed blocks when the message
   * contains `[IMAGE:<url>]` markers.
   */
  private buildMessages(request: AIChatRequest): unknown[] {
    return request.messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: msg.tool_call_id ?? '',
          content: msg.content ?? ''
        }
      }

      if (msg.role === 'assistant' && msg.tool_calls?.length) {
        return {
          role: 'assistant',
          content: msg.content ?? null,
          tool_calls: msg.tool_calls
        }
      }

      return {
        role: msg.role,
        content: buildOpenAIContent(msg.content)
      }
    })
  }

  /**
   * Maps the OpenAI response to the internal AIChatResult shape.
   * Reads exact token usage from the `usage` field (never estimated).
   */
  private adaptResponse(data: OpenAIResponse, request: AIChatRequest): AIChatResult {
    const choice = data.choices?.[0]?.message
    const content = choice?.content ?? null
    const toolCalls = choice?.tool_calls?.length
      ? (choice.tool_calls as AIToolCall[])
      : undefined

    const isAnalysis =
      request.responseFormat === 'json' && content != null && !toolCalls
    const analysis = isAnalysis ? normalizeAIResponse(content) : undefined

    return {
      content,
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
    return `${base}. Verifica: API Key activa en platform.openai.com, modelo disponible (${Object.values(OPENAI_MODELS).join(' | ')}), cuota de uso y región.`
  }
}
