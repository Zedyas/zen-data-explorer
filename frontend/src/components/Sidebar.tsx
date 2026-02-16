import { useAppStore } from '../store.ts'

export function Sidebar() {
  const dataset = useAppStore((s) => s.activeDataset)
  const datasets = useAppStore((s) => s.datasets)
  const cells = useAppStore((s) => s.cells)
  const workspaceTab = useAppStore((s) => s.workspaceTab)
  const setWorkspaceTab = useAppStore((s) => s.setWorkspaceTab)
  const activeCellId = useAppStore((s) => s.activeCellId)
  const setActiveCell = useAppStore((s) => s.setActiveCell)

  function scrollToTarget(id: string) {
    const tryScroll = () => {
      const el = document.getElementById(id)
      if (!el) return false
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return true
    }

    if (tryScroll()) return
    setTimeout(() => { void tryScroll() }, 40)
    setTimeout(() => { void tryScroll() }, 120)
  }

  return (
    <div className="w-56 border-r border-border-strong bg-bg-deep flex flex-col shrink-0">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-strong">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Outline
        </span>
        <div className="mt-2 flex items-center gap-1 rounded bg-surface-elevated p-0.5 border border-border">
          <button
            onClick={() => setWorkspaceTab('overview')}
            className={`flex-1 rounded px-1.5 py-1 text-[10px] transition-colors ${
              workspaceTab === 'overview' ? 'gradient-border-subtle text-accent' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setWorkspaceTab('dynamic')}
            className={`flex-1 rounded px-1.5 py-1 text-[10px] transition-colors ${
              workspaceTab === 'dynamic' ? 'gradient-border-subtle text-accent' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Dynamic
          </button>
        </div>
      </div>

      {/* Cell list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div
          onClick={() => {
            setWorkspaceTab('overview')
            setActiveCell(null)
            scrollToTarget('overview-view')
          }}
          className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer border ${
            workspaceTab === 'overview' ? 'border-accent/40 bg-accent-dim' : 'border-transparent hover:border-border hover:bg-surface-hover/30'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent shrink-0">
            <rect x="1" y="2" width="14" height="12" rx="1.5" />
            <line x1="1" y1="6" x2="15" y2="6" />
            <line x1="6" y1="6" x2="6" y2="14" />
          </svg>
          <span className="text-text truncate">Overview Table</span>
        </div>

        {cells.map((cell, i) => (
          <div
            key={cell.id}
            onClick={() => {
              setWorkspaceTab('dynamic')
              setActiveCell(cell.id)
              scrollToTarget(`cell-${cell.id}`)
            }}
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors cursor-pointer border ${
              activeCellId === cell.id ? 'border-accent/40 bg-accent-dim' : 'border-transparent hover:border-border hover:bg-surface-hover/30'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted shrink-0">
              <rect x="1" y="1" width="14" height="14" rx="2" />
              <path d="M4 5h8M4 8h5M4 11h7" />
            </svg>
            <span className="text-text-secondary truncate">
              {cell.title || `${cell.type.toUpperCase()} ${i + 1}`}
            </span>
            {(cell.datasetId && cell.type !== 'compare') && (
              <span className="text-[9px] text-text-muted font-mono">
                {datasets.find((d) => d.id === cell.datasetId)?.name ?? 'dataset'}
              </span>
            )}
            {cell.isRunning && (
              <span className="text-[9px] text-accent ml-auto">running</span>
            )}
            {cell.result && !cell.isRunning && (
              <span className="text-[9px] text-success ml-auto font-mono">
                {cell.result.rowCount}x{cell.result.columns.length}
              </span>
            )}
            {cell.error && !cell.isRunning && (
              <span className="text-[9px] text-error ml-auto">err</span>
            )}
          </div>
        ))}
      </div>

      {/* Dataset source */}
      {dataset && (
        <div className="px-3 py-2 border-t border-border-strong">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Source</div>
          <div className="text-xs text-text-secondary font-mono truncate" title={dataset.name}>
            {dataset.name}
          </div>
        </div>
      )}
    </div>
  )
}
