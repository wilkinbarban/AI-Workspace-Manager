import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/ipc'
import type { AppApi } from '@shared/types/api'
import type { AgentEvent } from '@shared/types/workspace'

const api: AppApi = {
  projects: {
    openProject: () => ipcRenderer.invoke(IPC_CHANNELS.projects.openProject),
    getProjects: () => ipcRenderer.invoke(IPC_CHANNELS.projects.getProjects),
    cleanInactiveProjects: (activeProjectId) => ipcRenderer.invoke(IPC_CHANNELS.projects.cleanInactiveProjects, activeProjectId)
  },
  workspace: {
    scanProject: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.workspace.scanProject, projectId),
    getLatestScan: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.workspace.getLatestScan, projectId)
  },
  ai: {
    askProject: (input) => ipcRenderer.invoke(IPC_CHANNELS.ai.askProject, input),
    runAgent: (input) => ipcRenderer.invoke(IPC_CHANNELS.ai.runAgent, input),
    onAgentEvent: (callback) => {
      const listener = (_event: IpcRendererEvent, payload: AgentEvent) => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.ai.agentEvent, listener)
      return () => ipcRenderer.off(IPC_CHANNELS.ai.agentEvent, listener)
    }
  },
  tasks: {
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.tasks.list, projectId),
    create: (projectId, input) => ipcRenderer.invoke(IPC_CHANNELS.tasks.create, { projectId, input }),
    complete: (taskId) => ipcRenderer.invoke(IPC_CHANNELS.tasks.complete, taskId)
  },
  memory: {
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.memory.list, projectId)
  },
  settings: {
    saveAIProvider: (input) => ipcRenderer.invoke(IPC_CHANNELS.settings.saveAIProvider, input),
    listAIProviders: () => ipcRenderer.invoke(IPC_CHANNELS.settings.listAIProviders),
    listAIProviderManifests: () => ipcRenderer.invoke(IPC_CHANNELS.settings.listAIProviderManifests),
    getAISetupState: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getAISetupState),
    testAIProviderConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.settings.testAIProviderConfig, input),
    getAIUsageSummary: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getAIUsageSummary)
  }
}

contextBridge.exposeInMainWorld('api', api)
