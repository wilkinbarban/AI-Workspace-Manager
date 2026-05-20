/** Mapa unico de canales IPC para evitar strings duplicados entre main y preload. */
export const IPC_CHANNELS = {
  projects: {
    openProject: 'projects:openProject',
    getProjects: 'projects:getProjects',
    cleanInactiveProjects: 'projects:cleanInactiveProjects'
  },
  workspace: {
    scanProject: 'workspace:scanProject',
    getLatestScan: 'workspace:getLatestScan'
  },
  ai: {
    askProject: 'ai:askProject',
    runAgent: 'ai:runAgent',
    agentEvent: 'ai:agentEvent'
  },
  tasks: {
    list: 'tasks:list',
    create: 'tasks:create',
    complete: 'tasks:complete'
  },
  memory: {
    list: 'memory:list'
  },
  settings: {
    saveAIProvider: 'settings:saveAIProvider',
    listAIProviders: 'settings:listAIProviders',
    listAIProviderManifests: 'settings:listAIProviderManifests',
    getAISetupState: 'settings:getAISetupState',
    testAIProviderConfig: 'settings:testAIProviderConfig',
    getAIUsageSummary: 'settings:getAIUsageSummary'
  }
} as const
