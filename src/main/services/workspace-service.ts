import { prisma, stringifyJson } from '@database/client'
import { toWorkspaceScanDto } from '@database/mappers'
import { WorkspaceScanner } from '@core/workspace/workspace-scanner'
import type { WorkspaceScanDto } from '@shared/types/workspace'
import { MemoryService } from './memory-service'

/** Orquesta escaneos locales y persistencia de resultados de salud del workspace. */
export class WorkspaceService {
  /** Scanner puro de archivos, aislado para facilitar pruebas futuras. */
  private readonly scanner = new WorkspaceScanner()
  /** Servicio usado para guardar un rastro historico de cada escaneo ejecutado. */
  private readonly memoryService = new MemoryService()

  /** Ejecuta un escaneo local, persiste el resultado y actualiza resumen del proyecto. */
  async scanProject(projectId: string): Promise<WorkspaceScanDto> {
    const project = await prisma.project.findUnique({ where: { id: projectId } })

    if (!project) {
      throw new Error('Proyecto no encontrado.')
    }

    const analysis = await this.scanner.scan(project.path)

    const scan = await prisma.workspaceScan.create({
      data: {
        projectId,
        summaryJson: stringifyJson(analysis.summary),
        treeJson: stringifyJson(analysis.fileTree),
        dependenciesJson: stringifyJson(analysis.dependencies),
        problemsJson: stringifyJson(analysis.problems),
        recommendationsJson: stringifyJson(analysis.recommendations),
        healthJson: stringifyJson(analysis.health)
      }
    })

    await prisma.project.update({
      where: { id: projectId },
      data: {
        language: analysis.summary.mainLanguage,
        framework: analysis.summary.framework,
        healthScore: analysis.health.score
      }
    })

    await this.memoryService.remember({
      projectId,
      type: 'scan',
      content: `Scanner ejecutado. Salud ${analysis.health.score}%. Problemas detectados: ${analysis.problems.length}.`,
      metadata: {
        health: analysis.health,
        language: analysis.summary.mainLanguage,
        framework: analysis.summary.framework
      }
    })

    return toWorkspaceScanDto(scan)
  }

  /** Recupera el escaneo mas reciente de un proyecto sin recalcular el workspace. */
  async getLatestScan(projectId: string): Promise<WorkspaceScanDto | null> {
    const scan = await prisma.workspaceScan.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    })

    return scan ? toWorkspaceScanDto(scan) : null
  }
}
