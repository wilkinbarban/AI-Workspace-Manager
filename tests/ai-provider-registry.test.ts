import { describe, expect, it, vi } from 'vitest'
import { aiProviderRegistry } from '@core/ai/core/ai-provider-registry'
import { chooseProviderId } from '@core/ai/core/ai-router'
import { estimateCostUsd } from '@core/ai/core/ai-usage-pricing'
import { OpenAIProvider } from '@core/ai/providers/openai.provider'

describe('AI provider registry', () => {
  it('loads all supported providers', () => {
    const manifests = aiProviderRegistry.manifests()

    expect(manifests.map((manifest) => manifest.type)).toEqual(
      expect.arrayContaining([
        'openai',
        'anthropic',
        'deepseek',
        'gemini',
        'openrouter'
      ])
    )
  })

  it('validates API-key configuration', () => {
    const openai = new OpenAIProvider()

    expect(
      openai.validateConfig({
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        authType: 'bearer',
        apiKey: null,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-5.4-flash'
      }).ok
    ).toBe(false)
  })
})

describe('AI provider routing', () => {
  it('selects requested, task default, then global default provider', () => {
    const providers = [
      { id: 'openai-id', enabled: true, isDefault: true, taskDefaults: {} },
      { id: 'claude-id', enabled: true, isDefault: false, taskDefaults: { documentation: true } }
    ]

    expect(chooseProviderId({ requestedProviderId: 'manual-id', taskType: 'analysis', providers })).toBe('manual-id')
    expect(chooseProviderId({ taskType: 'documentation', providers })).toBe('claude-id')
    expect(chooseProviderId({ taskType: 'analysis', providers })).toBe('openai-id')
  })
})

describe('AI usage tracking helpers', () => {
  it('estimates token cost without inventing unavailable totals', () => {
    expect(estimateCostUsd({ providerType: 'deepseek', inputTokens: 1000, outputTokens: 500 })).toBeGreaterThan(0)
    expect(estimateCostUsd({ providerType: 'openai', inputTokens: null, outputTokens: null })).toBeNull()
  })

  it('supports simulated connection checks via provider adapter', async () => {
    const provider = new OpenAIProvider()
    const spy = vi.spyOn(provider, 'chat').mockResolvedValue({
      content: '{"summary":"ok","problems":[],"recommendations":[],"tasks":[],"riskLevel":"low"}',
      analysis: { summary: 'ok', problems: [], recommendations: [], tasks: [], riskLevel: 'low' },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, remainingTokens: null, estimatedCostUsd: null, isEstimate: false }
    })

    const result = await provider.testConnection({
      id: 'openai',
      name: 'OpenAI',
      type: 'openai',
      authType: 'bearer',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini'
    })

    expect(result.ok).toBe(true)
    expect(spy).toHaveBeenCalledOnce()
  })
})
