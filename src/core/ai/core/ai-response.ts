import type { AIAnalysisResponse } from '@shared/types/workspace'
import { aiResponseSchema } from '@shared/schemas/api'

/** Extrae y valida JSON de una respuesta IA, con fallback seguro a texto no estructurado. */
export function normalizeAIResponse(rawContent: string): AIAnalysisResponse {
  const jsonText = extractJson(rawContent)

  try {
    return aiResponseSchema.parse(JSON.parse(jsonText))
  } catch {
    return {
      summary: rawContent || 'El proveedor no devolvio una respuesta estructurada.',
      problems: [],
      recommendations: ['Reintentar el analisis o ajustar el prompt del proveedor.'],
      tasks: [],
      riskLevel: 'medium'
    }
  }
}

/** Extrae contadores de uso desde respuestas heterogeneas de proveedores IA. */
export function extractUsageFromUnknown(value: unknown) {
  if (!value || typeof value !== 'object') {
    return { inputTokens: null, outputTokens: null, totalTokens: null, remainingTokens: null, estimatedCostUsd: null, isEstimate: true }
  }

  const usage = asRecord(getPath(value, ['usage']) ?? getPath(value, ['meta', 'tokens'])) ?? {}
  const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens ?? getPath(value, ['prompt_eval_count']) ?? null
  const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens ?? getPath(value, ['eval_count']) ?? null
  const totalTokens = usage.total_tokens ?? usage.totalTokens ?? sumNullable(inputTokens, outputTokens)

  return {
    inputTokens: numberOrNull(inputTokens),
    outputTokens: numberOrNull(outputTokens),
    totalTokens: numberOrNull(totalTokens),
    remainingTokens: null,
    estimatedCostUsd: null,
    isEstimate: totalTokens == null
  }
}

/** Recupera el primer bloque JSON aunque venga dentro de fences markdown. */
function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const firstBrace = content.indexOf('{')
  const lastBrace = content.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) return content.slice(firstBrace, lastBrace + 1)

  return content
}

/** Convierte valores desconocidos a numero finito o null. */
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Suma dos valores opcionales preservando null cuando no hay datos. */
function sumNullable(a: unknown, b: unknown): number | null {
  const left = numberOrNull(a)
  const right = numberOrNull(b)
  if (left == null && right == null) return null
  return (left ?? 0) + (right ?? 0)
}

/** Lee una ruta anidada de forma segura sobre objetos/arrays desconocidos. */
function getPath(value: unknown, path: Array<string | number>): unknown {
  let current = value

  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined
      current = current[segment]
      continue
    }

    const record = asRecord(current)
    if (!record) return undefined
    current = record[segment]
  }

  return current
}

/** Type guard para tratar unknown como diccionario indexable. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
