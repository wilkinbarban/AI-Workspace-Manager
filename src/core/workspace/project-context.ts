import type { WorkspaceScanDto } from '@shared/types/workspace'

export function buildProjectContext(scan: WorkspaceScanDto): string {
  return JSON.stringify(
    {
      summary: scan.summary,
      dependencies: scan.dependencies.slice(0, 80),
      problems: scan.problems,
      recommendations: scan.recommendations,
      health: scan.health,
      fileTree: scan.fileTree.slice(0, 80)
    },
    null,
    2
  )
}
