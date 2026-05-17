import type { AITaskType } from '@shared/types/workspace'

export interface AgentProfile {
  id: string
  name: string
  taskType: AITaskType
  preferredProviderTypes: string[]
  requiresConfirmation: boolean
  description: string
}
