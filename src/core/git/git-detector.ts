import path from 'node:path'
import fs from 'fs-extra'

export async function hasGitRepository(workspacePath: string): Promise<boolean> {
  return fs.pathExists(path.join(workspacePath, '.git'))
}
