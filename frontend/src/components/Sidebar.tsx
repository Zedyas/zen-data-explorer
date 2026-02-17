import { useAppStore } from '../store.ts'
import {
  CodeIcon,
  CodeXmlIcon,
  CompareIcon,
  DynamicIcon,
  OverviewDatabaseIcon,
  OverviewFileIcon,
  TableIcon,
} from './icons.tsx'

export function Sidebar() {
  const dataset = useAppStore((s) => s.activeDataset)
  const datasets = useAppStore((s) => s.datasets)
  const cells = useAppStore((s) => s.cells)
  const workspaceTab = useAppStore((s) => s.workspaceTab)
  const setWorkspaceTab = useAppStore((s) => s.setWorkspaceTab)
  const activeCellId = useAppStore((s) => s.activeCellId)
  const setActiveCell = useAppStore((s) => s.setActiveCell)
  const switchDataset = useAppStore((s) => s.switchDataset)

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

  function openOverviewFor(datasetId: string) {
    switchDataset(datasetId)
    setWorkspaceTab('overview')
    setActiveCell(null)
    scrollToTarget('overview-view')
  }

  function openDynamicFor(datasetId: string, defaultCellId: string | null) {
    switchDataset(datasetId)
    setWorkspaceTab('dynamic')
    setActiveCell(defaultCellId)
  }

  function openCell(cellId: string, datasetId: string | undefined) {
    if (datasetId) switchDataset(datasetId)
    setWorkspaceTab('dynamic')
    setActiveCell(cellId)
    scrollToTarget(`cell-${cellId}`)
  }

  return (
    <div className="w-64 border-r border-border-strong bg-bg-deep flex flex-col shrink-0">
      <div className="px-3 py-2 border-b border-border-strong">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Instances</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {datasets.length === 0 && (
          <div className="text-xs text-text-muted px-1 py-2">No dataset loaded.</div>
        )}

        {datasets.map((d) => {
          const isActiveDataset = dataset?.id === d.id
          const datasetCells = cells.filter((c) => c.datasetId === d.id)

          return (
            <div key={d.id} className="rounded border border-border/60 bg-surface/40">
              <div
                onClick={() => switchDataset(d.id)}
                className={`px-2 py-1.5 text-xs font-medium cursor-pointer border-b border-border/60 ${
                  isActiveDataset ? 'text-text bg-surface-elevated' : 'text-text-secondary hover:bg-surface-hover/30'
                }`}
                title={d.name}
              >
                <div className="truncate">{d.name}</div>
                <div className="text-[10px] text-text-muted font-mono mt-0.5">{d.rowCount.toLocaleString()}x{d.columns.length}</div>
              </div>

              <div className="p-1 space-y-1">
                <div
                  onClick={() => openOverviewFor(d.id)}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer border ${
                    isActiveDataset && workspaceTab === 'overview'
                      ? 'border-accent/40 bg-accent-dim text-accent'
                      : 'border-transparent text-text-secondary hover:border-border hover:bg-surface-hover/30'
                  }`}
                >
                  {d.sourceType === 'database' ? <OverviewDatabaseIcon /> : <OverviewFileIcon />}
                  <span className="truncate">Overview</span>
                </div>

                <div
                  onClick={() => openDynamicFor(d.id, datasetCells.at(-1)?.id ?? null)}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer border ${
                    isActiveDataset && workspaceTab === 'dynamic'
                      ? 'border-accent/40 bg-accent-dim text-accent'
                      : 'border-transparent text-text-secondary hover:border-border hover:bg-surface-hover/30'
                  }`}
                >
                  <DynamicIcon />
                  <span className="truncate">Notebook</span>
                  <span className="ml-auto text-[9px] font-mono text-text-muted">{datasetCells.length}</span>
                </div>

                <div className="ml-3 pl-2 border-l border-border/60 space-y-1">
                  {datasetCells.length === 0 && (
                    <div className="px-2 py-1 text-[11px] text-text-muted">No cells yet</div>
                  )}

                  {datasetCells.map((cell, idx) => (
                    <div
                      key={cell.id}
                      onClick={() => openCell(cell.id, cell.datasetId)}
                      className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer border ${
                        activeCellId === cell.id && isActiveDataset && workspaceTab === 'dynamic'
                          ? 'border-accent/40 bg-accent-dim'
                          : 'border-transparent hover:border-border hover:bg-surface-hover/30'
                      }`}
                    >
                      <span className="text-[9px] text-text-muted font-mono">{idx + 1}.</span>
                      <span className="text-text-muted">
                        {cell.type === 'compare'
                          ? <CompareIcon />
                          : cell.type === 'table'
                            ? <TableIcon />
                            : cell.type === 'python'
                              ? <CodeIcon />
                              : <CodeXmlIcon />}
                      </span>
                      <span className="text-text-secondary truncate">{cell.title}</span>
                      {cell.result && !cell.isRunning && (
                        <span className="text-[9px] text-success ml-auto font-mono">
                          {cell.result.rowCount}x{cell.result.columns.length}
                        </span>
                      )}
                      {cell.isRunning && <span className="text-[9px] text-accent ml-auto">run</span>}
                      {cell.error && !cell.isRunning && <span className="text-[9px] text-error ml-auto">err</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
