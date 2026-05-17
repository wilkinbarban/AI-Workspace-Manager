import path from 'node:path'
import fs from 'fs-extra'

export async function hasDockerConfiguration(workspacePath: string): Promise<boolean> {
  return (
    (await fs.pathExists(path.join(workspacePath, 'Dockerfile'))) ||
    (await fs.pathExists(path.join(workspacePath, 'docker-compose.yml'))) ||
    (await fs.pathExists(path.join(workspacePath, 'docker-compose.yaml')))
  )
}
