import type { AIAnalysisResponse } from '@shared/types/workspace'
import { aiResponseSchema } from '@shared/schemas/api'

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

export function extractTextFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''

  const data = value as Record<string, any>
  const openAIContent = data.choices?.[0]?.message?.content
  if (typeof openAIContent === 'string') return openAIContent

  const anthropicContent = data.content?.[0]?.text
  if (typeof anthropicContent === 'string') return anthropicContent

  const geminiContent = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof geminiContent === 'string') return geminiContent

  const ollamaContent = data.message?.content
  if (typeof ollamaContent === 'string') return ollamaContent

  const cohereContent = data.message?.content?.[0]?.text
  if (typeof cohereContent === 'string') return cohereContent

  return ''
}

export function extractUsageFromUnknown(value: unknown) {
  if (!value || typeof value !== 'object') {
    return { inputTokens: null, outputTokens: null, totalTokens: null, remainingTokens: null, estimatedCostUsd: null, isEstimate: true }
  }

  const data = value as Record<string, any>
  const usage = data.usage ?? data.meta?.tokens ?? {}
  const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens ?? data.prompt_eval_count ?? null
  const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens ?? data.eval_count ?? null
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

function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const firstBrace = content.indexOf('{')
  const lastBrace = content.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) return content.slice(firstBrace, lastBrace + 1)

  return content
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function sumNullable(a: unknown, b: unknown): number | null {
  const left = numberOrNull(a)
  const right = numberOrNull(b)
  if (left == null && right == null) return null
  return (left ?? 0) + (right ?? 0)
}
