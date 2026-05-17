import { prisma, stringifyJson } from '@database/client'
import { AgentRunner } from '@core/ai/agents/agent-runner'
import type { AgentEvent } from '@shared/types/workspace'
import { toWorkspaceScanDto } from '@database/mappers'
import { aiProviderRegistry } from '@core/ai/core/ai-provider-registry'
import { chooseProviderId } from '@core/ai/core/ai-router'
import { buildProjectContext } from '@core/workspace/project-context'
import { buildAnalyzeProjectPrompt } from '@core/ai/prompts/analyze-project.prompt'
import type { AIProjectAnswer, AITaskType } from '@shared/types/workspace'
import { AIProviderService } from './ai-provider-service'
import { AIUsageService } from './ai-usage-service'
import { TaskService } from './task-service'
import { MemoryService } from './memory-service'

export class AIOrchestrator {
  private readonly providerService = new AIProviderService()
  private readonly usageService = new AIUsageService()
  private readonly taskService = new TaskService()
  private readonly memoryService = new MemoryService()

  async askProject(input: {
    projectId: string
    message: string
    providerId?: string
    taskType?: AITaskType
  }, onEvent?: (event: import('@shared/types/workspace').AgentEvent) => void): Promise<AIProjectAnswer> {
    const taskType = input.taskType ?? 'analysis'
    const scan = await prisma.workspaceScan.findFirst({
      where: { projectId: input.projectId },
      orderBy: { createdAt: 'desc' }
    })

    if (!scan) {
      throw new Error('Ejecuta un analisis del workspace antes de consultar la IA.')
    }

    const configuredProviders = await this.providerService.list()
    const selectedProviderId = chooseProviderId({
      requestedProviderId: input.providerId,
      taskType,
      providers: configuredProviders
    })
    const provider = await this.providerService.getActiveProvider(selectedProviderId ?? undefined)

    if (!provider) {
      throw new Error('Configura al menos un proveedor IA antes de consultar la IA.')
    }

    const adapter = aiProviderRegistry.get(provider.type)
    const apiKey = await this.providerService.getApiKey(provider)
    const validation = adapter.validateConfig({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      authType: provider.authType,
      apiKey,
      baseUrl: provider.baseUrl,
      model: provider.model
    })

    if (!validation.ok) {
      throw new Error(validation.message)
    }

    const scanDto = toWorkspaceScanDto(scan)
    const existingTasks = await this.taskService.list(input.projectId)
    
    const taskContext = existingTasks.length > 0
      ? `\n\nATENCIÓN: Tareas que YA EXISTEN O ESTÁN RESUELTAS en la base de datos (PROHIBIDO proponer estas u otras similares):\n${existingTasks.map(t => `- [${t.status}] ${t.title}`).join('\n')}`
      : ''
      
    const strictRules = '\n\nREGLA CRÍTICA: Revisa detenidamente el FileTree de la estructura del proyecto. Si YA existe README.md, documentation o similares, BAJO NINGÚN CONCEPTO propongas tareas para crearlos. Solo propone tareas NUEVAS y ESPECÍFICAS para la opción seleccionada.'

    const prompt = buildAnalyzeProjectPrompt({
      userMessage: input.message,
      projectContext: buildProjectContext(scanDto) + taskContext + strictRules
    })
    
    onEvent?.({ type: 'thinking', message: `Iniciando análisis de tipo: ${taskType}... estructurando plan y tareas.` })

    const result = await adapter.chat(
      {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        authType: provider.authType,
        apiKey,
        baseUrl: provider.baseUrl,
        model: provider.model
      },
      {
        taskType,
        responseFormat: 'json',
        messages: [
          {
            role: 'system',
            content: 'Responde como arquitecto senior de software. Devuelve json valido y nada mas.'
          },
          { role: 'user', content: prompt }
        ]
      }
    )

    if (result.reasoningContent) {
      onEvent?.({ type: 'thinking', message: result.reasoningContent })
    }

    const answer = result.analysis
    if (!answer) {
      onEvent?.({ type: 'error', message: 'La respuesta de la IA no contenía un análisis JSON válido.' })
      throw new Error('La respuesta de la IA no contenía un análisis JSON válido.')
    }
    
    onEvent?.({ type: 'done', message: 'Diagnóstico completado.' })
    const tasks = await this.taskService.createFromAI(input.projectId, answer)
    const usage = await this.usageService.record({ provider, taskType, usage: result.usage })

    await prisma.report.create({
      data: {
        projectId: input.projectId,
        title: `Analisis IA - ${provider.name}`,
        summary: answer.summary,
        payloadJson: stringifyJson({ answer, usage, provider: provider.name, taskType })
      }
    })

    await this.memoryService.remember({
      projectId: input.projectId,
      type: 'ai-analysis',
      content: answer.summary,
      metadata: {
        provider: provider.name,
        providerId: provider.id,
        model: provider.model,
        taskType,
        riskLevel: answer.riskLevel,
        tasksCreated: tasks.length
      }
    })

    return {
      provider: provider.name,
      providerId: provider.id,
      taskType,
      answer,
      tasks,
      usage
    }
  }

  async runAgent(
    input: { projectId: string; prompt: string; providerId?: string },
    onEvent: (event: AgentEvent) => void
  ): Promise<string> {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } })
    if (!project) throw new Error('Proyecto no encontrado')

    const configuredProviders = await this.providerService.list()
    const selectedProviderId = chooseProviderId({
      requestedProviderId: input.providerId,
      taskType: 'agent',
      providers: configuredProviders
    })
    const provider = await this.providerService.getActiveProvider(selectedProviderId ?? undefined)

    if (!provider) {
      throw new Error('Configura al menos un proveedor IA antes de ejecutar el Agente.')
    }

    const adapter = aiProviderRegistry.get(provider.type)
    const apiKey = await this.providerService.getApiKey(provider)

    const runner = new AgentRunner({
      provider: adapter,
      config: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        authType: provider.authType,
        apiKey,
        baseUrl: provider.baseUrl,
        model: provider.model
      },
      context: {
        projectId: project.id,
        projectPath: project.path
      },
      onEvent
    })

    return runner.run(input.prompt)
  }
}
