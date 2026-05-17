import { prisma } from '@database/client'
import { toTaskDto } from '@database/mappers'
import type { AIAnalysisResponse, TaskDto } from '@shared/types/workspace'

export class TaskService {
  async list(projectId: string): Promise<TaskDto[]> {
    const tasks = await prisma.task.findMany({
      where: { projectId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
    })

    return tasks.map(toTaskDto)
  }

  async create(projectId: string, input: { title: string; description?: string; source?: string }): Promise<TaskDto> {
    const task = await prisma.task.create({
      data: {
        projectId,
        title: input.title,
        description: input.description,
        source: input.source ?? 'manual'
      }
    })

    return toTaskDto(task)
  }

  async createFromAI(projectId: string, response: AIAnalysisResponse): Promise<TaskDto[]> {
    await prisma.task.deleteMany({ where: { projectId } })

    const created: TaskDto[] = []

    for (const task of response.tasks.slice(0, 20)) {
      if (!task.title.trim()) {
        continue
      }

      const record = await prisma.task.create({
        data: {
          projectId,
          title: task.title.trim(),
          description: task.description?.trim() || null,
          source: 'ai',
          riskLevel: task.riskLevel ?? response.riskLevel
        }
      })

      created.push(toTaskDto(record))
    }

    return created
  }

  async complete(taskId: string): Promise<TaskDto> {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: { status: 'completed' }
    })
    return toTaskDto(task)
  }
}
