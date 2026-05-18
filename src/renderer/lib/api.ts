import type { AppApi } from '@shared/types/api'
import type { ProjectDto, WorkspaceScanDto } from '@shared/types/workspace'

const now = new Date().toISOString()

const demoProject: ProjectDto = {
  id: 'demo-project',
  name: 'AI Workspace Manager',
  path: 'D:/workspaces/ai-workspace-manager',
  language: 'TypeScript',
  framework: 'Electron',
  healthScore: 74,
  createdAt: now,
  updatedAt: now
}

const demoScan: WorkspaceScanDto = {
  id: 'demo-scan',
  projectId: demoProject.id,
  createdAt: now,
  summary: {
    projectName: demoProject.name,
    mainLanguage: 'TypeScript',
    framework: 'Electron',
    hasDocker: false,
    hasGit: true,
    hasReadme: true,
    hasLicense: true,
    hasTests: false,
    totalFiles: 64,
    largeFiles: [],
    ignoredDirectories: ['node_modules', '.git', 'dist', 'build']
  },
  fileTree: [
    {
      name: 'src',
      relativePath: 'src',
      kind: 'directory',
      children: [
        { name: 'main', relativePath: 'src/main', kind: 'directory', children: [] },
        { name: 'renderer', relativePath: 'src/renderer', kind: 'directory', children: [] },
        { name: 'shared', relativePath: 'src/shared', kind: 'directory', children: [] }
      ]
    },
    { name: 'DESIGN.md', relativePath: 'DESIGN.md', kind: 'file' },
    { name: 'package.json', relativePath: 'package.json', kind: 'file' }
  ],
  dependencies: ['electron', 'react', 'typescript', 'prisma', 'tailwindcss'],
  problems: ['No hay tests detectables.', 'No hay configuracion Docker detectable.'],
  recommendations: ['Agregar pruebas basicas para los flujos principales.', 'Mantener el renderer como fuente visual compartida.'],
  health: {
    score: 74,
    architecture: 82,
    documentation: 88,
    dependencies: 76,
    tests: 20,
    security: 78,
    git: 90,
    docker: 35,
    modularity: 80,
    maintainability: 78
  }
}

const webDemoApi: AppApi = {
  projects: {
    openProject: async () => demoProject,
    getProjects: async () => [demoProject],
    cleanInactiveProjects: async () => {}
  },
  workspace: {
    scanProject: async () => demoScan,
    getLatestScan: async () => demoScan
  },
  ai: {
    askProject: async () => ({
      provider: 'DeepSeek demo',
      providerId: 'demo-provider',
      taskType: 'analysis',
      answer: {
        summary: 'Demo web: el renderer comparte la misma estetica del desktop y usa datos simulados sin acceso local.',
        problems: demoScan.problems,
        recommendations: demoScan.recommendations,
        tasks: [
          {
            title: 'Crear pruebas base del renderer',
            description: 'Cubrir dashboard, tareas, memoria y configuracion.',
            riskLevel: 'low'
          }
        ],
        riskLevel: 'low'
      },
      tasks: [
        {
          id: 'demo-task-ai',
          projectId: demoProject.id,
          title: 'Crear pruebas base del renderer',
          description: 'Cubrir dashboard, tareas, memoria y configuracion.',
          status: 'pending',
          source: 'ai',
          riskLevel: 'low',
          createdAt: now,
          updatedAt: now
        }
      ],
      usage: {
        id: 'demo-usage-1',
        providerId: 'demo-provider',
        providerName: 'DeepSeek demo',
        providerType: 'deepseek',
        model: 'deepseek-v4-flash',
        taskType: 'analysis',
        inputTokens: 1200,
        outputTokens: 380,
        totalTokens: 1580,
        estimatedCostUsd: 0.00027,
        remainingTokens: 198420,
        isEstimate: true,
        createdAt: now
      }
    }),
    runAgent: async () => 'demo-run',
    onAgentEvent: () => () => {}
  },
  tasks: {
    list: async () => [
      {
        id: 'demo-task-1',
        projectId: demoProject.id,
        title: 'Alinear desktop y web con DESIGN.md',
        description: 'Aplicar canvas crema, CTA naranja, mockup IDE y timeline pills.',
        status: 'pending',
        source: 'demo',
        riskLevel: 'low',
        createdAt: now,
        updatedAt: now
      }
    ],
    create: async (_projectId, input) => ({
      id: `demo-task-${Date.now()}`,
      projectId: demoProject.id,
      title: input.title,
      description: input.description ?? null,
      status: 'pending',
      source: 'web-demo',
      riskLevel: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }),
    complete: async (taskId) => ({
      id: taskId,
      projectId: demoProject.id,
      title: 'Mock completed task',
      description: null,
      status: 'completed',
      source: 'demo',
      riskLevel: null,
      createdAt: now,
      updatedAt: new Date().toISOString()
    })
  },
  memory: {
    list: async () => [
      {
        id: 'demo-memory-1',
        projectId: demoProject.id,
        type: 'design',
        content: 'El renderer usa la estetica Cursor del DESIGN.md: editorial, crema, naranja y panes tipo IDE.',
        metadata: null,
        createdAt: now
      }
    ]
  },
  settings: {
    saveAIProvider: async (input) => ({
      id: input.id ?? 'demo-provider',
      name: input.name,
      type: input.type as any,
      authType: (input.authType as any) ?? 'bearer',
      baseUrl: input.baseUrl || 'https://api.deepseek.com',
      model: input.model,
      maskedSecret: input.apiKey ? 'sk-****demo' : null,
      isDefault: input.isDefault ?? true,
      enabled: input.enabled ?? true,
      monthlyTokenLimit: input.monthlyTokenLimit ?? 200000,
      taskDefaults: input.taskDefaults ?? {},
      metadata: { demo: true },
      createdAt: now,
      updatedAt: new Date().toISOString()
    }),
    listAIProviders: async () => [
      {
        id: 'demo-provider',
        name: 'DeepSeek demo',
        type: 'deepseek',
        authType: 'bearer',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        maskedSecret: 'sk-****demo',
        isDefault: true,
        enabled: true,
        monthlyTokenLimit: 200000,
        taskDefaults: { analysis: true, 'code-generation': true },
        metadata: { demo: true },
        createdAt: now,
        updatedAt: now
      }
    ],
    listAIProviderManifests: async () => [
      {
        type: 'openai',
        name: 'OpenAI / GPT / Codex',
        authType: 'bearer',
        defaultBaseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4.1-mini',
        availableModels: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'o3', 'o4-mini'],
        description: 'Modelos GPT y Codex mediante API Key.',
        requiresApiKey: true,
        oauthPrepared: false,
        supportsStreaming: true,
        supportsTools: true,
        supportsVision: true,
        supportsLocal: false,
        status: 'ready'
      },
      {
        type: 'deepseek',
        name: 'DeepSeek',
        authType: 'bearer',
        defaultBaseUrl: 'https://api.deepseek.com',
        defaultModel: 'deepseek-v4-flash',
        availableModels: ['deepseek-v4-pro', 'deepseek-v4-flash'],
        description: 'Analisis y razonamiento con costo bajo.',
        requiresApiKey: true,
        oauthPrepared: false,
        supportsStreaming: true,
        supportsTools: false,
        supportsVision: false,
        supportsLocal: false,
        status: 'ready'
      },
      {
        type: 'anthropic',
        name: 'Anthropic Claude',
        authType: 'x-api-key',
        defaultBaseUrl: 'https://api.anthropic.com/v1',
        defaultModel: 'claude-sonnet-4-6',
        availableModels: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5'],
        description: 'Claude con API Key en header x-api-key.',
        requiresApiKey: true,
        oauthPrepared: false,
        supportsStreaming: true,
        supportsTools: true,
        supportsVision: true,
        supportsLocal: false,
        status: 'ready'
      },
      {
        type: 'gemini',
        name: 'Google Gemini',
        authType: 'api-key',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        defaultModel: 'gemini-2.5-flash',
        availableModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
        description: 'Gemini con API Key. Arquitectura lista para OAuth futuro.',
        requiresApiKey: true,
        oauthPrepared: true,
        supportsStreaming: true,
        supportsTools: false,
        supportsVision: true,
        supportsLocal: false,
        status: 'ready'
      },
      {
        type: 'openrouter',
        name: 'OpenRouter',
        authType: 'bearer',
        defaultBaseUrl: 'https://openrouter.ai/api/v1',
        defaultModel: 'openai/gpt-4.1-mini',
        availableModels: ['openai/gpt-4.1', 'openai/gpt-4.1-mini', 'openai/gpt-4.1-nano', 'openai/gpt-4o', 'openai/o4-mini', 'anthropic/claude-sonnet-4-6', 'anthropic/claude-opus-4-7', 'google/gemini-2.5-pro', 'google/gemini-2.5-flash', 'deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash'],
        description: 'Router multi-modelo compatible con OpenAI.',
        requiresApiKey: true,
        oauthPrepared: false,
        supportsStreaming: true,
        supportsTools: true,
        supportsVision: true,
        supportsLocal: false,
        status: 'ready'
      }
    ],
    getAISetupState: async () => ({ hasConfiguredProvider: true, defaultProviderId: 'demo-provider' }),
    testAIProviderConfig: async () => ({ ok: true, message: 'Demo web sin conexion real. En desktop se prueba el proveedor seleccionado.' }),
    getAIUsageSummary: async () => ({
      totalInputTokens: 1200,
      totalOutputTokens: 380,
      totalTokens: 1580,
      estimatedCostUsd: 0.00027,
      byProvider: [
        {
          providerName: 'DeepSeek demo',
          totalTokens: 1580,
          estimatedCostUsd: 0.00027,
          monthlyTokenLimit: 200000,
          estimatedRemainingTokens: 198420
        }
      ],
      history: [
        {
          id: 'demo-usage-1',
          providerId: 'demo-provider',
          providerName: 'DeepSeek demo',
          providerType: 'deepseek',
          model: 'deepseek-v4-flash',
          taskType: 'analysis',
          inputTokens: 1200,
          outputTokens: 380,
          totalTokens: 1580,
          estimatedCostUsd: 0.00027,
          remainingTokens: 198420,
          isEstimate: true,
          createdAt: now
        }
      ]
    })
  }
}

export const appApi: AppApi = window.api ?? webDemoApi
