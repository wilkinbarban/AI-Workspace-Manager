import { FormEvent, useEffect, useRef, useState } from 'react'
import type {
  AIProjectAnswer,
  AIAuthType,
  AIProviderManifest,
  AIProviderDto,
  AIProviderType,
  AIUsageSummaryDto,
  AITaskType,
  MemoryEntryDto,
  ProjectDto,
  TaskDto,
  WorkspaceScanDto,
  AgentEvent
} from '@shared/types/workspace'
import { useWorkspaceManager } from './hooks/useWorkspaceManager'

export default function App() {
  const manager = useWorkspaceManager()

  return (
    <div className="app-shell flex h-screen flex-col overflow-hidden">
      <header className="top-nav sticky top-0 z-20 flex items-center">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="min-w-56">
            <div className="brand-mark">AI Workspace Manager</div>
            <div className="brand-subtitle">Project control center</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" type="button" onClick={manager.openProject} disabled={manager.isBusy}>
              Abrir Proyecto
            </button>
            <button className="btn-primary" type="button" onClick={manager.cleanInactiveProjects} disabled={manager.isBusy || !manager.selectedProject}>
              Limpiar Inactivos
            </button>
          </div>
        </div>
      </header>

      <main className="app-content flex-1 overflow-y-auto">
        <div className="content-frame">

          {/* Gate: if no AI provider is configured, redirect to settings */}
          {!manager.activeProvider ? (
            <AISetupGate
              manifests={manager.providerManifests}
              isBusy={manager.isBusy}
              onSaveProvider={manager.saveProvider}
              onTestProviderConfig={manager.testProviderConfig}
            />
          ) : (
            <>
              <ProjectHeader
                project={manager.selectedProject}
                projects={manager.projects}
                selectedProjectId={manager.selectedProjectId}
                onSelectProject={manager.setSelectedProjectId}
              />

              <DashboardView manager={manager} />
            </>
          )}
        </div>
      </main>
      
      <StatusBar error={manager.error} notice={manager.notice} />
    </div>
  )
}

function ProjectHeader(props: {
  project: ProjectDto | null
  projects: ProjectDto[]
  selectedProjectId: string | null
  onSelectProject: (projectId: string) => void
}) {
  return (
    <section className="hero-band">
      <div>
        <div className="hero-eyebrow">AI Workspace Manager</div>
        <h1 className="hero-title">
          {props.project ? props.project.name : 'Sin proyecto activo'}
        </h1>
        {props.project && (
          <p className="hero-copy">{props.project.path}</p>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <select
          value={props.selectedProjectId ?? ''}
          onChange={(event) => props.onSelectProject(event.target.value)}
          className="input"
          style={{ width: 200, height: 34, padding: '4px 10px', fontSize: 13 }}
        >
          <option value="" disabled>Sin proyecto</option>
          {props.projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </div>
    </section>
  )
}

// ─── AI Setup Gate ───────────────────────────────────────────────────────────
// Shown instead of the dashboard when no AI provider is configured yet.
function AISetupGate(props: {
  manifests: AIProviderManifest[]
  isBusy: boolean
  onSaveProvider: (input: {
    name: string; type: AIProviderType; authType?: AIAuthType; baseUrl?: string
    model: string; apiKey?: string; monthlyTokenLimit?: number | null
    isDefault?: boolean; enabled?: boolean
  }) => void
  onTestProviderConfig: (input: {
    name: string; type: AIProviderType; authType?: AIAuthType; baseUrl?: string
    model: string; apiKey?: string
  }) => void
}) {
  const recommended = props.manifests.filter(m => ['deepseek', 'openai', 'anthropic', 'gemini', 'openrouter'].includes(m.type))
  const [type, setType] = useState<AIProviderType>(recommended[0]?.type ?? 'deepseek')
  const manifest = props.manifests.find(m => m.type === type) ?? recommended[0]
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(manifest?.defaultBaseUrl ?? '')
  const [model, setModel] = useState(manifest?.defaultModel ?? '')

  useEffect(() => {
    if (!manifest) return
    setBaseUrl(prev => prev || manifest.defaultBaseUrl || '')
    setModel(prev => prev || manifest.defaultModel)
  }, [manifest])

  function choose(nextType: AIProviderType) {
    const next = props.manifests.find(m => m.type === nextType)
    setType(nextType)
    setBaseUrl(next?.defaultBaseUrl ?? '')
    setModel(next?.defaultModel ?? '')
    setApiKey('')
  }

  if (!manifest) return null

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fadeIn">
      <div className="w-full max-w-lg">
        {/* Icon + title */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🤖</div>
          <h2 className="display-md">Configura tu primera IA</h2>
          <p className="body-copy mt-2">
            Para acceder al dashboard necesitas conectar al menos un proveedor de IA.
            Elige uno y pega tu API key — se guarda en el almacén seguro del sistema.
          </p>
        </div>

        {/* Provider chips */}
        <div className="flex flex-wrap gap-2 justify-center mb-5">
          {recommended.map(m => (
            <button
              key={m.type}
              type="button"
              onClick={() => choose(m.type)}
              className={'badge cursor-pointer transition-all ' + (m.type === type ? 'bg-[var(--color-primary)] text-white' : '')}
              style={{ height: 28, fontSize: 12 }}
            >
              {m.name}
            </button>
          ))}
        </div>

        {/* Quick form */}
        <form
          className="panel space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void props.onSaveProvider({
              name: manifest.name, type: manifest.type,
              authType: manifest.authType, baseUrl, model, apiKey,
              isDefault: true, enabled: true
            })
          }}
        >
          <div className="section-title">{manifest.name}</div>
          <p className="section-kicker">{manifest.description}</p>
          <input className="input" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="Base URL" />
          <select className="input" value={model} onChange={e => setModel(e.target.value)}>
            {manifest.availableModels.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {manifest.requiresApiKey && (
            <input className="input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="API Key" />
          )}
          <div className="flex gap-2">
            <button
              type="button" className="btn-secondary flex-1"
              disabled={props.isBusy || !model || (manifest.requiresApiKey && !apiKey.trim())}
              onClick={() => props.onTestProviderConfig({ name: manifest.name, type: manifest.type, authType: manifest.authType, baseUrl, model, apiKey })}
            >
              Probar conexión
            </button>
            <button
              className="btn-primary flex-1" type="submit"
              disabled={props.isBusy || !model || (manifest.requiresApiKey && !apiKey.trim())}
            >
              Guardar y continuar →
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Agent Monitor with drop zone ───────────────────────────────────────────
function AgentMonitor({ events, isRunning, onDropTask }: {
  events: AgentEvent[]
  isRunning: boolean
  onDropTask?: (task: TaskDto) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [events])

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave() {
    setIsDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const raw = e.dataTransfer.getData('application/json')
    if (!raw || !onDropTask) return
    try {
      const task = JSON.parse(raw) as TaskDto
      onDropTask(task)
    } catch { /* ignore */ }
  }

  return (
    <section
      className="ide-mockup-card"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        borderColor: isDragOver ? 'var(--color-primary)' : undefined,
        boxShadow: isDragOver ? '0 0 0 2px var(--color-primary)' : undefined
      }}
    >
      <div className="ide-toolbar" style={{ backgroundColor: 'var(--color-ink)', borderBottom: 'none' }}>
        <div className="flex items-center gap-2">
          <span className="window-dot window-dot-orange" />
          <span className="window-dot" style={{ backgroundColor: 'var(--color-body)' }} />
          <span className="window-dot" style={{ backgroundColor: 'var(--color-body)' }} />
        </div>
        <div className="section-kicker" style={{ color: 'var(--color-muted-soft)' }}>
          {isDragOver ? '⬇ Suelta para ejecutar la tarea' : 'Monitor del Agente Autónomo'}
        </div>
        <span className="badge" style={{ backgroundColor: isRunning ? 'var(--color-semantic-warning)' : isDragOver ? 'var(--color-primary)' : 'var(--color-surface-card)', color: isDragOver ? 'white' : undefined }}>
          {isRunning ? 'En Acción...' : isDragOver ? 'Soltar aquí' : 'En Espera'}
        </span>
      </div>

      {/* Drop overlay hint */}
      {isDragOver && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          style={{
            background: 'rgba(245,78,0,0.08)',
            borderRadius: 10,
            border: '2px dashed var(--color-primary)'
          }}
        >
          <div className="text-center">
            <div className="text-3xl mb-2">▶</div>
            <div className="font-semibold text-[13px]" style={{ color: 'var(--color-primary)' }}>
              Suelta para levantar el agente
            </div>
          </div>
        </div>
      )}

      <div
        ref={logRef}
        className="ide-pane p-3 font-mono text-[12px] leading-relaxed min-h-[300px] max-h-[440px] overflow-y-auto"
        style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-canvas)', borderRadius: 0, border: 'none', position: 'relative' }}
      >
        {events.length === 0 && !isDragOver && (
          <><span style={{ color: 'var(--color-timeline-read)' }}>›</span> El Agente está listo. Arrastra una tarea aquí o usa el botón en la tarea.<br/></>
        )}
        {events.map((ev, i) => (
          <div key={i} className="mb-1.5 animate-fadeIn">
            <span style={{ color:
              ev.type === 'thinking'    ? 'var(--color-semantic-warning)' :
              ev.type === 'tool_call'   ? '#A78BFA' :
              ev.type === 'tool_result' ? 'var(--color-semantic-success)' :
              ev.type === 'file_diff'   ? '#22D3EE' :
              ev.type === 'done'        ? '#34D399' :
              ev.type === 'error'       ? 'var(--color-semantic-error)' : 'var(--color-muted-soft)'
            }}>›</span>{' '}
            {ev.type === 'file_diff'
              ? <span style={{ color: '#22D3EE' }}>📝 Diff guardado: <strong>{ev.payload?.filePath}</strong></span>
              : ev.message
            }
            {ev.type === 'tool_call' && ev.payload && (
              <div className="ml-4 opacity-50 text-[10px] mt-0.5" style={{ whiteSpace: 'pre-wrap' }}>
                {ev.payload.arguments}
              </div>
            )}
            {ev.type === 'done' && (
              <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.1)] text-[#34D399]">
                ✓ Tarea completada con éxito.
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}


function DiffViewer({ diffs }: { diffs: import('@shared/types/workspace').FileDiffEntry[] }) {
  const [selected, setSelected] = useState<number>(0)

  if (diffs.length === 0) {
    return (
      <div className="ide-mockup-card">
        <div className="ide-toolbar" style={{ backgroundColor: 'var(--color-ink)', borderBottom: 'none' }}>
          <div className="flex items-center gap-2">
            <span className="window-dot window-dot-orange" />
            <span className="window-dot" style={{ backgroundColor: 'var(--color-body)' }} />
            <span className="window-dot" style={{ backgroundColor: 'var(--color-body)' }} />
          </div>
          <div className="section-kicker" style={{ color: 'var(--color-muted-soft)' }}>Diff Visual — Cambios del Agente</div>
          <span className="badge">Sin cambios aún</span>
        </div>
        <div className="p-8 text-center font-mono text-[13px]" style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-muted)' }}>
          <div className="mb-2" style={{ color: 'var(--color-timeline-read)' }}>›</div>
          Cuando el agente modifique archivos, el diff aparecerá aquí automáticamente.
        </div>
      </div>
    )
  }

  const current = diffs[selected]
  const beforeLines = (current.before ?? '').split('\n')
  const afterLines = current.after.split('\n')

  // Compute unified diff inline
  const diffLines: Array<{ type: 'add' | 'remove' | 'context'; content: string; lineNo?: number }> = []
  const maxLen = Math.max(beforeLines.length, afterLines.length)
  for (let i = 0; i < maxLen; i++) {
    const b = beforeLines[i]
    const a = afterLines[i]
    if (b === undefined) {
      diffLines.push({ type: 'add', content: a, lineNo: i + 1 })
    } else if (a === undefined) {
      diffLines.push({ type: 'remove', content: b, lineNo: i + 1 })
    } else if (b !== a) {
      diffLines.push({ type: 'remove', content: b, lineNo: i + 1 })
      diffLines.push({ type: 'add', content: a, lineNo: i + 1 })
    } else {
      diffLines.push({ type: 'context', content: b, lineNo: i + 1 })
    }
  }

  const additions = diffLines.filter(l => l.type === 'add').length
  const deletions = diffLines.filter(l => l.type === 'remove').length

  return (
    <div className="ide-mockup-card animate-[fadeIn_0.5s_ease-out]">
      {/* Toolbar */}
      <div className="ide-toolbar" style={{ backgroundColor: 'var(--color-ink)', borderBottom: '1px solid var(--color-hairline)' }}>
        <div className="flex items-center gap-2">
          <span className="window-dot window-dot-orange" />
          <span className="window-dot" style={{ backgroundColor: 'var(--color-body)' }} />
          <span className="window-dot" style={{ backgroundColor: 'var(--color-body)' }} />
        </div>
        <div className="section-kicker" style={{ color: 'var(--color-muted-soft)' }}>Diff Visual — Cambios del Agente</div>
        <div className="flex items-center gap-2">
          <span className="badge" style={{ backgroundColor: 'rgba(52,211,153,0.15)', color: '#34D399' }}>+{additions}</span>
          <span className="badge" style={{ backgroundColor: 'rgba(248,113,113,0.15)', color: '#F87171' }}>−{deletions}</span>
        </div>
      </div>

      {/* File tabs */}
      <div className="flex gap-0 overflow-x-auto border-b border-[var(--color-hairline)]" style={{ backgroundColor: 'var(--color-ink)' }}>
        {diffs.map((d, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSelected(i)}
            className="px-4 py-2 font-mono text-[12px] whitespace-nowrap transition-colors flex items-center gap-2 border-r border-[var(--color-hairline)] focus:outline-none"
            style={{
              backgroundColor: selected === i ? 'var(--color-surface-card)' : 'transparent',
              color: selected === i ? 'var(--color-body)' : 'var(--color-muted)',
              borderBottom: selected === i ? '2px solid var(--color-primary)' : '2px solid transparent'
            }}
          >
            {d.before === null && <span style={{ color: '#34D399', fontSize: 10 }}>NEW</span>}
            {d.filePath}
          </button>
        ))}
      </div>

      {/* Split header */}
      <div className="grid grid-cols-2 text-[11px] uppercase tracking-widest font-bold border-b border-[var(--color-hairline)]"
        style={{ backgroundColor: 'var(--color-ink)' }}>
        <div className="px-4 py-2 border-r border-[var(--color-hairline)]" style={{ color: '#F87171' }}>
          {current.before === null ? 'Archivo Nuevo' : '← Antes'}
        </div>
        <div className="px-4 py-2" style={{ color: '#34D399' }}>Después →</div>
      </div>

      {/* Side-by-side diff */}
      <div className="grid grid-cols-2 font-mono text-[12px] leading-5 max-h-[520px] overflow-y-auto"
        style={{ backgroundColor: 'var(--color-ink)' }}>
        {/* Before panel */}
        <div className="border-r border-[var(--color-hairline)] overflow-x-auto">
          {(current.before === null ? [] : beforeLines).map((line, i) => {
            const changed = afterLines[i] !== line
            return (
              <div key={i}
                className="flex items-start px-3 py-0.5 min-w-0"
                style={{
                  backgroundColor: changed ? 'rgba(248,113,113,0.08)' : 'transparent',
                  borderLeft: changed ? '3px solid #F87171' : '3px solid transparent'
                }}>
                <span className="select-none text-[10px] w-8 flex-shrink-0 text-right pr-3" style={{ color: 'var(--color-muted)' }}>{i + 1}</span>
                <span className={changed ? 'text-[#F87171]' : 'text-[var(--color-canvas)]'} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {changed ? '−' : ' '} {line}
                </span>
              </div>
            )
          })}
          {current.before === null && (
            <div className="p-4 text-center" style={{ color: 'var(--color-muted)' }}>Archivo creado por el agente</div>
          )}
        </div>

        {/* After panel */}
        <div className="overflow-x-auto">
          {afterLines.map((line, i) => {
            const changed = beforeLines[i] !== line || beforeLines[i] === undefined
            return (
              <div key={i}
                className="flex items-start px-3 py-0.5 min-w-0"
                style={{
                  backgroundColor: changed ? 'rgba(52,211,153,0.08)' : 'transparent',
                  borderLeft: changed ? '3px solid #34D399' : '3px solid transparent'
                }}>
                <span className="select-none text-[10px] w-8 flex-shrink-0 text-right pr-3" style={{ color: 'var(--color-muted)' }}>{i + 1}</span>
                <span className={changed ? 'text-[#34D399]' : 'text-[var(--color-canvas)]'} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {changed ? '+' : ' '} {line}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <div className="border border-[var(--color-hairline)] bg-[var(--color-surface-card)] rounded-[10px] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-canvas-soft)] transition-colors text-left focus:outline-none"
      >
        <h3 className="section-title text-[13px] m-0">{title}</h3>
        <span
          className="text-[var(--color-muted)] text-base font-mono leading-none transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}
        >
          ›
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-3 border-t border-[var(--color-hairline)] animate-slideDown">
          {children}
        </div>
      )}
    </div>
  )
}

function DashboardView({ manager }: { manager: ReturnType<typeof useWorkspaceManager> }) {
  const [step, setStep] = useState(1)

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (manager.isAgentRunning) {
        e.preventDefault()
        e.returnValue = 'Un agente está en ejecución. ¿Seguro que deseas salir y cancelar el proceso?'
        return e.returnValue
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [manager.isAgentRunning])

  const project = manager.selectedProject
  const scan = manager.latestScan

  if (!project) {
    return <EmptyState title="Sin proyecto" action="Abre una carpeta para crear el primer registro." />
  }

  if (!scan) {
    return <EmptyState title={project.name} action="Ejecuta el scanner para generar el dashboard." />
  }

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
            <ProjectHealthDashboard project={project} scan={scan} tasks={manager.tasks} />
          </div>
        )
      case 2:
        return (
          <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
             <div className="flex flex-col items-center text-center mb-6">
                <span className="timeline-pill timeline-thinking">Paso 2</span>
                <h2 className="display-lg mt-4">Diagnóstico y Ejecución Agéntica</h2>
                <p className="body-copy mt-2 max-w-lg text-[var(--color-muted)]">Genera el diagnóstico con IA y delega las tareas a tu agente autónomo.</p>
             </div>
             
             <AIGenerator scan={scan} isBusy={manager.isBusy} providers={manager.providers} onAsk={manager.askAIForTask} />
             
             <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
               <div>
                 <TasksView
                    tasks={manager.tasks.filter(t => t.status !== 'completed')}
                    isBusy={manager.isBusy}
                    onCreateTask={manager.createTask}
                    activeTaskId={manager.activeTaskId}
                    onStartAgent={(p, id) => {
                      manager.startAgent(p, id)
                    }}
                 />
               </div>
               <div className="flex flex-col gap-4">
                 <AgentMonitor
                    events={manager.agentEvents}
                    isRunning={manager.isAgentRunning}
                    onDropTask={(task) => manager.startAgent(`Resuelve esta tarea: ${task.title}. ${task.description || ''}`, task.id)}
                 />
                 {manager.aiAnswer && (
                   <AIResponse answer={manager.aiAnswer} />
                 )}
               </div>
             </div>
          </div>
        )
      case 3:
        return (
          <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
             <div className="flex flex-col items-center text-center mb-6">
                <span className="timeline-pill timeline-done">Paso 3</span>
                <h2 className="display-lg mt-4">Revisión e Historial</h2>
                <p className="body-copy mt-2 max-w-lg text-[var(--color-muted)]">Examina cada cambio aplicado por la IA con vista Antes / Después. Audita la memoria y el consumo.</p>
             </div>

             <DiffViewer diffs={manager.fileDiffs} />

             <div className="grid gap-8 lg:grid-cols-2">
               <CollapsibleSection title="Memoria del Proyecto" defaultOpen={false}>
                 <MemoryView memory={manager.memory} />
               </CollapsibleSection>

               <CollapsibleSection title="Consumo de IA" defaultOpen={false}>
                 <UsageView usage={manager.usageSummary} />
               </CollapsibleSection>
             </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex-1">
        {renderStepContent()}
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-[var(--color-hairline)] pt-4 sticky bottom-0 bg-[var(--color-canvas)]/90 backdrop-blur-sm z-10 pb-4">
        <button
          className="btn-secondary"
          style={{ height: 30, padding: '4px 12px', fontSize: 12 }}
          onClick={() => setStep(s => Math.max(1, s - 1))}
          disabled={step === 1}
        >
          ‹ Atrás
        </button>

        <div className="flex items-center gap-2">
          {[1, 2, 3].map(num => (
            <button
              key={num}
              onClick={() => setStep(num)}
              className={'flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-200 ' +
                (step === num
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]')}
              aria-label={'Ir al paso ' + num}
            >
              {num}
            </button>
          ))}
        </div>

        <button
          className="btn-primary"
          style={{ height: 30, padding: '4px 12px', fontSize: 12 }}
          onClick={() => setStep(s => Math.min(3, s + 1))}
          disabled={step === 3}
        >
          {step === 3 ? 'Finalizar' : 'Siguiente ›'}
        </button>
      </div>
    </div>
  )
}

function ProjectHealthDashboard(props: {
  project: ProjectDto
  scan: WorkspaceScanDto
  tasks: TaskDto[]
}) {
  const { scan, project, tasks } = props
  const h = scan.health
  const pending = tasks.filter(t => t.status === 'pending').length
  const completed = tasks.filter(t => t.status === 'completed').length
  const total = tasks.length

  const metrics: Array<{ key: keyof typeof h; label: string; color: string }> = [
    { key: 'architecture',    label: 'Arquitectura',    color: '#818CF8' },
    { key: 'documentation',   label: 'Documentación',   color: '#34D399' },
    { key: 'dependencies',    label: 'Dependencias',    color: '#60A5FA' },
    { key: 'tests',           label: 'Tests',           color: '#F472B6' },
    { key: 'security',        label: 'Seguridad',       color: '#FBBF24' },
    { key: 'git',             label: 'Git',             color: '#A78BFA' },
    { key: 'docker',          label: 'Docker',          color: '#22D3EE' },
    { key: 'modularity',      label: 'Modularidad',     color: '#FB923C' },
    { key: 'maintainability', label: 'Mantenibilidad',  color: '#4ADE80' },
  ]

  const scoreColor = h.score >= 75 ? '#4ADE80' : h.score >= 45 ? '#FBBF24' : '#F87171'
  const scoreLabel = h.score >= 75 ? 'Saludable' : h.score >= 45 ? 'Mejorable' : 'Crítico'

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
      {/* Header row */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
        {/* Health score */}
        <div className="feature-card flex items-center gap-5">
          <div className="relative flex-shrink-0" style={{ width: 80, height: 80 }}>
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-hairline-strong)" strokeWidth="7" />
              <circle
                cx="40" cy="40" r="34" fill="none"
                stroke={scoreColor} strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - h.score / 100)}`}
                transform="rotate(-90 40 40)"
                style={{ transition: 'stroke-dashoffset 1s ease-out' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-bold text-[18px]" style={{ color: scoreColor }}>{h.score}%</span>
            </div>
          </div>
          <div>
            <div className="section-kicker mb-1">Salud del Proyecto</div>
            <div className="display-sm" style={{ color: scoreColor }}>{scoreLabel}</div>
            <div className="section-kicker mt-2 text-[11px]">{project.name}</div>
          </div>
        </div>

        {/* Language & stack */}
        <div className="feature-card flex flex-col justify-center gap-3">
          <div className="section-kicker mb-1">Stack Tecnológico</div>
          <div className="flex items-center gap-3">
            <span className="timeline-pill timeline-grep text-[13px]">
              {scan.summary.mainLanguage ?? 'Desconocido'}
            </span>
            {scan.summary.framework && scan.summary.framework !== 'unknown' && (
              <span className="timeline-pill timeline-thinking text-[13px]">{scan.summary.framework}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            {scan.summary.hasGit && <span className="badge">Git ✓</span>}
            {scan.summary.hasDocker && <span className="badge">Docker ✓</span>}
            {scan.summary.hasReadme && <span className="badge">README ✓</span>}
            {scan.summary.hasTests && <span className="badge">Tests ✓</span>}
            <span className="badge">{scan.summary.totalFiles} archivos</span>
          </div>
        </div>

        {/* Task progress */}
        <div className="feature-card flex flex-col justify-center gap-3">
          <div className="section-kicker mb-1">Progreso de Tareas</div>
          {total === 0 ? (
            <p className="body-copy text-[var(--color-muted)] text-[13px]">Genera un diagnóstico para ver las tareas.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[13px]">{completed} / {total} completadas</span>
                <span className="fact-value text-[13px]" style={{ color: '#4ADE80' }}>
                  {total > 0 ? Math.round((completed / total) * 100) : 0}%
                </span>
              </div>
              <div className="metric-track">
                <div
                  className="metric-fill"
                  style={{
                    width: `${total > 0 ? (completed / total) * 100 : 0}%`,
                    backgroundColor: '#4ADE80',
                    transition: 'width 0.8s ease-out'
                  }}
                />
              </div>
              <div className="flex gap-3 text-[12px] text-[var(--color-muted)]">
                <span>{pending} pendientes</span>
                <span>·</span>
                <span>{completed} resueltas</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Live metrics grid */}
      <div>
        <div className="section-kicker mb-4">Métricas de Calidad — en vivo</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {metrics.map((m) => {
            const val = Math.max(0, Math.min(100, h[m.key] as number))
            return (
              <div key={m.key} className="feature-card">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="section-title text-[13px]">{m.label}</span>
                  <span className="fact-value text-[13px] font-bold tabular-nums" style={{ color: val >= 70 ? '#4ADE80' : val >= 40 ? '#FBBF24' : '#F87171' }}>
                    {val}%
                  </span>
                </div>
                <div className="metric-track">
                  <div
                    className="metric-fill"
                    style={{
                      width: `${val}%`,
                      backgroundColor: m.color,
                      transition: 'width 1s ease-out',
                      opacity: 0.85
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AIGenerator(props: {
  scan: WorkspaceScanDto | null
  isBusy: boolean
  providers: AIProviderDto[]
  onAsk: (message: string, taskType: AITaskType, providerId?: string) => void
}) {
  const [taskType, setTaskType] = useState<AITaskType>('analysis')
  const [providerId, setProviderId] = useState('')

  const taskTypeMessages: Record<string, string> = {
    'analysis': 'Analiza el proyecto y genera tareas de documentación, licencia y configuración básica. Revisa si ya existen para no duplicar.',
    'refactor': 'Analiza el proyecto y genera tareas para refactorizar, hacer el código modular, revisar integraciones (GitHub/Docker) y limpiar dependencias.',
    'bug-review': 'Haz una auditoría completa buscando errores, bugs, malas prácticas y problemas de seguridad. Genera tareas para resolverlos.',
    'test-generation': 'Analiza el proyecto y genera tareas para implementar pruebas unitarias y de integración.',
    'upgrade': 'Genera un plan ESTRUCTURADO POR FASES para escalar este proyecto al siguiente nivel técnico. En el resumen de la respuesta, redacta detalladamente el plan completo por fases, con justificaciones técnicas. Luego, traslada CADA PASO de ese plan a las tareas concretas ("tasks") a generar.'
  }

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-hairline)] rounded-[12px] p-5 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
        <h3 className="section-kicker font-bold flex-shrink-0">Generar Diagnóstico IA</h3>
        
        <form
          className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void props.onAsk(taskTypeMessages[taskType], taskType, providerId || undefined)
          }}
        >
          <select className="input max-w-full sm:max-w-[200px] text-[13px] h-9 min-h-0 py-0" value={taskType} onChange={(event) => setTaskType(event.target.value as AITaskType)}>
            <option value="analysis">Análisis de Proyecto</option>
            <option value="refactor">Refactorización</option>
            <option value="bug-review">Revisión de Errores</option>
            <option value="test-generation">Generación de Test</option>
            <option value="upgrade">Subir de Nivel</option>
          </select>
          <select className="input max-w-full sm:max-w-[180px] text-[13px] h-9 min-h-0 py-0" value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            <option value="">IA predeterminada</option>
            {props.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
          {props.isBusy ? (
            <button type="button" className="btn-primary h-9 px-6 flex-shrink-0" style={{ backgroundColor: '#10B981', color: 'white' }} disabled>
              <span className="flex justify-center items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: '300ms' }} />
                Analizando...
              </span>
            </button>
          ) : (
            <button className="btn-primary h-9 px-6 flex-shrink-0" type="submit" disabled={!props.scan}>
              Generar Tareas
            </button>
          )}
        </form>
      </div>
      <p className="body-copy text-[var(--color-muted)] text-[12px] italic m-0">
        "{taskTypeMessages[taskType]}"
      </p>
    </div>
  )
}

function AIResponse({ answer }: { answer: AIProjectAnswer }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-hairline)] rounded-[12px] overflow-hidden mt-6 animate-[fadeIn_0.5s_ease-out]">
      <div className="bg-[var(--color-surface-card)] px-4 py-3 border-b border-[var(--color-hairline)] flex justify-between items-center">
        <h3 className="section-kicker m-0">Respuesta del Análisis</h3>
        <span className="badge">{answer.taskType}</span>
      </div>
      <div className="p-4 space-y-4">
        <div className="ide-pane p-4 text-[13px] leading-relaxed whitespace-pre-wrap" style={{ maxHeight: '400px', overflowY: 'auto' }}>{answer.answer.summary}</div>
        <div className="grid grid-cols-3 gap-3">
          <Fact label="Proveedor" value={answer.provider} />
          <Fact label="Tokens Usados" value={answer.usage?.totalTokens?.toString() ?? 'N/A'} />
          <Fact label="Costo" value={answer.usage?.estimatedCostUsd == null ? 'N/A' : `$${answer.usage.estimatedCostUsd.toFixed(4)}`} />
        </div>
      </div>
    </div>
  )
}

function TasksView(props: {
  tasks: TaskDto[]
  isBusy: boolean
  activeTaskId?: string
  onCreateTask: (input: { title: string; description?: string }) => void
  onStartAgent?: (prompt: string, taskId: string) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    void props.onCreateTask({ title, description })
    setTitle('')
    setDescription('')
  }

  function toggleTask(id: string) {
    setOpenTaskId(prev => prev === id ? null : id)
  }

  const riskColor = (r: string | null) => {
    if (r === 'high') return '#F87171'
    if (r === 'medium') return '#FBBF24'
    return '#34D399'
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Task list */}
      <section className="panel" style={{ padding: '12px' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Tareas pendientes</h2>
          <span className="badge">{props.tasks.length}</span>
        </div>

        {props.tasks.length === 0 ? (
          <EmptyInline text="Genera un diagnóstico para ver las tareas." />
        ) : (
          <div className="space-y-1">
            {props.tasks.map((task, idx) => {
              const isOpen = openTaskId === task.id
              const isActive = props.activeTaskId === task.id

              return (
                <div
                  key={task.id}
                  className="task-row overflow-hidden"
                  draggable={!props.activeTaskId}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify(task))
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  style={{
                    animation: 'fadeIn 200ms ease-out both',
                    animationDelay: `${idx * 30}ms`,
                    borderColor: isActive ? '#10B981' : isOpen ? 'var(--color-hairline-strong)' : 'var(--color-hairline)',
                    cursor: props.activeTaskId ? 'default' : 'grab'
                  }}
                >
                  {/* Header row — always visible */}
                  <button
                    type="button"
                    onClick={() => toggleTask(task.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-canvas-soft)] transition-colors focus:outline-none"
                  >
                    <span
                      className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{
                        backgroundColor: isActive ? '#10B981' : 'var(--color-surface-strong)',
                        color: isActive ? 'white' : 'var(--color-muted)'
                      }}
                    >
                      {isActive ? '▶' : idx + 1}
                    </span>
                    <span className="flex-1 text-[13px] font-medium text-[var(--color-ink)] leading-snug">
                      {task.title}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {task.riskLevel && (
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: riskColor(task.riskLevel) }}
                          title={`Riesgo: ${task.riskLevel}`}
                        />
                      )}
                      {isActive && (
                        <span className="text-[10px] font-semibold" style={{ color: '#10B981' }}>En ejecución</span>
                      )}
                      <span
                        className="text-[var(--color-muted)] text-sm transition-transform duration-200"
                        style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}
                      >
                        ›
                      </span>
                    </div>
                  </button>

                  {/* Collapsible content */}
                  {isOpen && (
                    <div
                      className="px-3 pb-3 border-t border-[var(--color-hairline)]"
                      style={{ animation: 'slideDown 150ms ease-out both' }}
                    >
                      {task.description && (
                        <p className="body-copy mt-2 mb-3 text-[12px] leading-relaxed">{task.description}</p>
                      )}
                      {props.onStartAgent && (
                        <div className="flex justify-end mt-2">
                          {isActive ? (
                            <button type="button" className="btn-primary" style={{ backgroundColor: '#10B981', color: 'white', height: 30 }} disabled>
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: '150ms' }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: '300ms' }} />
                              En ejecución...
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-secondary hover:bg-[var(--color-ink)] hover:text-[var(--color-canvas)] hover:border-[var(--color-ink)] transition-all"
                              style={{ height: 30 }}
                              onClick={() => props.onStartAgent!(`Resuelve esta tarea: ${task.title}. ${task.description || ''}`, task.id)}
                              disabled={!!props.activeTaskId}
                            >
                              ▶ Levantar Agente
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Add manual task — collapsible */}
      <CollapsibleSection title="Añadir tarea manual" defaultOpen={false}>
        <form className="space-y-2" onSubmit={submit}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Título" disabled={props.isBusy} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="textarea" style={{ minHeight: 60 }} placeholder="Descripción (opcional)" disabled={props.isBusy} />
          <button className="btn-secondary w-full" type="submit" disabled={!title.trim() || props.isBusy}>Crear</button>
        </form>
      </CollapsibleSection>
    </div>
  )
}


function MemoryView({ memory }: { memory: MemoryEntryDto[] }) {
  return (
    <section className="panel">
      <h2 className="section-title">Memoria del proyecto</h2>
      <div className="mt-4 space-y-3">
        {memory.length ? (
          memory.map((entry) => (
            <div key={entry.id} className="memory-row p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="badge">{entry.type}</span>
                <span className="section-kicker">{formatDate(entry.createdAt)}</span>
              </div>
              <p className="body-copy mt-3">{entry.content}</p>
            </div>
          ))
        ) : (
          <EmptyInline text="La memoria se llenara con scans y analisis IA." />
        )}
      </div>
    </section>
  )
}

function UsageView({ usage }: { usage: AIUsageSummaryDto | null }) {
  if (!usage) {
    return <EmptyState title="Consumo no disponible" action="Ejecuta una consulta IA para crear el primer registro." />
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-4">
        <Fact label="Entrada" value={`${usage.totalInputTokens} tokens`} />
        <Fact label="Salida" value={`${usage.totalOutputTokens} tokens`} />
        <Fact label="Total" value={`${usage.totalTokens} tokens`} />
        <Fact label="Costo estimado" value={`$${usage.estimatedCostUsd}`} />
      </section>
      <section className="panel">
        <h2 className="section-title">Consumo por proveedor</h2>
        <div className="mt-4 space-y-3">
          {usage.byProvider.length ? (
            usage.byProvider.map((item) => {
              const percent = item.monthlyTokenLimit ? Math.min(100, Math.round((item.totalTokens / item.monthlyTokenLimit) * 100)) : 0
              return (
                <div key={item.providerName} className="feature-card">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="section-title">{item.providerName}</div>
                      <div className="section-kicker">
                        {item.totalTokens} tokens / restante {item.estimatedRemainingTokens ?? 'no disponible'}
                      </div>
                    </div>
                    <span className="badge">${item.estimatedCostUsd}</span>
                  </div>
                  <div className="metric-track mt-4">
                    <div className="metric-fill" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              )
            })
          ) : (
            <EmptyInline text="Aun no hay consumo registrado." />
          )}
        </div>
      </section>
      <section className="panel">
        <h2 className="section-title">Historial</h2>
        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="section-kicker">
              <tr>
                <th className="py-2">Fecha</th>
                <th>Proveedor</th>
                <th>Modelo</th>
                <th>Tarea</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Total</th>
                <th>Estimado</th>
              </tr>
            </thead>
            <tbody>
              {usage.history.map((item) => (
                <tr key={item.id} className="border-t" style={{ borderColor: 'var(--color-hairline)' }}>
                  <td className="py-2">{formatDate(item.createdAt)}</td>
                  <td>{item.providerName}</td>
                  <td>{item.model}</td>
                  <td>{item.taskType}</td>
                  <td>{item.inputTokens ?? 'no disponible'}</td>
                  <td>{item.outputTokens ?? 'no disponible'}</td>
                  <td>{item.totalTokens ?? 'no disponible'}</td>
                  <td>{item.isEstimate ? 'si' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact min-w-0 p-4">
      <div className="fact-label">{label}</div>
      <div className="fact-value mt-1 truncate" title={value}>
        {value}
      </div>
    </div>
  )
}

function StatusBar({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <footer className="status-bar">
      <div className="status-bar-item">
        <span style={{ color: 'var(--color-primary)' }}>●</span>
        <span className="status-bar-text">AI Workspace Manager</span>
      </div>
      <div className="flex-1" />
      {error && (
        <div className="status-bar-item status-bar-error animate-fadeIn">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-semantic-error)' }}></span>
          {error}
        </div>
      )}
      {notice && (
        <div className="status-bar-item status-bar-success animate-fadeIn">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-semantic-success)' }}></span>
          {notice}
        </div>
      )}
      {!error && !notice && (
        <div className="status-bar-item animate-fadeIn">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-muted-soft)' }}></span>
          <span className="status-bar-text">Listo</span>
        </div>
      )}
    </footer>
  )
}

function EmptyState({ title, action }: { title: string; action: string }) {
  return (
    <section className="panel flex min-h-[360px] items-center justify-center text-center">
      <div>
        <span className="timeline-pill timeline-thinking">Workspace</span>
        <h1 className="display-md mt-4">{title}</h1>
        <p className="body-copy mt-2">{action}</p>
      </div>
    </section>
  )
}

function EmptyInline({ text }: { text: string }) {
  return <div className="inline-empty body-copy p-4">{text}</div>
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}
