import type { AppApi } from '@shared/types/api'
import { webSocketApi } from './websocket-api'

/** API activa del renderer: Electron usa preload/IPC; navegador usa WebSocket local. */
export const appApi: AppApi = window.api ?? webSocketApi
