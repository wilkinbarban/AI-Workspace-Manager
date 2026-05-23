import type {
  AIProjectAnswer,
  AgentEvent,
  AIAuthType,
  AIProviderManifest,
  AIProviderDto,
  AIProviderType,
  AISetupState,
  AIUsageSummaryDto,
  AITaskType,
  MemoryEntryDto,
  ProjectDto,
  TaskDto,
  WorkspaceScanDto
} from './workspace'

/**
 * Contrato publico expuesto por preload en `window.api`.
 * Todas las llamadas cruzan IPC y mantienen tipos compartidos entre main y renderer.
 */
export interface AppApi {
  projects: {
    openProject: (projectPath?: string) => Promise<ProjectDto | null>
    getProjects: () => Promise<ProjectDto[]>
    cleanInactiveProjects: (activeProjectId: string) => Promise<void>
  }
  workspace: {
    scanProject: (projectId: string) => Promise<WorkspaceScanDto>
    getLatestScan: (projectId: string) => Promise<WorkspaceScanDto | null>
  }
  ai: {
    askProject: (input: { projectId: string; message: string; providerId?: string; taskType?: AITaskType }) => Promise<AIProjectAnswer>
    runAgent: (input: { projectId: string; prompt: string; providerId?: string }) => Promise<string>
    onAgentEvent: (callback: (event: AgentEvent) => void) => () => void
  }
  tasks: {
    list: (projectId: string) => Promise<TaskDto[]>
    create: (projectId: string, input: { title: string; description?: string }) => Promise<TaskDto>
    complete: (taskId: string) => Promise<TaskDto>
  }
  memory: {
    list: (projectId: string) => Promise<MemoryEntryDto[]>
  }
  settings: {
    saveAIProvider: (input: {
      id?: string
      name: string
      type: AIProviderType
      authType?: AIAuthType
      baseUrl?: string
      model: string
      apiKey?: string
      monthlyTokenLimit?: number | null
      taskDefaults?: Partial<Record<AITaskType, boolean>>
      isDefault?: boolean
      enabled?: boolean
    }) => Promise<AIProviderDto>
    listAIProviders: () => Promise<AIProviderDto[]>
    listAIProviderManifests: () => Promise<AIProviderManifest[]>
    getAISetupState: () => Promise<AISetupState>
    testAIProviderConfig: (input: {
      name: string
      type: AIProviderType
      authType?: AIAuthType
      baseUrl?: string
      model: string
      apiKey?: string
    }) => Promise<{ ok: boolean; message: string }>
    getAIUsageSummary: () => Promise<AIUsageSummaryDto>
  }
}
