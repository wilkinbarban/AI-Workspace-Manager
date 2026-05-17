import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AIProjectAnswer,
  AIProviderManifest,
  AIProviderDto,
  AIUsageSummaryDto,
  AITaskType,
  MemoryEntryDto,
  ProjectDto,
  TaskDto,
  WorkspaceScanDto,
  AgentEvent,
  FileDiffEntry
} from '@shared/types/workspace'
import { appApi } from '@renderer/lib/api'

export type ViewKey = 'dashboard' | 'project' | 'ai' | 'tasks' | 'memory' | 'settings' | 'usage' | 'models'

/**
 * Main hook for managing the workspace state in the renderer process.
 * It provides centralized access to projects, tasks, memory, AI providers,
 * and exposes methods to interact with the Electron backend via IPC.
 *
 * @returns The workspace state and methods to interact with it.
 */
export function useWorkspaceManager() {
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [latestScan, setLatestScan] = useState<WorkspaceScanDto | null>(null)
  const [tasks, setTasks] = useState<TaskDto[]>([])
  const [memory, setMemory] = useState<MemoryEntryDto[]>([])
  const [providers, setProviders] = useState<AIProviderDto[]>([])
  const [providerManifests, setProviderManifests] = useState<AIProviderManifest[]>([])
  const [usageSummary, setUsageSummary] = useState<AIUsageSummaryDto | null>(null)
  const [setupRequired, setSetupRequired] = useState(false)
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [aiAnswer, setAiAnswer] = useState<AIProjectAnswer | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([])
  const [isAgentRunning, setIsAgentRunning] = useState(false)
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>()
  const [fileDiffs, setFileDiffs] = useState<FileDiffEntry[]>([])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  const activeProvider = useMemo(() => providers.find((provider) => provider.enabled) ?? null, [providers])

  const refreshProjects = useCallback(async () => {
    const nextProjects = await appApi.projects.getProjects()
    setProjects(nextProjects)

    if (!selectedProjectId && nextProjects[0]) {
      setSelectedProjectId(nextProjects[0].id)
    }
  }, [selectedProjectId])

  const refreshProviders = useCallback(async () => {
    const [nextProviders, nextManifests, setupState, usage] = await Promise.all([
      appApi.settings.listAIProviders(),
      appApi.settings.listAIProviderManifests(),
      appApi.settings.getAISetupState(),
      appApi.settings.getAIUsageSummary()
    ])
    setProviders(nextProviders)
    setProviderManifests(nextManifests)
    setSetupRequired(!setupState.hasConfiguredProvider)
    setUsageSummary(usage)
  }, [])

  const refreshProjectData = useCallback(async (projectId: string) => {
    const [scan, nextTasks, nextMemory] = await Promise.all([
      appApi.workspace.getLatestScan(projectId),
      appApi.tasks.list(projectId),
      appApi.memory.list(projectId)
    ])

    setLatestScan(scan)
    setTasks(nextTasks)
    setMemory(nextMemory)
  }, [])

  useEffect(() => {
    void refreshProjects()
    void refreshProviders()
  }, [refreshProjects, refreshProviders])

  useEffect(() => {
    if (selectedProjectId) {
      void refreshProjectData(selectedProjectId)
    } else {
      setLatestScan(null)
      setTasks([])
      setMemory([])
    }
  }, [refreshProjectData, selectedProjectId])

  const run = useCallback(async <T,>(operation: () => Promise<T>, successMessage?: string): Promise<T | null> => {
    setIsBusy(true)
    setError(null)
    setNotice(null)

    try {
      const result = await operation()

      if (successMessage) {
        setNotice(successMessage)
      }

      return result
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : 'Error inesperado.')
      return null
    } finally {
      setIsBusy(false)
    }
  }, [])

  const openProject = useCallback(async () => {
    const project = await run(() => appApi.projects.openProject(), 'Proyecto abierto. Analizando automáticamente...')

    if (project) {
      setSelectedProjectId(project.id)
      await refreshProjects()
      
      const scan = await run(() => appApi.workspace.scanProject(project.id), 'Análisis de proyecto actualizado.')
      if (scan) {
        setLatestScan(scan)
        await refreshProjectData(project.id)
      }
    }
  }, [refreshProjectData, refreshProjects, run])

  const scanSelectedProject = useCallback(async () => {
    if (!selectedProjectId) {
      setError('Abre un proyecto antes de analizar.')
      return
    }

    setAgentEvents([])
    setIsAgentRunning(true)
    const scan = await run(() => appApi.workspace.scanProject(selectedProjectId), 'Analisis actualizado.')
    setIsAgentRunning(false)

    if (scan) {
      setLatestScan(scan)
      await refreshProjects()
      await refreshProjectData(selectedProjectId)
    }
  }, [refreshProjectData, refreshProjects, run, selectedProjectId])

  const cleanInactiveProjects = useCallback(async () => {
    if (!selectedProjectId) {
      setError('Abre un proyecto primero para considerarlo el activo.')
      return
    }
    
    await run(() => appApi.projects.cleanInactiveProjects(selectedProjectId), 'Proyectos inactivos eliminados.')
    await refreshProjects()
  }, [refreshProjects, run, selectedProjectId])

  const askAI = useCallback(
    async (message: string) => {
      if (!selectedProjectId) {
        setError('Abre un proyecto antes de consultar IA.')
        return
      }
      
      setAgentEvents([])
      setIsAgentRunning(true)

      const answer = await run(() => appApi.ai.askProject({ projectId: selectedProjectId, message }), 'Analisis IA guardado.')
      
      setIsAgentRunning(false)

      if (answer) {
        setAiAnswer(answer)
        await refreshProjectData(selectedProjectId)
      }
    },
    [refreshProjectData, run, selectedProjectId]
  )

  const createTask = useCallback(
    async (input: { title: string; description?: string }) => {
      if (!selectedProjectId) return

      await run(() => appApi.tasks.create(selectedProjectId, input), 'Tarea creada manualmente.')
      await refreshProjectData(selectedProjectId)
    },
    [refreshProjectData, run, selectedProjectId]
  )

  const completeTask = useCallback(
    async (taskId: string) => {
      if (!selectedProjectId) return
      const task = await run(() => appApi.tasks.complete(taskId), 'Tarea completada.')
      if (task) {
        setTasks((current) => current.map((t) => (t.id === task.id ? task : t)))
      }
      return task
    },
    [run, selectedProjectId]
  )

  useEffect(() => {
    const unsubscribe = appApi.ai.onAgentEvent((event) => {
      setAgentEvents((prev) => [...prev, event])
      if (event.type === 'file_diff' && event.payload) {
        setFileDiffs((prev) => [
          ...prev.filter(d => d.filePath !== event.payload.filePath),
          { ...event.payload, taskId: activeTaskId }
        ])
      }
      if (event.type === 'done' || event.type === 'error') {
        setIsAgentRunning(false)
      }
      if (event.type === 'done' && activeTaskId) {
        void completeTask(activeTaskId).then(() => {
           setActiveTaskId(undefined)
        })
      }
    })
    return () => unsubscribe()
  }, [activeTaskId, completeTask])

  const startAgent = useCallback(async (prompt: string, taskId: string) => {
    if (!selectedProjectId || isAgentRunning) return
    
    setActiveTaskId(taskId)
    setAgentEvents([])
    setIsAgentRunning(true)
    
    try {
      await appApi.ai.runAgent({ projectId: selectedProjectId, prompt, providerId: activeProvider?.id })
    } catch (err: any) {
      setAgentEvents((prev) => [...prev, { type: 'error', message: err.message }])
      setIsAgentRunning(false)
      setActiveTaskId(undefined)
    }
  }, [selectedProjectId, isAgentRunning, activeProvider])

  const saveProvider = useCallback(
    async (input: {
      id?: string
      name: string
      type: string
      baseUrl?: string
      model: string
      apiKey?: string
      monthlyTokenLimit?: number | null
      isDefault?: boolean
      enabled?: boolean
    }) => {
      const provider = await run(() => appApi.settings.saveAIProvider(input), 'Proveedor guardado.')

      if (provider) {
        await refreshProviders()
      }
    },
    [refreshProviders, run]
  )

  const testProviderConfig = useCallback(
    async (input: { name: string; type: string; authType?: string; baseUrl?: string; model: string; apiKey?: string }) => {
      const result = await run(() => appApi.settings.testAIProviderConfig(input))

      if (result) {
        setNotice(result.message)
      }

      return result
    },
    [run]
  )

  const deleteProvider = useCallback(
    async (providerId: string) => {
      await run(() => appApi.settings.deleteAIProvider(providerId), 'Proveedor eliminado.')
      await refreshProviders()
    },
    [refreshProviders, run]
  )

  const setDefaultProvider = useCallback(
    async (providerId: string) => {
      await run(() => appApi.settings.setDefaultAIProvider(providerId), 'Proveedor predeterminado actualizado.')
      await refreshProviders()
    },
    [refreshProviders, run]
  )

  const askAIForTask = useCallback(
    async (message: string, taskType: AITaskType, providerId?: string) => {
      if (!selectedProjectId) {
        setError('Abre un proyecto antes de consultar IA.')
        return
      }

      const answer = await run(
        () => appApi.ai.askProject({ projectId: selectedProjectId, message, taskType, providerId }),
        'Analisis IA guardado.'
      )

      if (answer) {
        setAiAnswer(answer)
        await refreshProjectData(selectedProjectId)
        await refreshProviders()
      }
    },
    [refreshProjectData, refreshProviders, run, selectedProjectId]
  )

  const testProvider = useCallback(
    async (providerId: string) => {
      const result = await run(() => appApi.settings.testAIProvider(providerId))

      if (result) {
        setNotice(result.message)
      }
    },
    [run]
  )

  useEffect(() => {
    return appApi.menu?.onAction((action) => {
      if (['ai-settings', 'ai-add', 'ai-edit', 'ai-delete', 'ai-test', 'ai-default'].includes(action)) {
        setActiveView('settings')
      }
      if (action === 'ai-usage') setActiveView('usage')
      if (action === 'ai-models') setActiveView('models')
    })
  }, [])

  return {
    projects,
    selectedProject,
    selectedProjectId,
    latestScan,
    tasks,
    memory,
    providers,
    providerManifests,
    usageSummary,
    setupRequired,
    activeProvider,
    activeView,
    aiAnswer,
    isBusy,
    error,
    notice,
    agentEvents,
    isAgentRunning,
    activeTaskId,
    fileDiffs,
    setActiveView,
    setSelectedProjectId,
    openProject,
    scanSelectedProject,
    cleanInactiveProjects,
    askAI,
    askAIForTask,
    createTask,
    completeTask,
    startAgent,
    saveProvider,
    testProviderConfig,
    deleteProvider,
    setDefaultProvider,
    testProvider
  }
}
