import type {
  AIProjectAnswer,
  AIProviderManifest,
  AIProviderDto,
  AIUsageSummaryDto,
  AITaskType,
  MemoryEntryDto,
  ProjectDto,
  TaskDto,
  WorkspaceScanDto
} from './workspace'

export interface AppApi {
  projects: {
    openProject: () => Promise<ProjectDto | null>
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
    onAgentEvent: (callback: (event: any) => void) => () => void
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
      type: string
      authType?: string
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
    getAISetupState: () => Promise<{ hasConfiguredProvider: boolean; defaultProviderId: string | null }>
    testAIProviderConfig: (input: {
      name: string
      type: string
      authType?: string
      baseUrl?: string
      model: string
      apiKey?: string
    }) => Promise<{ ok: boolean; message: string }>
    getAIUsageSummary: () => Promise<AIUsageSummaryDto>
  }
}
