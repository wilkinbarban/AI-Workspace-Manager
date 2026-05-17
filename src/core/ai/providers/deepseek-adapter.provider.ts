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
// DeepSeek is LARGELY OpenAI-compatible, but has key differences:
//
//  ✅ Same endpoint:    POST /chat/completions
//  ✅ Same auth:        Authorization: Bearer <apiKey>
//  ✅ Same SSE format:  stream: true  →  data: {...}  /  data: [DONE]
//  ✅ Same tool format: tools[] with function definitions
//
//  ⚠️ Unique:  `reasoning_content` field on assistant messages (thinking mode)
//  ⚠️ Unique:  Thinking mode params (temperature/top_p have no effect when thinking)
//  ⚠️ Unique:  Platform URL (platform.deepseek.com) ≠ API URL (api.deepseek.com)
//
// Because the wire format is compatible, this provider extends OpenAICompatibleProvider
// and ONLY overrides where DeepSeek diverges: streaming (to capture reasoning_content)
// and error messages specific to DeepSeek issues (balance, model availability, etc.).

// ─── Official DeepSeek model IDs ─────────────────────────────────────────────
//
// Source: https://api-docs.deepseek.com/api/list-models
//
// deepseek-v4-flash   High efficiency, low latency, low cost.
//                     Supports "thinking" (reasoning) mode.
//                     Replaces legacy: deepseek-chat (non-thinking)
//                                      deepseek-reasoner (thinking)
//                     Deprecation of legacy aliases: July 24 2026.
//
// deepseek-v4-pro     Highest capability: complex reasoning, coding, agents.
//                     Optimised for quality over cost.

/** Official, verified DeepSeek model IDs. */
const DEEPSEEK_MODELS = {
  /** High-efficiency model; supports thinking mode via `thinking` param. */
  FLASH: 'deepseek-v4-flash',
  /** Highest-capability model for agentic and complex reasoning tasks. */
  PRO: 'deepseek-v4-pro'
} as const

/** DeepSeek API base URL. Different from platform.deepseek.com (web console). */
const DEEPSEEK_API_BASE = 'https://api.deepseek.com' as const

// ─── DeepSeek-specific response shape ────────────────────────────────────────

/**
 * DeepSeek extends the standard OpenAI choice message with `reasoning_content`,
 * which holds the Chain-of-Thought produced when thinking mode is enabled.
 */
interface DeepSeekMessage {
  role: 'assistant'
  content: string | null
  /** Chain-of-thought reasoning. Only present when thinking mode is on. */
  reasoning_content?: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

interface DeepSeekResponse {
  id: string
  object: 'chat.completion'
  model: string
  choices: Array<{
    index: number
    message: DeepSeekMessage
    finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface DeepSeekStreamChunk {
  choices: Array<{
    index: number
    delta: {
      role?: string
      content?: string | null
      /** Streamed thinking tokens (thinking mode). */
      reasoning_content?: string | null
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

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * DeepSeekAdapterProvider
 *
 * Implements the DeepSeek Chat Completions API via `POST /chat/completions`.
 * Wire format is OpenAI-compatible with DeepSeek-specific extensions.
 *
 * Supported capabilities:
 *   - Standard text generation
 *   - SSE streaming (`stream: true`)
 *   - Tool / function calling (same schema as OpenAI)
 *   - Reasoning / thinking mode (`deepseek-v4-flash` only)
 *   - `reasoning_content` passthrough on multi-turn tool calls
 *
 * Auth: `Authorization: Bearer <apiKey>` — handled by base.provider.headers().
 */
export class DeepSeekAdapterProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      id: 'deepseek',
      name: 'DeepSeek',
      authType: 'bearer',
      defaultBaseUrl: DEEPSEEK_API_BASE,
      defaultModel: DEEPSEEK_MODELS.FLASH,
      availableModels: [DEEPSEEK_MODELS.FLASH, DEEPSEEK_MODELS.PRO],
      description:
        'DeepSeek V4 Flash y Pro con soporte de razonamiento extendido (thinking mode), tools y streaming nativo.',
      requiresApiKey: true,
      supportsStreaming: true,
      supportsTools: true
    })
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  override validateConfig(config: AIProviderRuntimeConfig): { ok: boolean; message: string } {
    const base = super.validateConfig(config)
    if (!base.ok) return base

    if (config.baseUrl?.includes('platform.deepseek.com')) {
      return {
        ok: false,
        message:
          'platform.deepseek.com es el panel de control donde se crean las claves. Para la API de inferencia usa https://api.deepseek.com.'
      }
    }

    if (config.apiKey && !config.apiKey.startsWith('sk-')) {
      return {
        ok: false,
        message:
          'Las API Keys de DeepSeek comienzan con "sk-". Verifica la clave en platform.deepseek.com/api_keys.'
      }
    }

    return { ok: true, message: 'Configuración DeepSeek válida.' }
  }

  // ─── Chat (non-streaming) ─────────────────────────────────────────────────

  override async chat(
    config: AIProviderRuntimeConfig,
    request: AIChatRequest
  ): Promise<AIChatResult> {
    const body = this.buildRequestBody(config, request)

    const response = await axios
      .post<DeepSeekResponse>(
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
   * Streams tokens from `/chat/completions` using DeepSeek SSE format.
   *
   * SSE is identical to OpenAI Chat Completions streaming:
   *   data: {"choices":[{"delta":{"content":"..."},...}]}
   *   data: [DONE]
   *
   * Additionally, when thinking mode produces reasoning tokens, they arrive as
   * `delta.reasoning_content`. We yield content tokens only here; reasoning
   * content is available in the non-streaming `chat()` response.
   */
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
          const parsed = JSON.parse(raw) as DeepSeekStreamChunk
          const delta = parsed.choices?.[0]?.delta

          // Yield final answer tokens (not reasoning/thinking tokens)
          const text = delta?.content
          if (typeof text === 'string' && text) yield text
        } catch {
          // Malformed SSE line — skip silently
        }
      }
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Builds the DeepSeek Chat Completions request body.
   *
   * Notes for thinking mode (`deepseek-v4-flash` only):
   *  - Enable via `extra_body.thinking.type = "enabled"` (not yet exposed in
   *    the generic interface — can be added to `request.tools` metadata or as a
   *    separate option in future).
   *  - When thinking mode is active, `temperature`, `top_p`, `frequency_penalty`
   *    and `presence_penalty` have NO effect and should be omitted to avoid
   *    confusion.
   *
   * For multi-turn conversations that involved a tool call while thinking mode
   * was on, the `reasoning_content` from the assistant turn MUST be included
   * in the `messages` array (passed via `msg.reasoning_content` field).
   */
  private buildRequestBody(
    config: AIProviderRuntimeConfig,
    request: AIChatRequest
  ): Record<string, unknown> {
    const messages = request.messages.map((msg) => {
      if (msg.role === 'tool') {
        return { role: 'tool', tool_call_id: msg.tool_call_id ?? '', content: msg.content ?? '' }
      }

      if (msg.role === 'assistant') {
        return {
          role: 'assistant',
          content: msg.content ?? null,
          // Pass through reasoning_content for multi-turn tool-call continuations
          ...(msg.reasoning_content ? { reasoning_content: msg.reasoning_content } : {}),
          ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {})
        }
      }

      return { role: msg.role, content: msg.content ?? '' }
    })

    const tools = request.tools?.length ? request.tools : undefined

    return {
      model: config.model,
      messages,
      temperature: 0.2,
      max_tokens: tools?.length ? 8192 : request.responseFormat === 'json' ? 8192 : 4096,
      ...(request.responseFormat === 'json'
        ? { response_format: { type: 'json_object' } }
        : {}),
      ...(tools ? { tools, tool_choice: 'auto' } : {})
    }
  }

  /**
   * Maps a DeepSeek response to the internal AIChatResult.
   * Preserves `reasoning_content` so callers can include it in multi-turn
   * conversations that involved tool calls (required by DeepSeek's API).
   */
  private adaptResponse(data: DeepSeekResponse, request: AIChatRequest): AIChatResult {
    const msg = data.choices?.[0]?.message
    const content = msg?.content ?? null
    const reasoningContent = msg?.reasoning_content ?? undefined
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
    return (
      `${base}. Verifica: ` +
      `API Key activa en platform.deepseek.com/api_keys, ` +
      `Base URL https://api.deepseek.com (no platform.deepseek.com), ` +
      `modelo ${DEEPSEEK_MODELS.FLASH} o ${DEEPSEEK_MODELS.PRO}, ` +
      `y saldo disponible en la cuenta.`
    )
  }
}
