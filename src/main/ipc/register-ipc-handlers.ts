import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/ipc'
import {
  askProjectSchema,
  createTaskSchema,
  projectIdSchema,
  runAgentSchema,
  saveAIProviderSchema,
  taskIdSchema
} from '@shared/schemas/api'
import { AIOrchestrator } from '@main/services/ai-orchestrator'
import { AIProviderService } from '@main/services/ai-provider-service'
import { AIUsageService } from '@main/services/ai-usage-service'
import { MemoryService } from '@main/services/memory-service'
import { ProjectService } from '@main/services/project-service'
import { TaskService } from '@main/services/task-service'
import { WorkspaceService } from '@main/services/workspace-service'

/** Firma comun de un handler IPC validado por safeHandle. */
type Handler<TInput, TOutput> = (input: TInput, event: IpcMainInvokeEvent) => Promise<TOutput> | TOutput

/** Instancias singleton de servicios usadas por el proceso main durante la sesion. */
const projectService = new ProjectService()
const workspaceService = new WorkspaceService()
const aiOrchestrator = new AIOrchestrator()
const taskService = new TaskService()
const memoryService = new MemoryService()
const providerService = new AIProviderService()
const usageService = new AIUsageService()

/** Registra todos los endpoints IPC disponibles para preload/window.api. */
export function registerIpcHandlers(): void {
  safeHandle(IPC_CHANNELS.projects.openProject, async (_input, event) => {
    return projectService.openProject(BrowserWindow.fromWebContents(event.sender))
  })

  safeHandle(IPC_CHANNELS.projects.getProjects, async () => {
    return projectService.getProjects()
  })

  safeHandle(IPC_CHANNELS.projects.cleanInactiveProjects, async (activeProjectId: unknown) => {
    return projectService.cleanInactiveProjects(projectIdSchema.parse(activeProjectId))
  })

  safeHandle(IPC_CHANNELS.workspace.scanProject, async (input: unknown) => {
    return workspaceService.scanProject(projectIdSchema.parse(input))
  })

  safeHandle(IPC_CHANNELS.workspace.getLatestScan, async (input: unknown) => {
    return workspaceService.getLatestScan(projectIdSchema.parse(input))
  })

  safeHandle(IPC_CHANNELS.ai.askProject, async (input: unknown, event) => {
    return aiOrchestrator.askProject(askProjectSchema.parse(input), (agentEvent) => {
      event.sender.send(IPC_CHANNELS.ai.agentEvent, agentEvent)
    })
  })

  safeHandle(IPC_CHANNELS.ai.runAgent, async (input: unknown, event) => {
    return aiOrchestrator.runAgent(runAgentSchema.parse(input), (agentEvent) => {
      event.sender.send(IPC_CHANNELS.ai.agentEvent, agentEvent)
    })
  })

  safeHandle(IPC_CHANNELS.tasks.list, async (input: unknown) => {
    return taskService.list(projectIdSchema.parse(input))
  })

  safeHandle(IPC_CHANNELS.tasks.create, async (input: unknown) => {
    const parsed = createTaskSchema.parse(input)
    return taskService.create(parsed.projectId, parsed.input)
  })

  safeHandle(IPC_CHANNELS.tasks.complete, async (input: unknown) => {
    return taskService.complete(taskIdSchema.parse(input))
  })

  safeHandle(IPC_CHANNELS.memory.list, async (input: unknown) => {
    return memoryService.list(projectIdSchema.parse(input))
  })

  safeHandle(IPC_CHANNELS.settings.saveAIProvider, async (input: unknown) => {
    const parsed = saveAIProviderSchema.parse(input)
    return providerService.save(parsed)
  })

  safeHandle(IPC_CHANNELS.settings.listAIProviders, async () => {
    return providerService.list()
  })

  safeHandle(IPC_CHANNELS.settings.listAIProviderManifests, async () => {
    return providerService.listManifests()
  })

  safeHandle(IPC_CHANNELS.settings.getAISetupState, async () => {
    return providerService.getSetupState()
  })

  safeHandle(IPC_CHANNELS.settings.testAIProviderConfig, async (input: unknown) => {
    const parsed = saveAIProviderSchema.parse(input)
    return providerService.testConfig(parsed)
  })

  safeHandle(IPC_CHANNELS.settings.getAIUsageSummary, async () => {
    return usageService.summary()
  })
}

/** Envuelve ipcMain.handle con validacion centralizada y errores seguros para el renderer. */
function safeHandle<TInput, TOutput>(channel: string, handler: Handler<TInput, TOutput>): void {
  ipcMain.handle(channel, async (event, input: TInput) => {
    try {
      return await handler(input, event)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado.'
      console.error(`[ipc:${channel}]`, error)
      throw new Error(message, { cause: error })
    }
  })
}
