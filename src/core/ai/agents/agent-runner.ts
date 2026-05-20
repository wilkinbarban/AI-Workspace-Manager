import { allSkills } from '../skills'
import type { AIProviderAdapter, AIProviderRuntimeConfig, AIChatMessage } from '../core/ai-provider.interface'
import type { SkillContext } from '../skills/skill.types'
import type { AgentEvent } from '@shared/types/workspace'

/** Dependencias necesarias para ejecutar un agente con proveedor, contexto y stream de eventos. */
export interface AgentRunnerOptions {
  provider: AIProviderAdapter
  config: AIProviderRuntimeConfig
  context: SkillContext
  onEvent: (event: AgentEvent) => void
}

/** Bucle agente-herramientas: conversa con el LLM, ejecuta skills y devuelve resultado final. */
export class AgentRunner {
  /** Las opciones se inyectan para mantener el runner desacoplado de servicios Electron/Prisma. */
  constructor(private readonly options: AgentRunnerOptions) {}

  /** Ejecuta un prompt hasta que el modelo deje de solicitar herramientas o alcance el limite. */
  async run(prompt: string): Promise<string> {
    // Historial completo enviado en cada iteracion para proveedores sin estado de sesion.
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

    // Convierte skills internas al formato generico de function calling.
    const tools = allSkills.map(skill => ({
      type: 'function' as const,
      function: {
        name: skill.name,
        description: skill.description,
        parameters: skill.schema as unknown as Record<string, unknown>
      }
    }))

    // Limite defensivo para evitar loops infinitos de tool calling.
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
          taskType: 'analysis',
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
                // Los argumentos llegan como JSON string emitido por el proveedor IA.
                const args = JSON.parse(toolCall.function.arguments || '{}')
                // Extiende el contexto con reporte de diffs sin dar mas permisos al agente.
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
                const rawToolResult = await skill.execute(args, contextWithDiff)
                toolResult = String(rawToolResult)
              } catch (error) {
                toolResult = `Error ejecutando herramienta: ${errorMessage(error)}`
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
          // Sin tool calls pendientes: el agente termino y la respuesta es final.
          this.options.onEvent({
            type: 'done',
            message: 'Agente ha terminado su tarea.'
          })
          return result.content || ''
        }
      } catch (error) {
        this.options.onEvent({
          type: 'error',
          message: `Error en la comunicación con el LLM: ${errorMessage(error)}`
        })
        throw error
      }
    }

    const maxErr = 'Se alcanzó el límite máximo de iteraciones del agente.'
    this.options.onEvent({ type: 'error', message: maxErr })
    return maxErr
  }
}

/** Normaliza errores desconocidos a mensaje legible para eventos del agente. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido.'
}
