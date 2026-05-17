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

// ─── Architecture note ────────────────────────────────────────────────────────
//
// Gemini is NOT OpenAI-compatible. Differences at the wire level:
//
//  Auth:       ?key=<API_KEY> query param  OR  x-goog-api-key header
//              (NOT Authorization: Bearer)
//
//  Endpoint:   POST /v1beta/models/{model}:generateContent
//              POST /v1beta/models/{model}:streamGenerateContent?alt=sse
//
//  Messages:   `contents[]` array  — NOT `messages[]`
//              Each element: { role: "user"|"model", parts: Part[] }
//              System prompt → top-level `systemInstruction` field
//              Role names: "user" and "model" (NOT "assistant")
//
//  Parts:      { text: "..." }                     — plain text
//              { inlineData: { mimeType, data } }  — base64 image
//              { fileData: { mimeType, fileUri } }  — GCS/AI Studio file
//              { functionCall: { name, args } }     — model calling a tool
//              { functionResponse: { name, response } } — tool result
//
//  Tools:      { functionDeclarations: [{ name, description, parameters }] }
//              parameters use JSON Schema style with UPPERCASE type names
//
//  Response:   candidates[0].content.parts[0].text
//              usageMetadata.promptTokenCount / candidatesTokenCount
//
//  Streaming:  streamGenerateContent?alt=sse → SSE stream
//              Each data: line is a full GenerateContentResponse JSON

// ─── Official Gemini model IDs (May 2026) ─────────────────────────────────────
//
// Source: https://ai.google.dev/gemini-api/docs/models/gemini
//
// Gemini 2.5 family (generally available, recommended for all new projects)
//   gemini-2.5-pro    Most capable model: complex reasoning, coding, analysis
//   gemini-2.5-flash  Best speed/quality balance; recommended default
//   gemini-2.5-flash-lite  Cost-optimised for high-volume classification/extraction
//
// NOTE: "gemini-3.0-flash" and "gemini-3.0-pro" do NOT exist. They were
// placeholder identifiers added in a prior migration pass. Replaced below.
// "gemini-2.0-flash" is deprecated as of March 2026.

/** Official, verified Google Gemini model IDs. */
const GEMINI_MODELS = {
  /** Most capable Gemini model — advanced reasoning, 1M token context. */
  PRO_25: 'gemini-2.5-pro',
  /** Best speed/quality balance — recommended default for production. */
  FLASH_25: 'gemini-2.5-flash',
  /** Cost-optimised — high-volume extraction and classification. */
  FLASH_25_LITE: 'gemini-2.5-flash-lite'
} as const

/** Base URL for Google AI Studio Gemini REST API. */
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta' as const

// ─── Gemini-native wire types ─────────────────────────────────────────────────

interface GeminiTextPart { text: string }
interface GeminiInlineDataPart { inlineData: { mimeType: string; data: string } }
interface GeminiFileDataPart { fileData: { mimeType: string; fileUri: string } }
interface GeminiFunctionCallPart { functionCall: { name: string; args: Record<string, unknown> } }
interface GeminiFunctionResponsePart {
  functionResponse: { name: string; response: Record<string, unknown> }
}

type GeminiPart =
  | GeminiTextPart
  | GeminiInlineDataPart
  | GeminiFileDataPart
  | GeminiFunctionCallPart
  | GeminiFunctionResponsePart

/** A single turn in a Gemini conversation. */
interface GeminiContent {
  /** "user" or "model" — Gemini does NOT use "assistant" or "system" */
  role: 'user' | 'model'
  parts: GeminiPart[]
}

/** Function declaration shape accepted by Gemini tools. */
interface GeminiFunctionDeclaration {
  name: string
  description?: string
  parameters?: {
    type: 'OBJECT'
    properties?: Record<string, { type: string; description?: string }>
    required?: string[]
  }
}

/** Full Gemini generateContent request body. */
interface GeminiRequestBody {
  contents: GeminiContent[]
  systemInstruction?: { parts: GeminiTextPart[] }
  tools?: Array<{ functionDeclarations: GeminiFunctionDeclaration[] }>
  toolConfig?: { functionCallingConfig: { mode: 'AUTO' | 'NONE' | 'ANY' } }
  generationConfig?: {
    temperature?: number
    maxOutputTokens?: number
    responseMimeType?: 'text/plain' | 'application/json'
    topP?: number
    topK?: number
  }
  safetySettings?: Array<{ category: string; threshold: string }>
}

/** Single candidate in a Gemini response. */
interface GeminiCandidate {
  content: GeminiContent
  finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER' | null
  index: number
}

/** Full Gemini generateContent response. */
interface GeminiResponse {
  candidates: GeminiCandidate[]
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

// ─── Vision helper ────────────────────────────────────────────────────────────

/** Regex matching base64 data URLs: `data:<mime>;base64,<data>` */
const DATA_URL_RE = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i

/**
 * Splits a message content string into Gemini `Part[]` objects.
 *
 * Supports two image conventions:
 *   1. Base64 data URL embedded directly in the content string:
 *      `data:image/png;base64,<base64data>`
 *   2. Image reference marker: `[IMAGE_URL:<https://...>]`
 *
 * Plain text fragments are wrapped in `{ text }` parts.
 * If the entire content is a bare base64 data URL, the result is a single
 * `inlineData` part with no text wrapper.
 */
function buildGeminiParts(raw: string | null): GeminiPart[] {
  if (!raw) return [{ text: '' }]

  const trimmed = raw.trim()

  // Entire message is a base64 data URL
  const b64Match = trimmed.match(DATA_URL_RE)
  if (b64Match) {
    return [{ inlineData: { mimeType: b64Match[1], data: b64Match[2] } }]
  }

  const parts: GeminiPart[] = []
  const imageMarker = /\[IMAGE_URL:(https?:\/\/[^\]]+)\]/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = imageMarker.exec(trimmed)) !== null) {
    const before = trimmed.slice(cursor, match.index).trim()
    if (before) parts.push({ text: before })

    // HTTPS images are referenced as fileData (GCS / public URL)
    parts.push({ fileData: { mimeType: 'image/jpeg', fileUri: match[1] } })
    cursor = match.index + match[0].length
  }

  const after = trimmed.slice(cursor).trim()
  if (after) parts.push({ text: after })

  return parts.length ? parts : [{ text: '' }]
}

// ─── Message adapter ──────────────────────────────────────────────────────────

/**
 * Converts the internal AIChatMessage[] into the Gemini `contents[]` format.
 *
 * Rules:
 *  - `system` messages → extracted as `systemInstruction` (top-level field)
 *  - `user` messages   → role "user"
 *  - `assistant` messages with tool_calls → role "model" + functionCall parts
 *  - `tool` messages (function results) → role "user" + functionResponse parts
 *  - `assistant` text messages → role "model"
 *
 * Gemini requires the conversation to alternate user/model strictly. Adjacent
 * messages of the same role are merged by concatenating their parts.
 */
function buildContents(messages: AIChatMessage[]): {
  contents: GeminiContent[]
  systemInstruction: string | undefined
} {
  const systemParts = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content ?? '')
    .filter(Boolean)
  const systemInstruction = systemParts.length ? systemParts.join('\n\n') : undefined

  const raw: GeminiContent[] = []

  for (const msg of messages) {
    if (msg.role === 'system') continue

    let geminiRole: 'user' | 'model'
    let parts: GeminiPart[]

    if (msg.role === 'tool') {
      // Tool result → user turn with functionResponse part
      geminiRole = 'user'
      parts = [
        {
          functionResponse: {
            name: msg.name ?? 'unknown_function',
            response: safeParseJson(msg.content ?? '{}')
          }
        }
      ]
    } else if (msg.role === 'assistant' && msg.tool_calls?.length) {
      // Assistant asking to call a tool → model turn with functionCall parts
      geminiRole = 'model'
      parts = msg.tool_calls.map((tc) => ({
        functionCall: {
          name: tc.function.name,
          args: safeParseJson(tc.function.arguments)
        }
      }))
    } else {
      geminiRole = msg.role === 'assistant' ? 'model' : 'user'
      parts = buildGeminiParts(msg.content)
    }

    // Merge consecutive turns with same role (Gemini requires strict alternation)
    const last = raw[raw.length - 1]
    if (last && last.role === geminiRole) {
      last.parts.push(...parts)
    } else {
      raw.push({ role: geminiRole, parts })
    }
  }

  // Gemini requires the first turn to be "user"
  const contents = raw.length && raw[0].role === 'model'
    ? [{ role: 'user' as const, parts: [{ text: '(continued)' }] }, ...raw]
    : raw

  return { contents, systemInstruction }
}

// ─── Tool adapter ─────────────────────────────────────────────────────────────

/**
 * Converts the internal OpenAI-style tool definitions into Gemini's
 * `functionDeclarations` format.
 *
 * Internal:  { type: "function", function: { name, description, parameters } }
 * Gemini:    { name, description, parameters: { type: "OBJECT", ... } }
 *
 * JSON Schema type names must be UPPERCASE in Gemini (STRING, NUMBER, etc.).
 */
function adaptTools(tools: any[]): GeminiFunctionDeclaration[] {
  return tools.map((tool) => {
    const fn = tool.function ?? tool
    const params = fn.parameters ?? fn.input_schema

    const declaration: GeminiFunctionDeclaration = { name: fn.name }
    if (fn.description) declaration.description = fn.description

    if (params) {
      declaration.parameters = {
        type: 'OBJECT',
        ...uppercaseJsonSchemaTypes(params)
      }
    }

    return declaration
  })
}

/** Recursively converts JSON Schema type values to Gemini's UPPERCASE format. */
function uppercaseJsonSchemaTypes(schema: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && typeof value === 'string') {
      result[key] = value.toUpperCase()
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = uppercaseJsonSchemaTypes(value)
    } else {
      result[key] = value
    }
  }
  return result
}

// ─── Response adapter ─────────────────────────────────────────────────────────

/**
 * Extracts text content from a Gemini candidate's parts array.
 * Concatenates all `text` parts.
 */
function extractTextFromParts(parts: GeminiPart[]): string {
  return parts
    .filter((p): p is GeminiTextPart => 'text' in p)
    .map((p) => p.text)
    .join('')
}

/**
 * Extracts functionCall parts from a Gemini candidate and translates them into
 * the internal AIToolCall format.
 */
function extractToolCalls(parts: GeminiPart[]): AIToolCall[] | undefined {
  const calls = parts.filter((p): p is GeminiFunctionCallPart => 'functionCall' in p)
  if (!calls.length) return undefined

  return calls.map((p, i) => ({
    id: `gemini-fc-${i}`,
    type: 'function' as const,
    function: {
      name: p.functionCall.name,
      arguments: JSON.stringify(p.functionCall.args)
    }
  }))
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function safeParseJson(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) as Record<string, unknown> }
  catch { return { value: raw } }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * GeminiProvider
 *
 * Implements the Google Gemini REST API (`/v1beta/models/{model}:generateContent`).
 *
 * Supported capabilities:
 *   - Multi-turn conversations via `contents[]`
 *   - System instructions via top-level `systemInstruction`
 *   - Tool / function calling via `functionDeclarations`
 *   - Vision: base64 inline images and HTTPS file URLs
 *   - Native SSE streaming via `streamGenerateContent?alt=sse`
 *   - Token usage from `usageMetadata` (always exact, never estimated)
 *
 * Auth: API key is sent as the `x-goog-api-key` header (preferred over ?key= query
 * param because it avoids the key being logged in server access logs).
 */
export class GeminiProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      id: 'gemini',
      name: 'Google Gemini',
      authType: 'api-key',
      defaultBaseUrl: GEMINI_BASE_URL,
      defaultModel: GEMINI_MODELS.FLASH_25,
      availableModels: [
        GEMINI_MODELS.FLASH_25,
        GEMINI_MODELS.PRO_25,
        GEMINI_MODELS.FLASH_25_LITE
      ],
      description:
        'Gemini 2.5 Flash/Pro/Lite con API Key de Google AI Studio. Soporta visión, tools y streaming nativo.',
      requiresApiKey: true,
      oauthPrepared: true,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true
    })
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  override validateConfig(config: AIProviderRuntimeConfig): { ok: boolean; message: string } {
    const base = super.validateConfig(config)
    if (!base.ok) return base

    if (config.baseUrl?.includes('console.cloud.google.com')) {
      return {
        ok: false,
        message:
          'La URL de Google Cloud Console no es el endpoint de la API. Usa https://generativelanguage.googleapis.com/v1beta.'
      }
    }

    return { ok: true, message: 'Configuración Gemini válida.' }
  }

  // ─── Chat (non-streaming) ─────────────────────────────────────────────────

  override async chat(
    config: AIProviderRuntimeConfig,
    request: AIChatRequest
  ): Promise<AIChatResult> {
    const body = this.buildRequestBody(config, request)
    const url = this.generateContentUrl(config)

    const response = await axios
      .post<GeminiResponse>(url, body, {
        timeout: 300_000,
        headers: this.geminiHeaders(config)
      })
      .catch((error: unknown) => {
        throw new Error(this.formatProviderError(error), { cause: error })
      })

    return this.adaptResponse(response.data, request)
  }

  // ─── Streaming (SSE) ────────────────────────────────────────────────────────

  /**
   * Streams tokens using `streamGenerateContent?alt=sse`.
   *
   * Gemini SSE format — each `data:` line is a full `GenerateContentResponse`:
   * ```
   * data: {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"},...}]}
   * ```
   *
   * We yield the `text` content of each chunk as it arrives.
   */
  async *streamChat(
    config: AIProviderRuntimeConfig,
    request: AIChatRequest
  ): AsyncIterable<string> {
    const body = this.buildRequestBody(config, request)
    const url = this.streamGenerateContentUrl(config)

    const response = await axios
      .post(url, body, {
        timeout: 300_000,
        responseType: 'stream',
        headers: this.geminiHeaders(config)
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
        if (!rawData || rawData === '[DONE]') continue

        try {
          const parsed = JSON.parse(rawData) as GeminiResponse
          const parts = parsed.candidates?.[0]?.content?.parts ?? []
          const text = extractTextFromParts(parts)
          if (text) yield text
        } catch {
          // Malformed SSE line — skip silently
        }
      }
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Builds the complete Gemini generateContent request body.
   */
  private buildRequestBody(
    config: AIProviderRuntimeConfig,
    request: AIChatRequest
  ): GeminiRequestBody {
    const { contents, systemInstruction } = buildContents(request.messages)
    const tools = request.tools?.length ? adaptTools(request.tools) : undefined

    const body: GeminiRequestBody = {
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        ...(request.responseFormat === 'json'
          ? { responseMimeType: 'application/json' }
          : {})
      }
    }

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] }
    }

    if (tools?.length) {
      body.tools = [{ functionDeclarations: tools }]
      body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }
    }

    return body
  }

  /**
   * Builds the Gemini headers.
   * Uses `x-goog-api-key` header (preferred — avoids key exposure in access logs).
   */
  private geminiHeaders(config: AIProviderRuntimeConfig): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey ?? ''
    }
  }

  /**
   * URL for the non-streaming endpoint:
   * `/v1beta/models/{model}:generateContent`
   */
  private generateContentUrl(config: AIProviderRuntimeConfig): string {
    const base = this.resolveBaseUrl(config)
    return `${base}/models/${encodeURIComponent(config.model)}:generateContent`
  }

  /**
   * URL for the streaming endpoint:
   * `/v1beta/models/{model}:streamGenerateContent?alt=sse`
   *
   * The `?alt=sse` parameter is required; without it the API returns a JSON
   * array instead of a proper SSE stream.
   */
  private streamGenerateContentUrl(config: AIProviderRuntimeConfig): string {
    const base = this.resolveBaseUrl(config)
    return `${base}/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`
  }

  /**
   * Converts a GeminiResponse to the internal AIChatResult shape.
   */
  private adaptResponse(data: GeminiResponse, request: AIChatRequest): AIChatResult {
    const candidate = data.candidates?.[0]
    const parts = candidate?.content?.parts ?? []

    const text = extractTextFromParts(parts)
    const content = text || null
    const toolCalls = extractToolCalls(parts)

    const isAnalysis =
      request.responseFormat === 'json' && content != null && !toolCalls
    const analysis = isAnalysis ? normalizeAIResponse(content) : undefined

    return {
      content,
      analysis,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? null,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
        totalTokens: data.usageMetadata?.totalTokenCount ?? null,
        remainingTokens: null,
        estimatedCostUsd: null,
        isEstimate: data.usageMetadata == null
      },
      ...(toolCalls ? { toolCalls } : {})
    }
  }

  protected override formatProviderError(error: unknown): string {
    const base = super.formatProviderError(error)
    return `${base}. Verifica: API Key activa en aistudio.google.com, modelo disponible (${Object.values(GEMINI_MODELS).join(' | ')}), cuota de uso y proyecto activo.`
  }
}
