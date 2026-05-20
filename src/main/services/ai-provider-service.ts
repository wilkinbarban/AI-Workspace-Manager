import { prisma, stringifyJson } from '@database/client'
import { toAIProviderDto } from '@database/mappers'
import { maskSecret, envKeyForProvider } from '@core/ai/core/ai-auth.service'
import { aiProviderRegistry } from '@core/ai/core/ai-provider-registry'
import type { AIAuthType, AIProviderDto, AIProviderManifest, AIProviderType, AITaskType } from '@shared/types/workspace'
import { SecretStore } from '@main/security/secret-store'
import { randomUUID } from 'node:crypto'

/** Convencion de cuenta usada por keytar para aislar secretos por proveedor. */
const providerSecretAccount = (providerId: string): string => `ai-provider:${providerId}`

/** Gestiona manifests, configuracion persistida y secretos de proveedores IA. */
export class AIProviderService {
  /** Almacen seguro del sistema para API keys; evita guardar secretos en SQLite. */
  private readonly secrets = new SecretStore()

  /** Lista capacidades declaradas por todos los adaptadores IA registrados. */
  listManifests(): AIProviderManifest[] {
    return aiProviderRegistry.manifests()
  }

  /** Lista proveedores configurados por el usuario, ordenados por prioridad operativa. */
  async list(): Promise<AIProviderDto[]> {
    const providers = await prisma.aIProvider.findMany({
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }]
    })

    return providers.map(toAIProviderDto)
  }

  /** Crea o actualiza un proveedor IA y sincroniza su API key con el almacen seguro. */
  async save(input: {
    id?: string
    name: string
    type: AIProviderType
    authType?: AIAuthType
    baseUrl?: string
    model: string
    apiKey?: string
    monthlyTokenLimit?: number | null
    taskDefaults?: Partial<Record<AITaskType, boolean>>
    isDefault?: boolean
    enabled?: boolean
  }): Promise<AIProviderDto> {
    const manifest = aiProviderRegistry.get(input.type).manifest()
    const shouldBeDefault = input.isDefault ?? (await prisma.aIProvider.count()) === 0
    const providerId = input.id ?? randomUUID()
    const secret = input.apiKey?.trim()

    const data = {
      name: input.name,
      type: input.type,
      authType: input.authType ?? manifest.authType,
      baseUrl: input.baseUrl || manifest.defaultBaseUrl,
      model: input.model || manifest.defaultModel,
      enabled: input.enabled ?? true,
      isDefault: shouldBeDefault,
      monthlyTokenLimit: input.monthlyTokenLimit ?? null,
      taskDefaultsJson: input.taskDefaults ? stringifyJson(input.taskDefaults) : null,
      metadataJson: stringifyJson({
        oauthPrepared: manifest.oauthPrepared,
        status: manifest.status,
        supportsLocal: manifest.supportsLocal
      }),
      ...(input.apiKey?.trim() ? { maskedSecret: maskSecret(input.apiKey) } : {})
    }

    if (secret) {
      await this.secrets.setSecret(providerSecretAccount(providerId), secret)
    }

    if (shouldBeDefault) {
      await prisma.aIProvider.updateMany({ data: { isDefault: false } })
    }

    const provider = input.id
      ? await prisma.aIProvider.update({
          where: { id: providerId },
          data
        })
      : await prisma.aIProvider.create({ data: { id: providerId, ...data } })

    return toAIProviderDto(provider)
  }

  /** Indica si la app puede operar con IA y cual proveedor debe usarse por defecto. */
  async getSetupState(): Promise<{ hasConfiguredProvider: boolean; defaultProviderId: string | null }> {
    const providers = await this.list()
    const defaultProvider = providers.find((provider) => provider.isDefault) ?? null

    return {
      hasConfiguredProvider: providers.some((provider) => provider.enabled),
      defaultProviderId: defaultProvider?.id ?? null
    }
  }

  /** Recupera un proveedor persistido o uno virtual basado en variables de entorno. */
  async getProvider(providerId: string): Promise<AIProviderDto | null> {
    if (providerId.startsWith('env:')) {
      return this.getEnvProvider(providerId.replace('env:', '') as AIProviderType)
    }

    const provider = await prisma.aIProvider.findUnique({ where: { id: providerId } })
    return provider ? toAIProviderDto(provider) : null
  }

  /** Resuelve el proveedor activo segun seleccion explicita, default o fallback .env. */
  async getActiveProvider(providerId?: string): Promise<AIProviderDto | null> {
    if (providerId) {
      return this.getProvider(providerId)
    }

    const provider = await prisma.aIProvider.findFirst({
      where: { enabled: true, isDefault: true },
      orderBy: { updatedAt: 'desc' }
    })

    if (provider) return toAIProviderDto(provider)

    const fallback = await prisma.aIProvider.findFirst({
      where: { enabled: true },
      orderBy: { updatedAt: 'desc' }
    })

    if (fallback) return toAIProviderDto(fallback)

    return this.getEnvProvider('deepseek')
  }

  /** Obtiene el secreto real desde keytar o desde .env para proveedores virtuales. */
  async getApiKey(provider: AIProviderDto): Promise<string | null> {
    if (provider.id.startsWith('env:')) {
      return process.env[envKeyForProvider(provider.type)] ?? null
    }

    return this.secrets.getSecret(providerSecretAccount(provider.id))
  }

  /** Valida una configuracion aun no guardada probando el adaptador correspondiente. */
  testConfig(input: {
    name: string
    type: AIProviderType
    authType?: AIAuthType
    baseUrl?: string
    model: string
    apiKey?: string
  }): Promise<{ ok: boolean; message: string }> {
    const adapter = aiProviderRegistry.get(input.type)
    const manifest = adapter.manifest()
    const runtimeConfig = {
      id: 'draft',
      name: input.name || manifest.name,
      type: manifest.type,
      authType: input.authType ?? manifest.authType,
      apiKey: input.apiKey?.trim() || null,
      baseUrl: input.baseUrl || manifest.defaultBaseUrl,
      model: input.model || manifest.defaultModel
    }
    const validation = adapter.validateConfig(runtimeConfig)

    if (!validation.ok) {
      return Promise.resolve(validation)
    }

    return adapter.testConnection(runtimeConfig)
  }

  /** Construye un proveedor temporal a partir de variables de entorno compatibles. */
  private getEnvProvider(type: AIProviderType): AIProviderDto | null {
    const manifest = aiProviderRegistry.get(type).manifest()
    const envKey = process.env[envKeyForProvider(type)]

    if (!envKey && manifest.requiresApiKey) {
      return null
    }

    return {
      id: `env:${type}`,
      name: `${manifest.name} (.env)`,
      type,
      authType: manifest.authType,
      baseUrl: process.env[`${type.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_BASE_URL`] || manifest.defaultBaseUrl,
      model: process.env[`${type.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_MODEL`] || manifest.defaultModel,
      maskedSecret: envKey ? maskSecret(envKey) : null,
      isDefault: true,
      enabled: true,
      monthlyTokenLimit: null,
      taskDefaults: {},
      metadata: { source: 'env' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }
}
