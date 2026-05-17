import type { AgentProfile } from './agent.types'

export class AgentManager {
  listProfiles(): AgentProfile[] {
    return [
      {
        id: 'documentation-agent',
        name: 'Documentation Agent',
        taskType: 'documentation',
        preferredProviderTypes: ['anthropic', 'gemini', 'openai'],
        requiresConfirmation: false,
        description: 'Genera y mantiene documentacion del proyecto.'
      },
      {
        id: 'code-agent',
        name: 'Code Agent',
        taskType: 'code-generation',
        preferredProviderTypes: ['deepseek', 'openai', 'anthropic'],
        requiresConfirmation: true,
        description: 'Propone cambios de codigo, siempre pendiente de aprobacion.'
      },
      {
        id: 'local-agent',
        name: 'Local Agent',
        taskType: 'analysis',
        preferredProviderTypes: ['deepseek', 'gemini'],
        requiresConfirmation: false,
        description: 'Usa modelos locales para analisis privado.'
      }
    ]
  }
}
