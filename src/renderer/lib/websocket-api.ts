import type { AppApi } from '@shared/types/api'
import type { AgentEvent } from '@shared/types/workspace'
import { IPC_CHANNELS } from '@shared/constants/ipc'

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
}

type ServerResponseMessage = {
  type: 'response'
  id: string
  status: 'success' | 'error'
  payload?: unknown
  error?: string
}

type ServerEventMessage = {
  type: 'event'
  channel: string
  payload: AgentEvent
}

type ServerMessage = ServerResponseMessage | ServerEventMessage

/** Cliente WebSocket usado por el renderer web para hablar con el servidor Node local. */
class WebSocketApiClient {
  private socket: WebSocket | null = null
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private readonly eventListeners = new Map<string, Set<(event: AgentEvent) => void>>()
  private connectPromise: Promise<void> | null = null

  /** Abre una conexion unica bajo demanda; no se ejecuta cuando Electron usa window.api. */
  private connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const wsUrl = resolveWebSocketUrl()
      const socket = new WebSocket(wsUrl)
      this.socket = socket

      socket.onopen = () => {
        resolve()
      }

      socket.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      socket.onerror = () => {
        reject(new Error('No se pudo conectar con el servidor WebSocket local.'))
      }

      socket.onclose = () => {
        this.socket = null
        this.connectPromise = null
        window.setTimeout(() => {
          void this.connect().catch(() => {})
        }, 2000)
      }
    })

    return this.connectPromise
  }

  /** Procesa respuestas correlacionadas y eventos en tiempo real del agente. */
  private handleMessage(rawData: unknown): void {
    try {
      const message = parseServerMessage(rawData)

      if (message.type === 'response') {
        const pending = this.pendingRequests.get(message.id)
        if (!pending) {
          return
        }

        this.pendingRequests.delete(message.id)
        if (message.status === 'success') {
          pending.resolve(message.payload)
        } else {
          pending.reject(new Error(message.error || 'Error en el servidor.'))
        }
        return
      }

      const listeners = this.eventListeners.get(message.channel)
      listeners?.forEach((listener) => listener(message.payload))
    } catch (error) {
      console.error('[WS-Client] Error al procesar mensaje entrante:', error)
    }
  }

  /** Envia una peticion tipada y resuelve la promesa con la respuesta correlacionada. */
  async sendRequest<TResponse>(channel: string, payload?: unknown): Promise<TResponse> {
    await this.connect()

    return new Promise<TResponse>((resolve, reject) => {
      const id = `${channel}-${crypto.randomUUID()}`
      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as TResponse),
        reject
      })

      const message = JSON.stringify({
        type: 'request',
        id,
        channel,
        payload
      })

      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(message)
        return
      }

      this.pendingRequests.delete(id)
      reject(new Error('No se pudo enviar el comando. WebSocket desconectado.'))
    })
  }

  /** Registra listeners para eventos de agente transmitidos por el backend. */
  addEventListener(channel: string, callback: (event: AgentEvent) => void): () => void {
    let listeners = this.eventListeners.get(channel)
    if (!listeners) {
      listeners = new Set()
      this.eventListeners.set(channel, listeners)
    }
    listeners.add(callback)

    return () => {
      listeners?.delete(callback)
      if (listeners?.size === 0) {
        this.eventListeners.delete(channel)
      }
    }
  }
}

let client: WebSocketApiClient | null = null

/** Devuelve el cliente singleton solo cuando el modo web realmente lo necesita. */
function getClient(): WebSocketApiClient {
  client ??= new WebSocketApiClient()
  return client
}

/** Adaptador AppApi para navegador: cada llamada viaja por WebSocket al servidor local. */
export const webSocketApi: AppApi = {
  projects: {
    openProject: async (projectPath?: string) => {
      const normalizedPath = projectPath?.trim()
      if (!normalizedPath) {
        return null
      }
      return getClient().sendRequest(IPC_CHANNELS.projects.openProject, normalizedPath)
    },
    getProjects: () => getClient().sendRequest(IPC_CHANNELS.projects.getProjects),
    cleanInactiveProjects: (activeProjectId) =>
      getClient().sendRequest(IPC_CHANNELS.projects.cleanInactiveProjects, activeProjectId)
  },
  workspace: {
    scanProject: (projectId) => getClient().sendRequest(IPC_CHANNELS.workspace.scanProject, projectId),
    getLatestScan: (projectId) =>
      getClient().sendRequest(IPC_CHANNELS.workspace.getLatestScan, projectId)
  },
  ai: {
    askProject: (input) => getClient().sendRequest(IPC_CHANNELS.ai.askProject, input),
    runAgent: (input) => getClient().sendRequest(IPC_CHANNELS.ai.runAgent, input),
    onAgentEvent: (callback) => getClient().addEventListener(IPC_CHANNELS.ai.agentEvent, callback)
  },
  tasks: {
    list: (projectId) => getClient().sendRequest(IPC_CHANNELS.tasks.list, projectId),
    create: (projectId, input) =>
      getClient().sendRequest(IPC_CHANNELS.tasks.create, { projectId, input }),
    complete: (taskId) => getClient().sendRequest(IPC_CHANNELS.tasks.complete, taskId)
  },
  memory: {
    list: (projectId) => getClient().sendRequest(IPC_CHANNELS.memory.list, projectId)
  },
  settings: {
    saveAIProvider: (input) => getClient().sendRequest(IPC_CHANNELS.settings.saveAIProvider, input),
    listAIProviders: () => getClient().sendRequest(IPC_CHANNELS.settings.listAIProviders),
    listAIProviderManifests: () =>
      getClient().sendRequest(IPC_CHANNELS.settings.listAIProviderManifests),
    getAISetupState: () => getClient().sendRequest(IPC_CHANNELS.settings.getAISetupState),
    testAIProviderConfig: (input) =>
      getClient().sendRequest(IPC_CHANNELS.settings.testAIProviderConfig, input),
    getAIUsageSummary: () => getClient().sendRequest(IPC_CHANNELS.settings.getAIUsageSummary)
  }
}

function parseServerMessage(rawData: unknown): ServerMessage {
  const text = typeof rawData === 'string' ? rawData : String(rawData)
  const parsed: unknown = JSON.parse(text)

  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    throw new Error('Mensaje WebSocket invalido.')
  }

  if (parsed.type === 'response') {
    if (
      typeof parsed.id !== 'string' ||
      (parsed.status !== 'success' && parsed.status !== 'error')
    ) {
      throw new Error('Respuesta WebSocket invalida.')
    }

    return {
      type: 'response',
      id: parsed.id,
      status: parsed.status,
      payload: parsed.payload,
      error: typeof parsed.error === 'string' ? parsed.error : undefined
    }
  }

  if (parsed.type === 'event') {
    if (typeof parsed.channel !== 'string') {
      throw new Error('Evento WebSocket invalido.')
    }

    return {
      type: 'event',
      channel: parsed.channel,
      payload: parsed.payload as AgentEvent
    }
  }

  throw new Error('Tipo de mensaje WebSocket no soportado.')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** En desarrollo el renderer puede venir de Vite/electron-vite en 5173 y el backend vive en 3000. */
function resolveWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const { hostname, host, port } = window.location

  if (port === '5173') {
    return `${protocol}//${hostname}:3000/ws`
  }

  return `${protocol}//${host}/ws`
}
