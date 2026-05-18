import { prisma, stringifyJson } from '@database/client'
import { toAIProviderDto } from '@database/mappers'
import { maskSecret, envKeyForProvider } from '@core/ai/core/ai-auth.service'
import { aiProviderRegistry } from '@core/ai/core/ai-provider-registry'
import type { AIAuthType, AIProviderDto, AIProviderManifest, AIProviderType, AITaskType } from '@shared/types/workspace'
import { SecretStore } from '@main/security/secret-store'
import { randomUUID } from 'node:crypto'

const providerSecretAccount = (providerId: string): string => `ai-provider:${providerId}`

export class AIProviderService {
  private readonly secrets = new SecretStore()

  listManifests(): AIProviderManifest[] {
    return aiProviderRegistry.manifests()
  }

  async list(): Promise<AIProviderDto[]> {
    const providers = await prisma.aIProvider.findMany({
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }]
    })

    return providers.map(toAIProviderDto)
  }

  async save(input: {
    id?: string
    name: string
    type: string
    authType?: string
    baseUrl?: string
    model: string
    apiKey?: string
    monthlyTokenLimit?: number | null
    taskDefaults?: Partial<Record<AITaskType, boolean>>
    isDefault?: boolean
    enabled?: boolean
  }): Promise<AIProviderDto> {
    const manifest = aiProviderRegistry.get(input.type as AIProviderType).manifest()
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

  async getSetupState(): Promise<{ hasConfiguredProvider: boolean; defaultProviderId: string | null }> {
    const providers = await this.list()
    const defaultProvider = providers.find((provider) => provider.isDefault) ?? null

    return {
      hasConfiguredProvider: providers.some((provider) => provider.enabled),
      defaultProviderId: defaultProvider?.id ?? null
    }
  }

  async getProvider(providerId: string): Promise<AIProviderDto | null> {
    if (providerId.startsWith('env:')) {
      return this.getEnvProvider(providerId.replace('env:', '') as AIProviderType)
    }

    const provider = await prisma.aIProvider.findUnique({ where: { id: providerId } })
    return provider ? toAIProviderDto(provider) : null
  }

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

  async getApiKey(provider: AIProviderDto): Promise<string | null> {
    if (provider.id.startsWith('env:')) {
      return process.env[envKeyForProvider(provider.type)] ?? null
    }

    return this.secrets.getSecret(providerSecretAccount(provider.id))
  }

  testConfig(input: {
    name: string
    type: string
    authType?: string
    baseUrl?: string
    model: string
    apiKey?: string
  }): Promise<{ ok: boolean; message: string }> {
    const adapter = aiProviderRegistry.get(input.type as AIProviderType)
    const manifest = adapter.manifest()
    const runtimeConfig = {
      id: 'draft',
      name: input.name || manifest.name,
      type: manifest.type,
      authType: (input.authType ?? manifest.authType) as AIAuthType,
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
