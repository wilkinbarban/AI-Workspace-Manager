import type { WorkspaceHealth } from '@shared/types/workspace'

const labels: Array<{ key: keyof WorkspaceHealth; label: string; pill: string }> = [
  { key: 'architecture', label: 'Arquitectura', pill: 'timeline-thinking' },
  { key: 'documentation', label: 'Documentacion', pill: 'timeline-read' },
  { key: 'dependencies', label: 'Dependencias', pill: 'timeline-grep' },
  { key: 'tests', label: 'Tests', pill: 'timeline-edit' },
  { key: 'security', label: 'Seguridad', pill: 'timeline-done' },
  { key: 'git', label: 'Git', pill: 'timeline-read' },
  { key: 'docker', label: 'Docker', pill: 'timeline-grep' },
  { key: 'modularity', label: 'Modularidad', pill: 'timeline-thinking' },
  { key: 'maintainability', label: 'Mantenibilidad', pill: 'timeline-edit' }
]

export function MetricGrid({ health }: { health: WorkspaceHealth }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {labels.map((item) => (
        <div key={item.key} className="feature-card">
          <div className="flex items-center justify-between gap-3">
            <span className={`timeline-pill ${item.pill}`}>{item.label}</span>
            <span className="fact-value">{health[item.key]}%</span>
          </div>
          <div className="metric-track mt-5">
            <div className="metric-fill" style={{ width: `${Math.max(0, Math.min(100, health[item.key]))}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
