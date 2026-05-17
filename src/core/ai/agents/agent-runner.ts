import { allSkills } from '../skills'
import type { AIProviderAdapter, AIProviderRuntimeConfig, AIChatMessage } from '../core/ai-provider.interface'
import type { SkillContext } from '../skills/skill.types'
import type { AgentEvent } from '@shared/types/workspace'

export interface AgentRunnerOptions {
  provider: AIProviderAdapter
  config: AIProviderRuntimeConfig
  context: SkillContext
  onEvent: (event: AgentEvent) => void
}

export class AgentRunner {
  constructor(private readonly options: AgentRunnerOptions) {}

  async run(prompt: string): Promise<string> {
    const messages: AIChatMessage[] = [
      {
        role: 'system',
        content: `Eres un Agente de IA experto en desarrollo de software trabajando en el proyecto ubicado en ${this.options.context.projectPath}. 
Tienes acceso a herramientas para interactuar con el proyecto del usuario. 
Si necesitas entender el contexto, usa listDir o readFile. 
Si la tarea implica corregir bugs, refactorizar o crear código, USA la herramienta writeFile para aplicar los cambios en el proyecto de forma autónoma.
Responde siempre de forma analítica y útil. REGLA MUY IMPORTANTE: Cuando termines de realizar TODOS los cambios solicitados en los archivos, NO LLAMES A MÁS HERRAMIENTAS. Solo envía una respuesta final en texto plano/markdown informando lo que hiciste para dar por concluida la ejecución.`
      },
      {
        role: 'user',
        content: prompt
      }
    ]

    const tools = allSkills.map(skill => ({
      type: 'function',
      function: {
        name: skill.name,
        description: skill.description,
        parameters: skill.schema
      }
    }))

    const MAX_ITERATIONS = 40
    let iterations = 0

    while (iterations < MAX_ITERATIONS) {
      iterations++
      this.options.onEvent({
        type: 'thinking',
        message: 'Esperando respuesta del LLM...'
      })

      try {
        const result = await this.options.provider.chat(this.options.config, {
          taskType: 'analysis' as any,
          responseFormat: 'text',
          messages,
          tools
        })

        const assistantMessage: AIChatMessage = {
          role: 'assistant',
          content: result.content,
          reasoning_content: result.reasoningContent,
          tool_calls: result.toolCalls
        }
        messages.push(assistantMessage)

        if (result.toolCalls && result.toolCalls.length > 0) {
          for (const toolCall of result.toolCalls) {
            this.options.onEvent({
              type: 'tool_call',
              message: `Ejecutando ${toolCall.function.name}...`,
              payload: toolCall.function
            })
            
            const skill = allSkills.find(s => s.name === toolCall.function.name)
            let toolResult = ''

            if (!skill) {
              toolResult = `Error: Herramienta ${toolCall.function.name} no encontrada.`
            } else {
              try {
                const args = JSON.parse(toolCall.function.arguments || '{}')
                const contextWithDiff = {
                  ...this.options.context,
                  onFileDiff: (diff: { filePath: string; before: string | null; after: string }) => {
                    this.options.onEvent({
                      type: 'file_diff',
                      message: `Diff: ${diff.filePath}`,
                      payload: diff
                    })
                  }
                }
                toolResult = await skill.execute(args, contextWithDiff)
              } catch (err: any) {
                toolResult = `Error ejecutando herramienta: ${err.message}`
              }
            }

            this.options.onEvent({
              type: 'tool_result',
              message: `Resultado de ${toolCall.function.name}`,
              payload: { result: toolResult }
            })

            messages.push({
              role: 'tool',
              content: String(toolResult),
              name: toolCall.function.name,
              tool_call_id: toolCall.id
            })
          }
        } else {
          // No tool calls, we are done
          this.options.onEvent({
            type: 'done',
            message: 'Agente ha terminado su tarea.'
          })
          return result.content || ''
        }
      } catch (err: any) {
        this.options.onEvent({
          type: 'error',
          message: `Error en la comunicación con el LLM: ${err.message}`
        })
        throw err
      }
    }

    const maxErr = 'Se alcanzó el límite máximo de iteraciones del agente.'
    this.options.onEvent({ type: 'error', message: maxErr })
    return maxErr
  }
}
