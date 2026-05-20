import { prisma, stringifyJson } from '@database/client'
import { toMemoryEntryDto } from '@database/mappers'
import type { MemoryEntryDto } from '@shared/types/workspace'

/** Servicio de memoria cronologica del proyecto visible en el dashboard. */
export class MemoryService {
  /** Devuelve las ultimas entradas para mantener el renderer rapido y enfocado. */
  async list(projectId: string): Promise<MemoryEntryDto[]> {
    const entries = await prisma.memoryEntry.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    return entries.map(toMemoryEntryDto)
  }

  /** Persiste un evento relevante del proyecto con metadata tecnica opcional. */
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
