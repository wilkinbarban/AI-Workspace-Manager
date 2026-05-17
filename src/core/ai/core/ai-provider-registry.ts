import type { AIProviderAdapter } from './ai-provider.interface'
import type { AIProviderManifest, AIProviderType } from '@shared/types/workspace'
import { AnthropicProvider } from '@core/ai/providers/anthropic.provider'
import { DeepSeekAdapterProvider } from '@core/ai/providers/deepseek-adapter.provider'
import { GeminiProvider } from '@core/ai/providers/gemini.provider'
import { OpenAIProvider } from '@core/ai/providers/openai.provider'
import { OpenRouterProvider } from '@core/ai/providers/openrouter.provider'

export class AIProviderRegistry {
  private readonly providers = new Map<AIProviderType, AIProviderAdapter>()

  constructor() {
    this.register(new OpenAIProvider())
    this.register(new AnthropicProvider())
    this.register(new DeepSeekAdapterProvider())
    this.register(new GeminiProvider())
    this.register(new OpenRouterProvider())
  }

  get(type: AIProviderType): AIProviderAdapter {
    const provider = this.providers.get(type)
    if (!provider) throw new Error(`Proveedor IA no registrado: ${type}`)
    return provider
  }

  list(): AIProviderAdapter[] {
    return [...this.providers.values()]
  }

  manifests(): AIProviderManifest[] {
    return this.list().map((provider) => provider.manifest())
  }

  private register(provider: AIProviderAdapter): void {
    this.providers.set(provider.id, provider)
  }
}

export const aiProviderRegistry = new AIProviderRegistry()
