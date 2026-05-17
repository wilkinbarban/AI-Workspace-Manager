import { prisma } from '@database/client'
import { toAIUsageDto } from '@database/mappers'
import { estimateCostUsd } from '@core/ai/core/ai-usage-pricing'
import type { AIProviderDto, AIUsageDto, AIUsageSummaryDto, AITaskType } from '@shared/types/workspace'
import type { AIUsageReport } from '@core/ai/core/ai-provider.interface'

export class AIUsageService {
  async record(input: {
    provider: AIProviderDto
    taskType: AITaskType
    usage: AIUsageReport
  }): Promise<AIUsageDto> {
    const totalTokens =
      input.usage.totalTokens ?? sumNullable(input.usage.inputTokens, input.usage.outputTokens)
    const estimatedCostUsd =
      input.usage.estimatedCostUsd ??
      estimateCostUsd({
        providerType: input.provider.type,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens
      })
    const usedThisMonth = await this.usedThisMonth(input.provider.id)
    const remainingTokens =
      input.provider.monthlyTokenLimit && totalTokens != null
        ? Math.max(0, input.provider.monthlyTokenLimit - usedThisMonth - totalTokens)
        : input.usage.remainingTokens

    const record = await prisma.aIUsageLog.create({
      data: {
        providerId: input.provider.id.startsWith('env:') ? null : input.provider.id,
        providerName: input.provider.name,
        providerType: input.provider.type,
        model: input.provider.model,
        taskType: input.taskType,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        totalTokens,
        estimatedCostUsd,
        remainingTokens,
        isEstimate: input.usage.isEstimate || input.usage.totalTokens == null
      }
    })

    return toAIUsageDto(record)
  }

  async summary(): Promise<AIUsageSummaryDto> {
    const [history, providers] = await Promise.all([
      prisma.aIUsageLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.aIProvider.findMany()
    ])
    const providerLimit = new Map(providers.map((provider) => [provider.name, provider.monthlyTokenLimit]))
    const byProviderMap = new Map<string, { providerName: string; totalTokens: number; estimatedCostUsd: number }>()

    for (const item of history) {
      const current = byProviderMap.get(item.providerName) ?? {
        providerName: item.providerName,
        totalTokens: 0,
        estimatedCostUsd: 0
      }
      current.totalTokens += item.totalTokens ?? 0
      current.estimatedCostUsd += item.estimatedCostUsd ?? 0
      byProviderMap.set(item.providerName, current)
    }

    const totalInputTokens = history.reduce((sum, item) => sum + (item.inputTokens ?? 0), 0)
    const totalOutputTokens = history.reduce((sum, item) => sum + (item.outputTokens ?? 0), 0)
    const totalTokens = history.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0)
    const estimatedCostUsd = history.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0)

    return {
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
      byProvider: [...byProviderMap.values()].map((provider) => {
        const monthlyTokenLimit = providerLimit.get(provider.providerName) ?? null
        return {
          providerName: provider.providerName,
          totalTokens: provider.totalTokens,
          estimatedCostUsd: Number(provider.estimatedCostUsd.toFixed(6)),
          monthlyTokenLimit,
          estimatedRemainingTokens: monthlyTokenLimit == null ? null : Math.max(0, monthlyTokenLimit - provider.totalTokens)
        }
      }),
      history: history.map(toAIUsageDto)
    }
  }

  private async usedThisMonth(providerId: string): Promise<number> {
    if (providerId.startsWith('env:')) return 0
    const start = new Date()
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    const rows = await prisma.aIUsageLog.findMany({
      where: { providerId, createdAt: { gte: start } },
      select: { totalTokens: true }
    })
    return rows.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0)
  }
}

function sumNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null
  return (a ?? 0) + (b ?? 0)
}
