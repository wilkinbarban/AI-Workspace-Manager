import type { ViewKey } from '@renderer/hooks/useWorkspaceManager'

const items: Array<{ key: ViewKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'settings', label: 'AI' }
]

interface SidebarProps {
  activeView: ViewKey
  onChange: (view: ViewKey) => void
}

export function Sidebar({ activeView, onChange }: SidebarProps) {
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1" aria-label="Navegacion principal">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={['nav-tab', activeView === item.key ? 'nav-tab-active' : ''].join(' ')}
          title={item.label}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
