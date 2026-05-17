import fs from 'fs-extra'
import { isPathInsideWorkspace } from '@core/utils/path-security'

export class FileManager {
  async readFile(workspacePath: string, targetPath: string): Promise<string> {
    if (!isPathInsideWorkspace(workspacePath, targetPath)) {
      throw new Error('No se permite leer archivos fuera del workspace.')
    }

    return fs.readFile(targetPath, 'utf8')
  }
}
