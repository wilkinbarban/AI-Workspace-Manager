import { prisma } from '@database/client'
import { toTaskDto } from '@database/mappers'
import type { AIAnalysisResponse, TaskDto } from '@shared/types/workspace'
import { MemoryService } from './memory-service'

/** Servicio de tareas manuales, tareas IA y trazabilidad de completados. */
export class TaskService {
  /** Memoria persistente para registrar avances concluidos del proyecto. */
  private readonly memoryService = new MemoryService()

  /** Lista tareas del proyecto priorizando estado y fecha de creacion. */
  async list(projectId: string): Promise<TaskDto[]> {
    const tasks = await prisma.task.findMany({
      where: { projectId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
    })

    return tasks.map(toTaskDto)
  }

  /** Crea una tarea manual o programatica con fuente explicita. */
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

  /** Convierte sugerencias de IA en tareas nuevas, evitando duplicados por titulo normalizado. */
  async createFromAI(projectId: string, response: AIAnalysisResponse): Promise<TaskDto[]> {
    const existingTasks = await prisma.task.findMany({
      where: { projectId },
      select: { title: true }
    })
    const existingTitles = new Set(existingTasks.map((task) => normalizeTaskTitle(task.title)))

    const created: TaskDto[] = []

    for (const task of response.tasks.slice(0, 20)) {
      const title = task.title.trim()
      const normalizedTitle = normalizeTaskTitle(title)

      if (!title || existingTitles.has(normalizedTitle)) {
        continue
      }

      const record = await prisma.task.create({
        data: {
          projectId,
          title,
          description: task.description?.trim() || null,
          source: 'ai',
          riskLevel: task.riskLevel ?? response.riskLevel
        }
      })

      existingTitles.add(normalizedTitle)
      created.push(toTaskDto(record))
    }

    return created
  }

  /** Marca una tarea como completada y deja evidencia en Memoria del proyecto. */
  async complete(taskId: string): Promise<TaskDto> {
    const current = await prisma.task.findUnique({ where: { id: taskId } })

    if (!current) {
      throw new Error('Tarea no encontrada.')
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: { status: 'completed' }
    })

    if (current.status !== 'completed') {
      await this.memoryService.remember({
        projectId: task.projectId,
        type: 'task-completed',
        content: `Tarea completada: ${task.title}`,
        metadata: {
          taskId: task.id,
          title: task.title,
          description: task.description,
          source: task.source,
          riskLevel: task.riskLevel,
          completedAt: task.updatedAt.toISOString()
        }
      })
    }

    return toTaskDto(task)
  }
}

/** Normaliza titulos para detectar duplicados sin depender de mayusculas o espacios. */
function normalizeTaskTitle(title: string): string {
  return title.trim().toLocaleLowerCase()
}
