import axios from 'axios'
import type {
  AIChatMessage,
  AIChatRequest,
  AIChatResult,
  AIToolCall,
  AIToolDefinition,
  AIProviderRuntimeConfig
} from '@core/ai/core/ai-provider.interface'
import { OpenAICompatibleProvider } from './base.provider'
import { normalizeAIResponse } from '@core/ai/core/ai-response'

// Tipos nativos de mensajes y contenido Anthropic

/** Bloque de texto devuelto dentro del arreglo content de Anthropic. */
interface AnthropicTextBlock {
  type: 'text'
  text: string
}

/** Bloque de llamada a herramienta devuelto por Anthropic. */
interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock

/** Forma de una respuesta individual de Anthropic /messages. */
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

/** Definicion de herramienta aceptada por la API de Anthropic. */
interface AnthropicTool {
  name: string
  description?: string
  input_schema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

/** Formato de mensaje Anthropic sin rol system. */
interface AnthropicMessage {
  role: 'user' | 'assistant'
  /** Puede ser texto plano o bloques tipados de contenido, incluyendo vision. */
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
        | { type: 'tool_result'; tool_use_id: string; content: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
      >
}

// IDs oficiales de modelos Anthropic (mayo 2026)

/**
 * Identificadores oficiales y versionados de Anthropic.
 * Usar IDs fijados evita cambios inesperados cuando Anthropic mueve alias.
 */
const ANTHROPIC_MODELS = {
  /** Modelo mas capaz para razonamiento complejo y coding agentico avanzado. */
  OPUS_4: 'claude-opus-4-7',
  /** Balance de velocidad e inteligencia para la mayoria de casos productivos. */
  SONNET_4: 'claude-sonnet-4-6',
  /** Modelo mas rapido para alto volumen y baja latencia. */
  HAIKU_4: 'claude-haiku-4-5'
} as const

/** Valor obligatorio del header `anthropic-version`. */
const ANTHROPIC_VERSION = '2023-06-01' as const

/** Maximo de tokens de salida por defecto por request. */
const DEFAULT_MAX_TOKENS = 8192

/**
 * Proveedor Anthropic.
 *
 * Implementa nativamente Anthropic Messages API. No delega el metodo `chat()`
 * al provider OpenAI-compatible porque el protocolo difiere en:
 *  - Header de autenticacion `x-api-key`.
 *  - Header obligatorio `anthropic-version`.
 *  - `system` como campo top-level, no como rol.
 *  - Herramientas con `input_schema`.
 *  - Resultados de herramientas como bloques `tool_result`.
 *  - Respuesta como bloques `text` y `tool_use`.
 *  - Streaming mediante eventos SSE `text-delta`.
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

  // Validacion

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

  // Chat sin streaming

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

  // Streaming SSE

  /**
   * Implementa `streamChat` sobre el protocolo Server-Sent Events de Anthropic.
 *
   * Secuencia de eventos segun documentacion:
   *   message_start -> content_block_start -> content_block_delta* -> content_block_stop -> message_delta -> message_stop
 *
   * Se emiten strings `text_delta` para mostrar tokens progresivamente.
   * Los bloques tool-use se ensamblan y se resuelven al cierre del mensaje.
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

          // Anthropic SSE: content_block_delta transporta un delta de tipo text_delta.
          if (event.type === 'content_block_delta' && delta?.type === 'text_delta') {
            const text = delta.text as string
            if (text) yield text
          }
        } catch {
          // Linea SSE malformada: se ignora sin interrumpir el stream.
        }
      }
    }
  }

  // Helpers privados

  /**
   * Construye headers obligatorios para cada request Anthropic.
   * Anthropic usa `x-api-key` en vez de `Authorization: Bearer`.
   */
  private anthropicHeaders(config: AIProviderRuntimeConfig): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      'x-api-key': config.apiKey ?? ''
    }
  }

  /**
   * Divide la lista interna de mensajes en:
   *  - `system`: texto concatenado de mensajes system.
   *  - `messages`: mensajes restantes en formato Anthropic.
 *
   * Los resultados de herramientas se transforman en bloques `tool_result`
   * dentro de un mensaje user.
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
        // Los resultados de herramientas deben envolverse en un mensaje user con tool_result.
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
        // Las tool calls del assistant se convierten en bloques tool_use.
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
   * Traduce definiciones internas de herramientas estilo OpenAI al formato
   * `input_schema` requerido por Anthropic.
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
  private adaptTools(tools: AIToolDefinition[]): AnthropicTool[] {
    return tools.map((tool) => {
      const fn = tool.function
      return {
        name: fn.name,
        ...(fn.description ? { description: fn.description } : {}),
        input_schema: {
          type: 'object',
          ...fn.parameters
        }
      }
    })
  }

  /**
   * Convierte una respuesta Anthropic /messages al AIChatResult interno.
 *
   * Los bloques `text` se concatenan; los `tool_use` se traducen a AIToolCall.
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
   * Parsea JSON de forma segura y devuelve objeto vacio si falla.
   * Se usa al convertir argumentos de tool calls de string a objeto.
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
