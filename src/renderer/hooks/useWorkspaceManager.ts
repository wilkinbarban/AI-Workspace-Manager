import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AIProjectAnswer,
  AIAuthType,
  AIProviderManifest,
  AIProviderDto,
  AIProviderType,
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

/**
 * Hook principal de estado del renderer.
 * Centraliza proyectos, tareas, memoria, proveedores IA, consumo y eventos del agente.
 *
 * @returns Estado listo para componentes y acciones tipadas contra la API IPC.
 */
export function useWorkspaceManager() {
  /** Proyectos importados disponibles para seleccionar en el dashboard. */
  const [projects, setProjects] = useState<ProjectDto[]>([])
  /** Identificador del proyecto activo seleccionado por el usuario. */
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  /** Ultimo escaneo local persistido para el proyecto activo. */
  const [latestScan, setLatestScan] = useState<WorkspaceScanDto | null>(null)
  /** Tareas manuales o generadas por IA asociadas al proyecto activo. */
  const [tasks, setTasks] = useState<TaskDto[]>([])
  /** Memoria cronologica del proyecto: scans, analisis IA y tareas completadas. */
  const [memory, setMemory] = useState<MemoryEntryDto[]>([])
  /** Proveedores IA guardados por el usuario. */
  const [providers, setProviders] = useState<AIProviderDto[]>([])
  /** Manifests tecnicos disponibles para construir el formulario de configuracion. */
  const [providerManifests, setProviderManifests] = useState<AIProviderManifest[]>([])
  /** Resumen de consumo de tokens y costos estimados. */
  const [usageSummary, setUsageSummary] = useState<AIUsageSummaryDto | null>(null)
  /** Bandera historica para detectar falta de configuracion inicial de IA. */
  const [setupRequired, setSetupRequired] = useState(false)
  /** Disponibilidad real del almacen seguro nativo usado para persistir API keys. */
  const [secretStoreAvailable, setSecretStoreAvailable] = useState(true)
  /** Ultima respuesta estructurada de IA mostrada en el dashboard. */
  const [aiAnswer, setAiAnswer] = useState<AIProjectAnswer | null>(null)
  /** Estado global de trabajo para deshabilitar botones durante operaciones IPC. */
  const [isBusy, setIsBusy] = useState(false)
  /** Error visible al usuario producido por la ultima operacion. */
  const [error, setError] = useState<string | null>(null)
  /** Mensaje de exito o informacion producido por la ultima operacion. */
  const [notice, setNotice] = useState<string | null>(null)

  /** Stream de eventos del agente usado por el monitor visual. */
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([])
  /** Indica si hay una ejecucion de agente en curso. */
  const [isAgentRunning, setIsAgentRunning] = useState(false)
  /** Tarea que el agente esta intentando resolver actualmente. */
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>()
  /** Diffs de archivos generados por la skill writeFile durante la sesion. */
  const [fileDiffs, setFileDiffs] = useState<FileDiffEntry[]>([])

  /** Proyecto completo derivado desde el id seleccionado. */
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  /** Primer proveedor habilitado; controla si se muestra dashboard o configuracion inicial. */
  const activeProvider = useMemo(() => providers.find((provider) => provider.enabled) ?? null, [providers])

  /** Recarga proyectos y selecciona automaticamente el primero cuando no hay seleccion activa. */
  const refreshProjects = useCallback(async () => {
    const nextProjects = await appApi.projects.getProjects()
    setProjects(nextProjects)

    if (!selectedProjectId && nextProjects[0]) {
      setSelectedProjectId(nextProjects[0].id)
    }
  }, [selectedProjectId])

  /** Recarga proveedores, manifests, setup y consumo en una sola tanda paralela. */
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
    setSecretStoreAvailable(setupState.secretStoreAvailable)
    setUsageSummary(usage)
  }, [])

  /** Recarga todos los datos dependientes del proyecto activo. */
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
    void refreshProjects().catch((initialError) => {
      setError(initialError instanceof Error ? initialError.message : 'No se pudieron cargar los proyectos.')
    })
    void refreshProviders().catch((initialError) => {
      setError(initialError instanceof Error ? initialError.message : 'No se pudo cargar la configuración de IA.')
    })
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

  /** Ejecuta operaciones IPC con manejo uniforme de loading, error y mensaje de exito. */
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

  /** Abre o importa un proyecto y dispara el primer escaneo automatico. */
  const openProject = useCallback(async (projectPath?: string) => {
    const project = await run(() => appApi.projects.openProject(projectPath), 'Proyecto abierto. Analizando automáticamente...')

    if (project) {
      setSelectedProjectId(project.id)
      await refreshProjects()
      
      const scan = await run(() => appApi.workspace.scanProject(project.id), 'Análisis de proyecto actualizado.')
      if (scan) {
        setLatestScan(scan)
        await refreshProjectData(project.id)
      }

      return true
    }

    return false
  }, [refreshProjectData, refreshProjects, run])

  /** Recalcula el analisis local del proyecto seleccionado. */
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

  /** Elimina proyectos no activos de la base local. */
  const cleanInactiveProjects = useCallback(async () => {
    if (!selectedProjectId) {
      setError('Abre un proyecto primero para considerarlo el activo.')
      return
    }
    
    await run(() => appApi.projects.cleanInactiveProjects(selectedProjectId), 'Proyectos inactivos eliminados.')
    await refreshProjects()
  }, [refreshProjects, run, selectedProjectId])

  /** Ejecuta una consulta IA generica sobre el proyecto activo. */
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

  /** Crea una tarea manual y refresca la lista visible. */
  const createTask = useCallback(
    async (input: { title: string; description?: string }) => {
      if (!selectedProjectId) return

      await run(() => appApi.tasks.create(selectedProjectId, input), 'Tarea creada manualmente.')
      await refreshProjectData(selectedProjectId)
    },
    [refreshProjectData, run, selectedProjectId]
  )

  /** Marca una tarea como completada y refresca memoria/avance. */
  const completeTask = useCallback(
    async (taskId: string) => {
      if (!selectedProjectId) return
      const task = await run(() => appApi.tasks.complete(taskId), 'Tarea completada.')
      if (task) {
        setTasks((current) => current.map((t) => (t.id === task.id ? task : t)))
        await refreshProjectData(selectedProjectId)
      }
      return task
    },
    [refreshProjectData, run, selectedProjectId]
  )

  useEffect(() => {
    // Suscripcion unica al stream IPC de eventos del agente.
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

  /** Inicia el agente autonomo para resolver una tarea concreta. */
  const startAgent = useCallback(async (prompt: string, taskId: string) => {
    if (!selectedProjectId || isAgentRunning) return
    
    setActiveTaskId(taskId)
    setAgentEvents([])
    setIsAgentRunning(true)
    
    try {
      await appApi.ai.runAgent({ projectId: selectedProjectId, prompt, providerId: activeProvider?.id })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado al ejecutar el agente.'
      setAgentEvents((prev) => [...prev, { type: 'error', message }])
      setIsAgentRunning(false)
      setActiveTaskId(undefined)
    }
  }, [selectedProjectId, isAgentRunning, activeProvider])

  /** Guarda proveedor IA desde settings o configuracion inicial y refresca manifests/uso. */
  const saveProvider = useCallback(
    async (input: {
      id?: string
      name: string
      type: AIProviderType
      authType?: AIAuthType
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

  /** Prueba una configuracion IA sin persistirla necesariamente. */
  const testProviderConfig = useCallback(
    async (input: {
      name: string
      type: AIProviderType
      authType?: AIAuthType
      baseUrl?: string
      model: string
      apiKey?: string
    }) => {
      const result = await run(() => appApi.settings.testAIProviderConfig(input))

      if (result) {
        setNotice(result.message)
      }

      return result
    },
    [run]
  )

  /** Ejecuta una consulta IA especializada por tipo de tarea y proveedor opcional. */
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
    secretStoreAvailable,
    activeProvider,
    aiAnswer,
    isBusy,
    error,
    notice,
    agentEvents,
    isAgentRunning,
    activeTaskId,
    fileDiffs,
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
    testProviderConfig
  }
}
