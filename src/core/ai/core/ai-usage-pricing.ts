import type { AIProviderType } from '@shared/types/workspace'

/** Tarifas aproximadas por 1K tokens usadas cuando el proveedor no devuelve costo. */
const PRICE_PER_1K_USD: Partial<Record<AIProviderType, { input: number; output: number }>> = {
  openai: { input: 0.00015, output: 0.0006 },
  deepseek: { input: 0.00014, output: 0.00028 },
  anthropic: { input: 0.003, output: 0.015 },
  gemini: { input: 0.00035, output: 0.00105 },
  openrouter: { input: 0.001, output: 0.003 }
}

/** Estima costo USD con precios locales y devuelve null cuando faltan tokens o tarifa. */
export function estimateCostUsd(input: {
  providerType: AIProviderType
  inputTokens: number | null
  outputTokens: number | null
}): number | null {
  const price = PRICE_PER_1K_USD[input.providerType]
  if (!price || (input.inputTokens == null && input.outputTokens == null)) return null

  const cost = ((input.inputTokens ?? 0) / 1000) * price.input + ((input.outputTokens ?? 0) / 1000) * price.output
  return Number(cost.toFixed(6))
}
