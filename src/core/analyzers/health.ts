import type { WorkspaceHealth } from '@shared/types/workspace'

export function healthLabel(health: WorkspaceHealth): string {
  if (health.score >= 80) return 'Saludable'
  if (health.score >= 60) return 'Mejorable'
  return 'Necesita atencion'
}
