import path from 'node:path'

export function isPathInsideWorkspace(workspacePath: string, targetPath: string): boolean {
  const workspace = path.resolve(workspacePath)
  const target = path.resolve(targetPath)
  const relative = path.relative(workspace, target)

  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}
