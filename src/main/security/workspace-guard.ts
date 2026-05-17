import path from 'node:path'
import fs from 'fs-extra'
import { AppError } from '@shared/errors/AppError'

export async function assertDirectory(workspacePath: string): Promise<string> {
  const resolved = path.resolve(workspacePath)
  const stat = await fs.stat(resolved).catch(() => null)

  if (!stat || !stat.isDirectory()) {
    throw new AppError('La ruta seleccionada no es una carpeta valida.', 'INVALID_WORKSPACE_PATH')
  }

  return resolved
}
