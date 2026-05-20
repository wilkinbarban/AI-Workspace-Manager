import type {
  AIProviderDto,
  MemoryEntryDto,
  ProjectDto,
  TaskDto,
  AIUsageDto,
  WorkspaceScanDto
} from '@shared/types/workspace'
import { parseJson } from './client'

/** Forma minima del registro Prisma de proyecto usada por los mapeadores. */
type ProjectRecord = {
  id: string
  name: string
  path: string
  language: string | null
  framework: string | null
  healthScore: number
  createdAt: Date
  updatedAt: Date
  scans?: ScanRecord[]
}

/** Registro de escaneo con blobs JSON persistidos como texto. */
type ScanRecord = {
  id: string
  projectId: string
  summaryJson: string
  treeJson: string
  dependenciesJson: string
  problemsJson: string
  recommendationsJson: string
  healthJson: string
  createdAt: Date
}

/** Registro de tarea antes de convertir estados string a tipos compartidos. */
type TaskRecord = {
  id: string
  projectId: string
  title: string
  description: string | null
  status: string
  source: string
  riskLevel: string | null
  createdAt: Date
  updatedAt: Date
}

/** Registro de memoria con metadata opcional serializada. */
type MemoryRecord = {
  id: string
  projectId: string
  type: string
  content: string
  metadataJson: string | null
  createdAt: Date
}

/** Registro persistido de proveedor IA sin exponer el secreto real. */
type AIProviderRecord = {
  id: string
  name: string
  type: string
  authType: string
  baseUrl: string | null
  model: string
  maskedSecret: string | null
  isDefault: boolean
  enabled: boolean
  monthlyTokenLimit: number | null
  taskDefaultsJson: string | null
  metadataJson: string | null
  createdAt: Date
  updatedAt: Date
}

/** Registro persistido de consumo IA usado para reportes agregados. */
type AIUsageRecord = {
  id: string
  providerId: string | null
  providerName: string
  providerType: string
  model: string
  taskType: string
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  estimatedCostUsd: number | null
  remainingTokens: number | null
  isEstimate: boolean
  createdAt: Date
}

/** Convierte un proyecto Prisma a DTO serializable para IPC. */
export function toProjectDto(project: ProjectRecord): ProjectDto {
  const latestScan = project.scans?.[0] ? toWorkspaceScanDto(project.scans[0]) : null

  return {
    id: project.id,
    name: project.name,
    path: project.path,
    language: project.language,
    framework: project.framework,
    healthScore: project.healthScore,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    latestScan
  }
}

/** Reconstruye un escaneo desde JSON persistido y fechas Date a strings ISO. */
export function toWorkspaceScanDto(scan: ScanRecord): WorkspaceScanDto {
  return {
    id: scan.id,
    projectId: scan.projectId,
    createdAt: scan.createdAt.toISOString(),
    summary: parseJson(scan.summaryJson, {
      projectName: '',
      mainLanguage: null,
      framework: null,
      hasDocker: false,
      hasGit: false,
      hasReadme: false,
      hasLicense: false,
      hasTests: false,
      totalFiles: 0,
      largeFiles: [],
      ignoredDirectories: []
    }),
    fileTree: parseJson(scan.treeJson, []),
    dependencies: parseJson(scan.dependenciesJson, []),
    problems: parseJson(scan.problemsJson, []),
    recommendations: parseJson(scan.recommendationsJson, []),
    health: parseJson(scan.healthJson, {
      score: 0,
      architecture: 0,
      documentation: 0,
      dependencies: 0,
      tests: 0,
      security: 0,
      git: 0,
      docker: 0,
      modularity: 0,
      maintainability: 0
    })
  }
}

/** Convierte una tarea Prisma a contrato compartido del renderer. */
export function toTaskDto(task: TaskRecord): TaskDto {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    status: task.status as TaskDto['status'],
    source: task.source,
    riskLevel: task.riskLevel as TaskDto['riskLevel'],
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  }
}

/** Convierte una entrada de memoria a DTO y parsea metadata defensivamente. */
export function toMemoryEntryDto(memory: MemoryRecord): MemoryEntryDto {
  return {
    id: memory.id,
    projectId: memory.projectId,
    type: memory.type,
    content: memory.content,
    metadata: memory.metadataJson ? parseJson(memory.metadataJson, null) : null,
    createdAt: memory.createdAt.toISOString()
  }
}

/** Convierte la configuracion de proveedor IA a DTO seguro para UI. */
export function toAIProviderDto(provider: AIProviderRecord): AIProviderDto {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type as AIProviderDto['type'],
    authType: provider.authType as AIProviderDto['authType'],
    baseUrl: provider.baseUrl,
    model: provider.model,
    maskedSecret: provider.maskedSecret,
    isDefault: provider.isDefault,
    enabled: provider.enabled,
    monthlyTokenLimit: provider.monthlyTokenLimit,
    taskDefaults: provider.taskDefaultsJson ? parseJson(provider.taskDefaultsJson, {}) : {},
    metadata: provider.metadataJson ? parseJson(provider.metadataJson, null) : null,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString()
  }
}

/** Convierte un registro de uso IA a DTO de historial y graficas. */
export function toAIUsageDto(usage: AIUsageRecord): AIUsageDto {
  return {
    id: usage.id,
    providerId: usage.providerId,
    providerName: usage.providerName,
    providerType: usage.providerType as AIUsageDto['providerType'],
    model: usage.model,
    taskType: usage.taskType as AIUsageDto['taskType'],
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
    remainingTokens: usage.remainingTokens,
    isEstimate: usage.isEstimate,
    createdAt: usage.createdAt.toISOString()
  }
}
