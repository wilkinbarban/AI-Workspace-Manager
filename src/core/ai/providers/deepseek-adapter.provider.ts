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
// DeepSeek es mayormente compatible con OpenAI, pero tiene diferencias clave:
//
//  - Mismo endpoint:    POST /chat/completions
//  - Misma auth:        Authorization: Bearer <apiKey>
//  - Mismo formato SSE: stream: true -> data: {...} / data: [DONE]
//  - Mismo formato de tools: tools[] con definiciones function.
//
//  - Diferente: campo `reasoning_content` en mensajes assistant.
//  - Diferente: parametros thinking no respetan temperature/top_p.
//  - Diferente: platform.deepseek.com es consola; api.deepseek.com es API.
//
// Como el wire format es compatible, este provider extiende OpenAICompatibleProvider
// y sobrescribe solo streaming, reasoning_content y errores especificos de DeepSeek.

// IDs oficiales de modelos DeepSeek
//
// Fuente: https://api-docs.deepseek.com/api/list-models
//
// deepseek-v4-flash   Alta eficiencia, baja latencia y bajo costo.
//                     Soporta modo thinking/razonamiento.
//                     Reemplaza aliases legacy deepseek-chat/deepseek-reasoner.
//
// deepseek-v4-pro     Mayor capacidad para razonamiento, codigo y agentes.

/** IDs oficiales y verificados de modelos DeepSeek. */
const DEEPSEEK_MODELS = {
  /** Modelo eficiente con soporte de thinking mode. */
  FLASH: 'deepseek-v4-flash',
  /** Modelo de mayor capacidad para agentes y razonamiento complejo. */
  PRO: 'deepseek-v4-pro'
} as const

/** URL base de la API DeepSeek; distinta de la consola web platform.deepseek.com. */
const DEEPSEEK_API_BASE = 'https://api.deepseek.com' as const

// Tipos especificos de respuesta DeepSeek

/**
 * DeepSeek extiende el mensaje choice estandar de OpenAI con `reasoning_content`,
 * usado para transportar razonamiento cuando thinking mode esta activo.
 */
interface DeepSeekMessage {
  role: 'assistant'
  content: string | null
  /** Razonamiento interno; solo aparece cuando thinking mode esta activo. */
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
      /** Tokens de razonamiento emitidos en streaming. */
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

// Provider

/**
 * Proveedor DeepSeek.
 *
 * Implementa DeepSeek Chat Completions via `POST /chat/completions`.
 * El wire format es compatible con OpenAI y agrega extensiones propias.
 *
 * Capacidades:
 *   - Generacion de texto.
 *   - Streaming SSE.
 *   - Tool/function calling.
 *   - Thinking mode.
 *   - Paso de `reasoning_content` en conversaciones multi-turn.
 *
 * Autenticacion: `Authorization: Bearer <apiKey>` desde el provider base.
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

  // Validacion

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

  // Chat sin streaming

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

  // Streaming SSE

  /**
   * Transmite tokens desde `/chat/completions` con formato SSE de DeepSeek.
   *
   * El SSE es igual al streaming de OpenAI Chat Completions:
   *   data: {"choices":[{"delta":{"content":"..."},...}]}
   *   data: [DONE]
   *
   * Cuando thinking mode produce tokens de razonamiento, llegan en
   * `delta.reasoning_content`. Aqui se emiten solo tokens de respuesta final.
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

          // Emite tokens de respuesta final, no tokens de razonamiento.
          const text = delta?.content
          if (typeof text === 'string' && text) yield text
        } catch {
          // Linea SSE malformada: se ignora sin interrumpir el stream.
        }
      }
    }
  }

  // Helpers privados

  /**
   * Construye el body de DeepSeek Chat Completions.
   *
   * Notas para thinking mode:
   *  - Se habilita con `extra_body.thinking.type = "enabled"` en futuras capas.
   *  - Cuando esta activo, temperature/top_p/frequency_penalty/presence_penalty
   *    no tienen efecto y conviene omitirlos.
   *
   * En conversaciones multi-turn con tools, `reasoning_content` del assistant
   * debe reenviarse en `messages` mediante `msg.reasoning_content`.
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
          // Conserva reasoning_content para continuaciones multi-turn con tools.
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
   * Mapea una respuesta DeepSeek a AIChatResult y conserva `reasoning_content`.
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
