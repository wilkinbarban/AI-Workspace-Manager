import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type IncomingMessage, type ServerResponse as NodeServerResponse } from 'node:http'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { prisma } from '@database/client'
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

type SocketRequest = {
  type?: string
  id: string
  channel: string
  payload?: unknown
}

type SocketResponse =
  | { type: 'response'; id: string; status: 'success'; payload: unknown }
  | { type: 'response'; id: string; status: 'error'; error: string }

const projectService = new ProjectService()
const workspaceService = new WorkspaceService()
const aiOrchestrator = new AIOrchestrator()
const taskService = new TaskService()
const memoryService = new MemoryService()
const providerService = new AIProviderService()
const usageService = new AIUsageService()

const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '127.0.0.1'

/** Directorio donde web:build deja la UI web optimizada para web:start. */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const webDistDir = path.resolve(__dirname, '../web')

/** Servidor HTTP local: status JSON y archivos estaticos en modo produccion. */
const server = createServer((req, res) => {
  applyCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'running', service: 'AI Workspace Manager API' }))
    return
  }

  serveStaticFile(req.url || '/', res)
})

/** WebSocket API expuesta solo en /ws para mantener separada la UI estatica. */
const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws, req) => {
  if (!isAllowedLocalOrigin(req.headers.origin)) {
    ws.close(1008, 'Origin not allowed')
    return
  }

  console.log('[WS] Frontend conectado al backend.')

  ws.on('message', async (messageData) => {
    try {
      const request = parseSocketRequest(messageData)
      const payload = await dispatchRequest(request, ws)
      sendSocketResponse(ws, { type: 'response', id: request.id, status: 'success', payload })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado.'
      console.error('[WS] Error:', error)
      const requestId = getRequestId(messageData)
      if (requestId) {
        sendSocketResponse(ws, { type: 'response', id: requestId, status: 'error', error: message })
      }
    }
  })

  ws.on('close', () => {
    console.log('[WS] Frontend desconectado.')
  })
})

/** Enruta cada canal compartido al mismo servicio que usa Electron IPC. */
async function dispatchRequest(request: SocketRequest, ws: WebSocket): Promise<unknown> {
  switch (request.channel) {
    case IPC_CHANNELS.projects.openProject:
      if (typeof request.payload !== 'string') {
        throw new Error('Debe proveer una ruta absoluta de directorio.')
      }
      return projectService.importProject(request.payload)

    case IPC_CHANNELS.projects.getProjects:
      return projectService.getProjects()

    case IPC_CHANNELS.projects.cleanInactiveProjects:
      return projectService.cleanInactiveProjects(projectIdSchema.parse(request.payload))

    case IPC_CHANNELS.workspace.scanProject:
      return workspaceService.scanProject(projectIdSchema.parse(request.payload))

    case IPC_CHANNELS.workspace.getLatestScan:
      return workspaceService.getLatestScan(projectIdSchema.parse(request.payload))

    case IPC_CHANNELS.ai.askProject:
      return aiOrchestrator.askProject(askProjectSchema.parse(request.payload), (agentEvent) => {
        ws.send(JSON.stringify({
          type: 'event',
          channel: IPC_CHANNELS.ai.agentEvent,
          payload: agentEvent
        }))
      })

    case IPC_CHANNELS.ai.runAgent:
      return aiOrchestrator.runAgent(runAgentSchema.parse(request.payload), (agentEvent) => {
        ws.send(JSON.stringify({
          type: 'event',
          channel: IPC_CHANNELS.ai.agentEvent,
          payload: agentEvent
        }))
      })

    case IPC_CHANNELS.tasks.list:
      return taskService.list(projectIdSchema.parse(request.payload))

    case IPC_CHANNELS.tasks.create: {
      const parsed = createTaskSchema.parse(request.payload)
      return taskService.create(parsed.projectId, parsed.input)
    }

    case IPC_CHANNELS.tasks.complete:
      return taskService.complete(taskIdSchema.parse(request.payload))

    case IPC_CHANNELS.memory.list:
      return memoryService.list(projectIdSchema.parse(request.payload))

    case IPC_CHANNELS.settings.saveAIProvider:
      return providerService.save(saveAIProviderSchema.parse(request.payload))

    case IPC_CHANNELS.settings.listAIProviders:
      return providerService.list()

    case IPC_CHANNELS.settings.listAIProviderManifests:
      return providerService.listManifests()

    case IPC_CHANNELS.settings.getAISetupState:
      return providerService.getSetupState()

    case IPC_CHANNELS.settings.testAIProviderConfig:
      return providerService.testConfig(saveAIProviderSchema.parse(request.payload))

    case IPC_CHANNELS.settings.getAIUsageSummary:
      return usageService.summary()

    default:
      throw new Error(`Canal no soportado: ${request.channel}`)
  }
}

function serveStaticFile(reqUrl: string, res: NodeServerResponse): void {
  const requestPath = resolveRequestPath(reqUrl)
  let filePath = path.resolve(webDistDir, requestPath === '/' ? 'index.html' : requestPath.slice(1))

  if (!isPathInside(webDistDir, filePath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' })
    res.end('Acceso denegado')
    return
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(webDistDir, 'index.html')
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('UI web no compilada. Ejecuta npm run web:build o usa npm run web:dev.')
    return
  }

  const contentType = mimeTypeFor(filePath)
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end(`Error del servidor: ${error.code}`)
      return
    }

    res.writeHead(200, { 'Content-Type': contentType })
    res.end(content)
  })
}

function applyCorsHeaders(req: IncomingMessage, res: NodeServerResponse): void {
  const origin = req.headers.origin
  if (isAllowedLocalOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin ?? '*')
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function parseSocketRequest(rawData: RawData): SocketRequest {
  const parsed: unknown = JSON.parse(rawData.toString())
  if (!isRecord(parsed) || typeof parsed.id !== 'string' || typeof parsed.channel !== 'string') {
    throw new Error('Peticion WebSocket invalida.')
  }

  return {
    type: typeof parsed.type === 'string' ? parsed.type : undefined,
    id: parsed.id,
    channel: parsed.channel,
    payload: parsed.payload
  }
}

function sendSocketResponse(ws: WebSocket, response: SocketResponse): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(response))
  }
}

function getRequestId(rawData: RawData): string | null {
  try {
    const parsed: unknown = JSON.parse(rawData.toString())
    return isRecord(parsed) && typeof parsed.id === 'string' ? parsed.id : null
  } catch {
    return null
  }
}

function resolveRequestPath(reqUrl: string): string {
  try {
    return decodeURIComponent(new URL(reqUrl, `http://${HOST}:${PORT}`).pathname)
  } catch {
    return '/'
  }
}

function isAllowedLocalOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true
  }

  try {
    const url = new URL(origin)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath))
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function mimeTypeFor(filePath: string): string {
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
  }

  return mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function start(): Promise<void> {
  try {
    await prisma.$connect()
    console.log('[DB] Conexion a base de datos SQLite establecida.')

    server.listen(PORT, HOST, () => {
      console.log(`[Server] Servidor listo en http://${HOST}:${PORT}`)
      console.log(`[Server] WebSocket API listo en ws://${HOST}:${PORT}/ws`)
    })
  } catch (error) {
    console.error('[Server] Error fatal al arrancar:', error)
    process.exit(1)
  }
}

void start()
