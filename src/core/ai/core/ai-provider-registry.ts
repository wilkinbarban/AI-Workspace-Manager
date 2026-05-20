import type { AIProviderAdapter } from './ai-provider.interface'
import type { AIProviderManifest, AIProviderType } from '@shared/types/workspace'
import { AnthropicProvider } from '@core/ai/providers/anthropic.provider'
import { DeepSeekAdapterProvider } from '@core/ai/providers/deepseek-adapter.provider'
import { GeminiProvider } from '@core/ai/providers/gemini.provider'
import { OpenAIProvider } from '@core/ai/providers/openai.provider'
import { OpenRouterProvider } from '@core/ai/providers/openrouter.provider'

/** Registro central de adaptadores IA disponibles en la aplicacion. */
export class AIProviderRegistry {
  /** Mapa por tipo de proveedor para resolver adaptadores en O(1). */
  private readonly providers = new Map<AIProviderType, AIProviderAdapter>()

  constructor() {
    this.register(new OpenAIProvider())
    this.register(new AnthropicProvider())
    this.register(new DeepSeekAdapterProvider())
    this.register(new GeminiProvider())
    this.register(new OpenRouterProvider())
  }

  /** Obtiene un adaptador registrado o falla con error tecnico claro. */
  get(type: AIProviderType): AIProviderAdapter {
    const provider = this.providers.get(type)
    if (!provider) throw new Error(`Proveedor IA no registrado: ${type}`)
    return provider
  }

  /** Devuelve todos los adaptadores instanciados para introspeccion o pruebas. */
  list(): AIProviderAdapter[] {
    return [...this.providers.values()]
  }

  /** Devuelve manifests serializables para poblar la UI de configuracion. */
  manifests(): AIProviderManifest[] {
    return this.list().map((provider) => provider.manifest())
  }

  /** Registra un adaptador concreto durante la construccion del registry. */
  private register(provider: AIProviderAdapter): void {
    this.providers.set(provider.id, provider)
  }
}

/** Instancia compartida por servicios y tests; evita recrear providers por llamada. */
export const aiProviderRegistry = new AIProviderRegistry()
