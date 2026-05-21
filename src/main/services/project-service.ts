import path from 'node:path'
import type { BrowserWindow, OpenDialogOptions } from 'electron'
import { prisma } from '@database/client'
import { toProjectDto } from '@database/mappers'
import type { ProjectDto } from '@shared/types/workspace'
import { assertDirectory } from '@main/security/workspace-guard'

/** Servicio de catalogo de proyectos importados por el usuario. */
export class ProjectService {
  /** Abre el dialogo nativo de Electron y registra la carpeta seleccionada. */
  async openProject(owner?: BrowserWindow | null): Promise<ProjectDto | null> {
    try {
      const electron = await import('electron')
      const options: OpenDialogOptions = {
        title: 'Selecciona un proyecto',
        properties: ['openDirectory', 'createDirectory']
      }
      const result = owner ? await electron.dialog.showOpenDialog(owner, options) : await electron.dialog.showOpenDialog(options)

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      return this.importProject(result.filePaths[0])
    } catch {
      throw new Error('El diálogo de selección de archivos no está disponible en este entorno. Por favor, introduzca la ruta absoluta manualmente.')
    }
  }

  /** Importa o actualiza un proyecto por ruta, validando que sea una carpeta real. */
  async importProject(workspacePath: string): Promise<ProjectDto> {
    const resolvedPath = await assertDirectory(workspacePath)
    const name = path.basename(resolvedPath)
    const project = await prisma.project.upsert({
      where: { path: resolvedPath },
      update: { name },
      create: { name, path: resolvedPath },
      include: {
        scans: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    })

    return toProjectDto(project)
  }

  /** Lista proyectos recientes con su ultimo escaneo para pintar el dashboard. */
  async getProjects(): Promise<ProjectDto[]> {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        scans: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    })

    return projects.map(toProjectDto)
  }

  /** Elimina proyectos no activos para dejar una sola ficha visible cuando el usuario limpia. */
  async cleanInactiveProjects(activeProjectId: string): Promise<void> {
    await prisma.project.deleteMany({
      where: {
        id: { not: activeProjectId }
      }
    })
  }
}
