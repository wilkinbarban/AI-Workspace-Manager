/** Estados persistidos de una tarea dentro del flujo operativo del proyecto. */
export type TaskStatus = 'pending' | 'approved' | 'running' | 'completed' | 'failed' | 'cancelled'

/** Niveles de riesgo aceptados para tareas y respuestas de IA. */
export const RISK_LEVELS = ['low', 'medium', 'high'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

/** Proveedores IA soportados por los adaptadores actuales del core. */
export const AI_PROVIDER_TYPES = ['openai', 'anthropic', 'deepseek', 'gemini', 'openrouter'] as const
export type AIProviderType = (typeof AI_PROVIDER_TYPES)[number]

/** Estrategias de autenticacion normalizadas para los distintos proveedores IA. */
export const AI_AUTH_TYPES = ['api-key', 'bearer', 'x-api-key', 'local-url', 'oauth', 'aws-iam', 'service-account'] as const
export type AIAuthType = (typeof AI_AUTH_TYPES)[number]

/** Tipos funcionales de trabajo usados para enrutar modelos, prompts y consumo. */
export const AI_TASK_TYPES = [
  'analysis',
  'code-generation',
  'documentation',
  'refactor',
  'agent',
  'bug-review',
  'test-generation',
  'upgrade'
] as const
export type AITaskType = (typeof AI_TASK_TYPES)[number]

/** Tipo minimo de nodo usado para reconstruir arboles de archivos en el renderer. */
export type FileTreeKind = 'file' | 'directory'

/** Nodo serializable del arbol de archivos detectado durante el escaneo local. */
export interface FileTreeNode {
  name: string
  relativePath: string
  kind: FileTreeKind
  size?: number
  children?: FileTreeNode[]
}

/** Proyecto importado por el usuario y enriquecido con el ultimo escaneo disponible. */
export interface ProjectDto {
  id: string
  name: string
  path: string
  language: string | null
  framework: string | null
  healthScore: number
  createdAt: string
  updatedAt: string
  latestScan?: WorkspaceScanDto | null
}

/** Puntuaciones parciales que forman el health score general del workspace. */
export interface WorkspaceHealth {
  score: number
  architecture: number
  documentation: number
  dependencies: number
  tests: number
  security: number
  git: number
  docker: number
  modularity: number
  maintainability: number
}

/** Resumen ejecutivo del estado local detectado por WorkspaceScanner. */
export interface WorkspaceSummary {
  projectName: string
  mainLanguage: string | null
  framework: string | null
  hasDocker: boolean
  hasGit: boolean
  hasReadme: boolean
  hasLicense: boolean
  hasTests: boolean
  totalFiles: number
  largeFiles: string[]
  ignoredDirectories: string[]
}

/** Resultado completo de un escaneo local antes de persistirse como WorkspaceScanDto. */
export interface WorkspaceAnalysis {
  summary: WorkspaceSummary
  fileTree: FileTreeNode[]
  dependencies: string[]
  problems: string[]
  recommendations: string[]
  health: WorkspaceHealth
}

/** Escaneo persistido y serializable que viaja desde el proceso main al renderer. */
export interface WorkspaceScanDto extends WorkspaceAnalysis {
  id: string
  projectId: string
  createdAt: string
}

/** Tarea manual o propuesta por IA, usada para seguimiento y ejecucion con agente. */
export interface TaskDto {
  id: string
  projectId: string
  title: string
  description: string | null
  status: TaskStatus
  source: string
  riskLevel: RiskLevel | null
  createdAt: string
  updatedAt: string
}

/** Evento de memoria del proyecto: scans, analisis IA y tareas completadas. */
export interface MemoryEntryDto {
  id: string
  projectId: string
  type: string
  content: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

/** Configuracion segura de un proveedor IA sin exponer secretos completos al renderer. */
export interface AIProviderDto {
  id: string
  name: string
  type: AIProviderType
  authType: AIAuthType
  baseUrl: string | null
  model: string
  maskedSecret: string | null
  isDefault: boolean
  enabled: boolean
  monthlyTokenLimit: number | null
  taskDefaults: Partial<Record<AITaskType, boolean>>
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

/** Manifest tecnico que describe capacidades, modelos y requisitos de un proveedor IA. */
export interface AIProviderManifest {
  type: AIProviderType
  name: string
  authType: AIAuthType
  defaultBaseUrl: string | null
  defaultModel: string
  availableModels: string[]
  description: string
  requiresApiKey: boolean
  oauthPrepared: boolean
  supportsStreaming: boolean
  supportsTools: boolean
  supportsVision: boolean
  supportsLocal: boolean
  status: 'ready' | 'prepared' | 'experimental'
}

/** Registro individual de consumo de tokens y costo estimado o real. */
export interface AIUsageDto {
  id: string
  providerId: string | null
  providerName: string
  providerType: AIProviderType
  model: string
  taskType: AITaskType
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  estimatedCostUsd: number | null
  remainingTokens: number | null
  isEstimate: boolean
  createdAt: string
}

/** Agregado historico de consumo usado por el panel de Consumo de AI. */
export interface AIUsageSummaryDto {
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  byProvider: Array<{
    providerName: string
    totalTokens: number
    estimatedCostUsd: number
    monthlyTokenLimit: number | null
    estimatedRemainingTokens: number | null
  }>
  history: AIUsageDto[]
}

/** Respuesta estructurada que debe devolver la IA para analisis y generacion de tareas. */
export interface AIAnalysisResponse {
  summary: string
  problems: string[]
  recommendations: string[]
  tasks: Array<{
    title: string
    description?: string
    riskLevel?: RiskLevel
  }>
  riskLevel: RiskLevel
}

/** Resultado completo de una consulta IA, incluyendo tareas creadas y consumo. */
export interface AIProjectAnswer {
  provider: string
  providerId: string
  taskType: AITaskType
  answer: AIAnalysisResponse
  tasks: TaskDto[]
  usage: AIUsageDto | null
}

/** Diff producido por una skill de escritura durante una ejecucion del agente. */
export interface FileDiffEntry {
  filePath: string
  before: string | null
  after: string
  taskId?: string
}

/** Eventos en tiempo real emitidos por el agente para monitor, herramientas y diffs. */
export type AgentEvent =
  | { type: 'thinking' | 'done' | 'error'; message: string }
  | { type: 'tool_call'; message: string; payload: { name: string; arguments: string } }
  | { type: 'tool_result'; message: string; payload: { result: string } }
  | { type: 'file_diff'; message: string; payload: FileDiffEntry }
