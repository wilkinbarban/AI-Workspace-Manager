import axios from 'axios'
import type {
  AIChatMessage,
  AIChatRequest,
  AIChatResult,
  AIToolCall,
  AIProviderRuntimeConfig
} from '@core/ai/core/ai-provider.interface'
import { OpenAICompatibleProvider } from './base.provider'
import { normalizeAIResponse } from '@core/ai/core/ai-response'

// ─── Anthropic-native message & content types ───────────────────────────────

/** Text block returned inside an Anthropic response content array. */
interface AnthropicTextBlock {
  type: 'text'
  text: string
}

/** Tool-use block returned inside an Anthropic response content array. */
interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock

/** Shape of a single Anthropic /messages response. */
interface AnthropicMessagesResponse {
  id: string
  type: 'message'
  role: 'assistant'
  model: string
  content: AnthropicContentBlock[]
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | null
  stop_sequence: string | null
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

/** Shape of a tool definition accepted by the Anthropic API. */
interface AnthropicTool {
  name: string
  description?: string
  input_schema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

/** Anthropic message format (non-system). */
interface AnthropicMessage {
  role: 'user' | 'assistant'
  /** Can be a plain string OR an array of typed content blocks (vision). */
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
        | { type: 'tool_result'; tool_use_id: string; content: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
      >
}

// ─── Official Anthropic model IDs (May 2026) ────────────────────────────────

/**
 * Official, versioned Anthropic model identifiers.
 * Using pinned IDs instead of aliases prevents unexpected behaviour on new releases.
 */
const ANTHROPIC_MODELS = {
  /** Most capable model – complex reasoning, advanced agentic coding. */
  OPUS_4: 'claude-opus-4-7',
  /** Balanced speed / intelligence for the majority of production use-cases. */
  SONNET_4: 'claude-sonnet-4-6',
  /** Fastest model – high-throughput and latency-sensitive tasks. */
  HAIKU_4: 'claude-haiku-4-5'
} as const

/** Required `anthropic-version` header value. */
const ANTHROPIC_VERSION = '2023-06-01' as const

/** Default maximum output tokens per request. */
const DEFAULT_MAX_TOKENS = 8192

/**
 * AnthropicProvider
 *
 * Implements the Anthropic Messages API natively. It does NOT delegate to the
 * OpenAI-compatible base logic for the `chat()` method because Anthropic's wire
 * format differs in:
 *  - Auth header (`x-api-key` instead of `Authorization: Bearer`)
 *  - Required `anthropic-version` header
 *  - `system` is a top-level field, NOT a message role
 *  - Tool definitions use `input_schema` (JSON Schema), not `parameters`
 *  - Tool results are `tool_result` content blocks inside user messages
 *  - Response content is an array of typed blocks (`text` | `tool_use`)
 *  - Streaming uses `text-delta` SSE events, not `delta.content`
 */
export class AnthropicProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      id: 'anthropic',
      name: 'Anthropic Claude',
      authType: 'x-api-key',
      defaultBaseUrl: 'https://api.anthropic.com/v1',
      defaultModel: ANTHROPIC_MODELS.SONNET_4,
      availableModels: [
        ANTHROPIC_MODELS.SONNET_4,
        ANTHROPIC_MODELS.OPUS_4,
        ANTHROPIC_MODELS.HAIKU_4
      ],
      description: 'Claude con API Key en header x-api-key. Modelos: Sonnet 4.6, Opus 4.7 y Haiku 4.5.',
      requiresApiKey: true,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true
    })
  }

  // ─── Validation ─────────────────────────────────────────────────────────

  override validateConfig(config: AIProviderRuntimeConfig): { ok: boolean; message: string } {
    const base = super.validateConfig(config)
    if (!base.ok) return base

    if (config.baseUrl?.includes('console.anthropic.com')) {
      return {
        ok: false,
        message:
          'console.anthropic.com es el panel web. Para la API usa https://api.anthropic.com.'
      }
    }

    return { ok: true, message: 'Configuración Anthropic válida.' }
  }

  // ─── Chat (non-streaming) ────────────────────────────────────────────────

  override async chat(
    config: AIProviderRuntimeConfig,
    request: AIChatRequest
  ): Promise<AIChatResult> {
    const { system, messages } = this.splitMessages(request.messages)
    const tools = request.tools?.length ? this.adaptTools(request.tools) : undefined

    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: 0.2,
      messages,
      ...(system ? { system } : {}),
      ...(tools ? { tools, tool_choice: { type: 'auto' } } : {})
    }

    const response = await axios
      .post<AnthropicMessagesResponse>(
        `${this.resolveBaseUrl(config)}/messages`,
        body,
        {
          timeout: 300_000,
          headers: this.anthropicHeaders(config)
        }
      )
      .catch((error: unknown) => {
        throw new Error(this.formatProviderError(error), { cause: error })
      })

    return this.adaptResponse(response.data, request)
  }

  // ─── Streaming (SSE) ─────────────────────────────────────────────────────

  /**
   * Implements `streamChat` using Anthropic's Server-Sent Events protocol.
   *
   * Event sequence per Anthropic docs:
   *   message_start → content_block_start → content_block_delta* → content_block_stop → message_delta → message_stop
   *
   * We yield individual `text_delta` strings so the caller can display tokens
   * progressively. Tool-use blocks are assembled but not yielded mid-stream;
   * the caller receives the full tool call at `message_stop`.
   */
  async *streamChat(
    config: AIProviderRuntimeConfig,
    request: AIChatRequest
  ): AsyncIterable<string> {
    const { system, messages } = this.splitMessages(request.messages)
    const tools = request.tools?.length ? this.adaptTools(request.tools) : undefined

    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: 0.2,
      stream: true,
      messages,
      ...(system ? { system } : {}),
      ...(tools ? { tools, tool_choice: { type: 'auto' } } : {})
    }

    const response = await axios
      .post(`${this.resolveBaseUrl(config)}/messages`, body, {
        timeout: 300_000,
        responseType: 'stream',
        headers: this.anthropicHeaders(config)
      })
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

        const rawData = trimmed.slice(5).trim()
        if (rawData === '[DONE]') return

        try {
          const event = JSON.parse(rawData) as Record<string, unknown>
          const delta = event.delta as Record<string, unknown> | undefined

          // Anthropic SSE: content_block_delta carries a `delta` with `type: text_delta`
          if (event.type === 'content_block_delta' && delta?.type === 'text_delta') {
            const text = delta.text as string
            if (text) yield text
          }
        } catch {
          // Malformed SSE line – skip silently
        }
      }
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Builds the required headers for every Anthropic API request.
   * Anthropic uses `x-api-key` instead of `Authorization: Bearer`.
   */
  private anthropicHeaders(config: AIProviderRuntimeConfig): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      'x-api-key': config.apiKey ?? ''
    }
  }

  /**
   * Splits the internal message list into:
   *  - `system`: the concatenated text of all `system`-role messages
   *  - `messages`: the remaining messages in Anthropic wire format
   *
   * Handles tool results correctly: they become `tool_result` content blocks
   * inside a `user` role message (not a standalone `tool` role).
   */
  private splitMessages(internalMessages: AIChatMessage[]): {
    system: string | undefined
    messages: AnthropicMessage[]
  } {
    const systemParts = internalMessages
      .filter((m) => m.role === 'system')
      .map((m) => m.content ?? '')
      .filter(Boolean)

    const system = systemParts.length ? systemParts.join('\n\n') : undefined

    const messages: AnthropicMessage[] = []

    for (const msg of internalMessages) {
      if (msg.role === 'system') continue

      if (msg.role === 'tool') {
        // Tool results must be wrapped in a `user` message with a `tool_result` content block.
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.tool_call_id ?? '',
              content: msg.content ?? ''
            }
          ]
        })
        continue
      }

      if (msg.role === 'assistant' && msg.tool_calls?.length) {
        // Assistant tool calls become `tool_use` content blocks inside an assistant message.
        messages.push({
          role: 'assistant',
          content: msg.tool_calls.map((tc) => ({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.function.name,
            input: this.parseJsonSafe(tc.function.arguments)
          }))
        })
        continue
      }

      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content ?? ''
      })
    }

    return { system, messages }
  }

  /**
   * Translates the generic OpenAI-style tool definitions (used internally)
   * into Anthropic's `input_schema` format.
   *
   * Internal tool format:
   * ```json
   * { "type": "function", "function": { "name": "...", "description": "...", "parameters": { ... } } }
   * ```
   *
   * Anthropic format:
   * ```json
   * { "name": "...", "description": "...", "input_schema": { "type": "object", ... } }
   * ```
   */
  private adaptTools(tools: any[]): AnthropicTool[] {
    return tools.map((tool) => {
      const fn = tool.function ?? tool
      return {
        name: fn.name,
        ...(fn.description ? { description: fn.description } : {}),
        input_schema: {
          type: 'object',
          ...(fn.parameters ?? fn.input_schema ?? {})
        }
      }
    })
  }

  /**
   * Converts an Anthropic /messages response into the internal AIChatResult.
   *
   * Content blocks of type `text` are concatenated; blocks of type `tool_use`
   * are translated back into the internal OpenAI-compatible AIToolCall shape.
   */
  private adaptResponse(
    data: AnthropicMessagesResponse,
    request: AIChatRequest
  ): AIChatResult {
    const textContent = data.content
      .filter((b): b is AnthropicTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const toolCallBlocks = data.content.filter(
      (b): b is AnthropicToolUseBlock => b.type === 'tool_use'
    )

    const toolCalls: AIToolCall[] | undefined = toolCallBlocks.length
      ? toolCallBlocks.map((b) => ({
          id: b.id,
          type: 'function' as const,
          function: {
            name: b.name,
            arguments: JSON.stringify(b.input)
          }
        }))
      : undefined

    const content = textContent || null

    const isAnalysis =
      request.responseFormat === 'json' && content != null && !toolCalls
    const analysis = isAnalysis ? normalizeAIResponse(content) : undefined

    return {
      content,
      analysis,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        remainingTokens: null,
        estimatedCostUsd: null,
        isEstimate: false
      },
      ...(toolCalls ? { toolCalls } : {})
    }
  }

  /**
   * Safely parses a JSON string; returns an empty object on failure.
   * Used when converting stored tool-call arguments back into objects.
   */
  private parseJsonSafe(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  protected override formatProviderError(error: unknown): string {
    const base = super.formatProviderError(error)
    return `${base}. Verifica: API Key activa en console.anthropic.com, header x-api-key correcto, modelo disponible (${ANTHROPIC_MODELS.SONNET_4} / ${ANTHROPIC_MODELS.OPUS_4} / ${ANTHROPIC_MODELS.HAIKU_4}) y créditos suficientes.`
  }
}
