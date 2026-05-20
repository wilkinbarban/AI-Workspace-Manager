import axios from 'axios'
import type {
  AIChatRequest,
  AIChatResult,
  AIToolCall,
  AIProviderRuntimeConfig
} from '@core/ai/core/ai-provider.interface'
import { OpenAICompatibleProvider } from './base.provider'
import { normalizeAIResponse } from '@core/ai/core/ai-response'

// Nota de arquitectura
//
// OpenAI expone dos superficies principales de API:
//
//   1. Chat Completions  POST /v1/chat/completions   (estable y ampliamente soportada)
//   2. Responses API     POST /v1/responses          (superficie agentica nueva, marzo 2025)
//
// Responses API esta optimizada para bucles agenticos multi-paso con estado en
// servidor. Este proyecto mantiene arquitectura sin estado del lado cliente:
// el historial completo viaja en cada request. Ese caso encaja mejor con Chat
// Completions y evita reescribir AIProviderAdapter y todos los adaptadores.
//
// Decision: usar Chat Completions para modelos productivos. Responses API queda
// como migracion futura si el agente pasa a tener estado en servidor.
//
// Referencia: https://platform.openai.com/docs/api-reference/chat

// IDs oficiales de modelos OpenAI (mayo 2025, activos)
//
// Fuente: https://platform.openai.com/docs/models
//
// Familia GPT-4.1: lanzada el 14 de abril de 2025.
//   gpt-4.1            Modelo principal: razonamiento, codigo y contexto 1M.
//   gpt-4.1-mini       Balance entre velocidad y costo para produccion.
//   gpt-4.1-nano       Opcion mas rapida y economica para extraccion/clasificacion.
//
// Familia GPT-4o: multimodal con vision.
//   gpt-4o             Mejor rendimiento multimodal texto + vision.
//   gpt-4o-mini        Multimodal eficiente en costo.
//
// Razonamiento (serie o)
//   o3                 Modelo de razonamiento mas potente.
//   o4-mini            Razonamiento compacto de alto rendimiento con vision.
//
// NOTA: "gpt-5.4-pro", "gpt-5.4-flash" y "gpt-5.3-codex" no existen en la API.
// Fueron placeholders de una migracion previa y aqui se reemplazan por IDs reales.

/** IDs oficiales y verificados de modelos OpenAI. */
const OPENAI_MODELS = {
  /** GPT-4.1 principal: razonamiento complejo, contexto 1M y vision. */
  GPT_4_1: 'gpt-4.1',
  /** GPT-4.1 intermedio: balance productivo entre velocidad y calidad. */
  GPT_4_1_MINI: 'gpt-4.1-mini',
  /** GPT-4.1 mas rapido: clasificacion y extraccion de alto volumen. */
  GPT_4_1_NANO: 'gpt-4.1-nano',
  /** Modelo multimodal fuerte para entradas de texto e imagen. */
  GPT_4O: 'gpt-4o',
  /** Modelo de razonamiento avanzado para logica, matematica y ciencia. */
  O3: 'o3',
  /** Razonamiento compacto con vision, herramientas y baja latencia. */
  O4_MINI: 'o4-mini'
} as const

/** Los modelos de razonamiento usan `max_completion_tokens` en vez de `max_tokens`. */
const REASONING_MODELS: ReadonlySet<string> = new Set([
  OPENAI_MODELS.O3,
  OPENAI_MODELS.O4_MINI
])

/** Maximo de tokens de salida por defecto para modelos estandar. */
const DEFAULT_MAX_TOKENS = 8192

// Tipos nativos del protocolo OpenAI

/** Objeto choice individual dentro de una respuesta Chat Completions. */
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
    /** Solo aparece en modelos de razonamiento cuando `include` lo solicita. */
    reasoning?: string
  }
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null
}

/** Cuerpo completo de respuesta de la API Chat Completions. */
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

/** Fragmento delta individual devuelto por SSE durante streaming. */
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

// Helpers de vision

/** Detecta si un string representa una imagen por data URL o URL publica. */
function isImageUrl(text: string): boolean {
  return (
    text.startsWith('data:image/') ||
    /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(text)
  )
}

/**
 * Construye contenido multimodal cuando el mensaje trae una referencia
 * embebida con el formato `[IMAGE:<url>]<texto restante>`.
 *
 * Si el mensaje es texto plano, devuelve el string sin costo extra.
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
 * Proveedor OpenAI.
 *
 * Implementa la API OpenAI Chat Completions (`POST /v1/chat/completions`).
 *
 * Capacidades soportadas:
 *   - Generacion estandar de texto.
 *   - Streaming via SSE (`stream: true`).
 *   - Tool/function calling.
 *   - Entradas multimodales/vision.
 *   - Modelos de razonamiento con `max_completion_tokens`.
 *
 * Autenticacion: `Authorization: Bearer <apiKey>` en headers del provider base.
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

  // Validacion

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

  // Chat sin streaming

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

  // Streaming SSE

  /**
   * Transmite tokens desde `/v1/chat/completions` usando `stream: true`.
   *
   * Formato SSE de Chat Completions:
   *   data: {"id":"...","choices":[{"delta":{"content":"Hello"},...}]}
   *   data: [DONE]
   *
   * Emite cada token textual al llegar. Los tool calls ensamblados no se emiten
   * incrementalmente; para herramientas el caller debe usar `chat()`.
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
          // Linea SSE malformada: se ignora para no cortar el stream.
        }
      }
    }
  }

  // Helpers privados

  /**
   * Construye el body de Chat Completions.
 *
   * Diferencias clave para modelos de razonamiento:
   *   - `max_tokens` pasa a `max_completion_tokens`.
   *   - `temperature` no se envia.
   *   - `response_format: json_object` no se envia.
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
   * Convierte AIChatMessage[] interno al formato OpenAI Chat Completions.
 *
   * Vision: el contenido se expande a bloques tipados si contiene `[IMAGE:<url>]`.
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
   * Mapea la respuesta OpenAI a AIChatResult interno y usa tokens exactos de `usage`.
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
