export type TaskStatus = 'pending' | 'approved' | 'running' | 'completed' | 'failed' | 'cancelled'

export type RiskLevel = 'low' | 'medium' | 'high'

export type AIProviderType =
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'gemini'
  | 'openrouter'

export type AIAuthType = 'api-key' | 'bearer' | 'x-api-key' | 'local-url' | 'oauth' | 'aws-iam' | 'service-account'

export type AITaskType =
  | 'analysis'
  | 'code-generation'
  | 'documentation'
  | 'refactor'
  | 'agent'
  | 'bug-review'
  | 'test-generation'
  | 'upgrade'

export type FileTreeKind = 'file' | 'directory'

export interface FileTreeNode {
  name: string
  relativePath: string
  kind: FileTreeKind
  size?: number
  children?: FileTreeNode[]
}

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

export interface WorkspaceAnalysis {
  summary: WorkspaceSummary
  fileTree: FileTreeNode[]
  dependencies: string[]
  problems: string[]
  recommendations: string[]
  health: WorkspaceHealth
}

export interface WorkspaceScanDto extends WorkspaceAnalysis {
  id: string
  projectId: string
  createdAt: string
}

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

export interface MemoryEntryDto {
  id: string
  projectId: string
  type: string
  content: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

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

export interface AIProjectAnswer {
  provider: string
  providerId: string
  taskType: AITaskType
  answer: AIAnalysisResponse
  tasks: TaskDto[]
  usage: AIUsageDto | null
}

export interface AgentEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'done' | 'error' | 'file_diff'
  message: string
  payload?: any
}

export interface FileDiffEntry {
  filePath: string
  before: string | null   // null = archivo nuevo
  after: string
  taskId?: string
}
