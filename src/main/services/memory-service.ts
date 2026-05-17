import { prisma, stringifyJson } from '@database/client'
import { toMemoryEntryDto } from '@database/mappers'
import type { MemoryEntryDto } from '@shared/types/workspace'

export class MemoryService {
  async list(projectId: string): Promise<MemoryEntryDto[]> {
    const entries = await prisma.memoryEntry.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    return entries.map(toMemoryEntryDto)
  }

  async remember(input: {
    projectId: string
    type: string
    content: string
    metadata?: Record<string, unknown>
  }): Promise<MemoryEntryDto> {
    const entry = await prisma.memoryEntry.create({
      data: {
        projectId: input.projectId,
        type: input.type,
        content: input.content,
        metadataJson: input.metadata ? stringifyJson(input.metadata) : null
      }
    })

    return toMemoryEntryDto(entry)
  }
}
