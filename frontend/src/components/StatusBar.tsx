import { useAppStore } from '../store.ts'

export function StatusBar() {
  const dataset = useAppStore((s) => s.activeDataset)
  const filters = useAppStore((s) => s.filters)
  const workspaceTab = useAppStore((s) => s.workspaceTab)
  const cells = useAppStore((s) => s.cells)
  const activeCellId = useAppStore((s) => s.activeCellId)
  const visibleCellCount = dataset ? cells.filter((c) => c.datasetId === dataset.id).length : 0
  const activeCell = cells.find((c) => c.id === activeCellId && c.datasetId === dataset?.id) ?? null
  const activeCellResult = activeCell?.result as { rowCount: number } | null
  const workspaceLabel = workspaceTab

  return (
    <div className="h-6 flex items-center justify-between px-3 border-t border-border panel-deep text-[10px] text-text-muted shrink-0">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          <span>DuckDB</span>
        </span>
        <span className="font-mono">{workspaceLabel}</span>
        {dataset && (
          <span className="font-mono">
            {dataset.rowCount.toLocaleString()}R × {dataset.columns.length}C
          </span>
        )}
        {filters.length > 0 && (
          <span className="font-mono text-accent">
            {filters.length} filter{filters.length !== 1 ? 's' : ''}
          </span>
        )}
        {visibleCellCount > 0 && (
          <span className="font-mono">{visibleCellCount} cell{visibleCellCount !== 1 ? 's' : ''}</span>
        )}
      </div>
      <div className="font-mono">
        {workspaceTab === 'notebook' && activeCell && activeCellResult ? (
          <span className="text-accent">
            {activeCell.title}: {activeCellResult.rowCount.toLocaleString()} rows
          </span>
        ) : (
          'Zen Data Explorer'
        )}
      </div>
    </div>
  )
}
