import { useAppStore } from '../store.ts'
import {
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
    setTimeout(() => {
      void tryScroll()
    }, 40)
    setTimeout(() => {
      void tryScroll()
    }, 120)
  }

  function openOverviewFor(datasetId: string) {
    switchDataset(datasetId)
    setWorkspaceTab('overview')
    setActiveCell(null)
    scrollToTarget('overview-view')
  }

  function openNotebookFor(datasetId: string, defaultCellId: string | null) {
    switchDataset(datasetId)
    setWorkspaceTab('notebook')
    setActiveCell(defaultCellId)
  }

  function openCell(cellId: string, datasetId: string | undefined) {
    if (datasetId) switchDataset(datasetId)
    setWorkspaceTab('notebook')
    setActiveCell(cellId)
    scrollToTarget(`cell-${cellId}`)
  }

  return (
    <aside className="w-64 h-full border-r border-border panel-deep flex flex-col shrink-0">
      <div className="h-9 px-4 border-b border-border flex items-center">
        <span className="text-[14px] uppercase tracking-[0.18em] font-mono text-text-secondary">Datasets</span>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        {datasets.length === 0 && <div className="px-4 py-3 text-xs text-text-secondary">No dataset loaded.</div>}

        {datasets.map((d) => {
          const isActiveDataset = dataset?.id === d.id
          const datasetCells = cells.filter((c) => c.datasetId === d.id)

          return (
            <section key={d.id} className="px-4 py-2.5">
              <button
                onClick={() => switchDataset(d.id)}
                className={`w-full text-left transition-colors ${isActiveDataset ? 'text-text' : 'text-text-secondary hover:text-text'}`}
                title={d.name}
              >
                <div className="text-sm font-medium truncate leading-tight">{d.name}</div>
              </button>

              <div className="mt-2 ml-2 border-l border-border pl-3 space-y-0.5">
                <button
                  onClick={() => openOverviewFor(d.id)}
                  className={`group w-full h-7 flex items-center justify-between text-xs px-2 rounded-md transition-[background-color,color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isActiveDataset && workspaceTab === 'overview'
                      ? 'text-accent bg-accent-dim'
                      : 'text-text-secondary hover:text-accent hover:bg-surface-elevated/70'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {d.sourceType === 'database' ? <OverviewDatabaseIcon /> : <OverviewFileIcon />}
                    <span>Overview</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-text-muted">
                      {d.rowCount.toLocaleString()}x{d.columns.length}
                    </span>
                    <span className={`transition-colors ${
                      isActiveDataset && workspaceTab === 'overview'
                        ? 'text-accent'
                        : 'text-text-muted group-hover:text-accent'
                    }`}>›</span>
                  </span>
                </button>

                <button
                  onClick={() => openNotebookFor(d.id, datasetCells.at(-1)?.id ?? null)}
                  className={`group w-full h-7 flex items-center justify-between text-xs px-2 rounded-md transition-[background-color,color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isActiveDataset && workspaceTab === 'notebook'
                      ? 'text-accent bg-accent-dim'
                      : 'text-text-secondary hover:text-accent hover:bg-surface-elevated/70'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <DynamicIcon />
                    <span>Notebook</span>
                  </span>
                  <span className={`text-[10px] font-mono transition-colors ${
                    isActiveDataset && workspaceTab === 'notebook'
                      ? 'text-accent'
                      : 'text-text-muted group-hover:text-accent'
                  }`}>{datasetCells.length}</span>
                </button>

                {datasetCells.length > 0 && (
                  <div className="ml-2 mt-1 border-l border-border pl-3 space-y-0.5">
                    {datasetCells.map((cell) => (
                      <button
                        key={cell.id}
                        onClick={() => openCell(cell.id, cell.datasetId)}
                        className={`group w-full h-6 flex items-center justify-between text-xs px-2 text-left rounded-md transition-[background-color,color,box-shadow] duration-[170ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                          activeCellId === cell.id && isActiveDataset && workspaceTab === 'notebook'
                            ? 'text-accent bg-accent-dim'
                            : 'text-text-secondary hover:text-accent hover:bg-surface-elevated/60'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5 truncate">
                          <span className="text-text-muted">
                            {cell.type === 'compare' ? <CompareIcon /> : <TableIcon />}
                          </span>
                          <span className="truncate">{cell.title}</span>
                        </span>
                        <span className={`transition-colors ${
                          activeCellId === cell.id && isActiveDataset && workspaceTab === 'notebook'
                            ? 'text-accent'
                            : 'text-text-muted group-hover:text-accent'
                        }`}>›</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )
        })}

        <section className="px-4 py-3 mt-2 border-t border-border/80">
          <div className="text-[14px] uppercase tracking-[0.18em] font-mono text-text-secondary mb-1">Variables</div>
          <div className="text-[11px] text-text-secondary">Available in phase 4.5</div>
        </section>
      </div>
    </aside>
  )
}
