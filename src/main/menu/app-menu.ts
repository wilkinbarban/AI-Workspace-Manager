import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/ipc'

type MenuAction =
  | 'ai-settings'
  | 'ai-add'
  | 'ai-edit'
  | 'ai-delete'
  | 'ai-test'
  | 'ai-default'
  | 'ai-usage'
  | 'ai-models'

export function setupApplicationMenu(): void {
  const send = (action: MenuAction) => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    window?.webContents.send(IPC_CHANNELS.menu.action, action)
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Archivo',
      submenu: [{ role: 'quit', label: 'Salir' }]
    },
    {
      label: 'IA',
      submenu: [
        { label: 'Configurar proveedores de IA', click: () => send('ai-settings') },
        { label: 'Agregar nueva IA', click: () => send('ai-add') },
        { label: 'Editar IA existente', click: () => send('ai-edit') },
        { label: 'Eliminar IA configurada', click: () => send('ai-delete') },
        { type: 'separator' },
        { label: 'Probar conexion', click: () => send('ai-test') },
        { label: 'Seleccionar IA predeterminada', click: () => send('ai-default') },
        { type: 'separator' },
        { label: 'Ver consumo de tokens', click: () => send('ai-usage') },
        { label: 'Abrir panel de modelos disponibles', click: () => send('ai-models') }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom real' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' }
      ]
    }
  ]

  Menu.setApplicationMenu(null)
}
