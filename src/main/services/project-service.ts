import path from 'node:path'
import { BrowserWindow, dialog, type OpenDialogOptions } from 'electron'
import { prisma } from '@database/client'
import { toProjectDto } from '@database/mappers'
import type { ProjectDto } from '@shared/types/workspace'
import { assertDirectory } from '@main/security/workspace-guard'

export class ProjectService {
  async openProject(owner?: BrowserWindow | null): Promise<ProjectDto | null> {
    const options: OpenDialogOptions = {
      title: 'Selecciona un proyecto',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return this.importProject(result.filePaths[0])
  }

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

  async cleanInactiveProjects(activeProjectId: string): Promise<void> {
    await prisma.project.deleteMany({
      where: {
        id: { not: activeProjectId }
      }
    })
  }
}
