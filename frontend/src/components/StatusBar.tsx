import { useAppStore } from '../store.ts'

export function StatusBar() {
  const dataset = useAppStore((s) => s.activeDataset)
  const filters = useAppStore((s) => s.filters)
  const workspaceTab = useAppStore((s) => s.workspaceTab)
  const cells = useAppStore((s) => s.cells)
  const visibleCellCount = dataset ? cells.filter((c) => c.datasetId === dataset.id).length : 0

  return (
    <div className="h-6 flex items-center justify-between px-3 border-t border-border bg-bg-deep text-[10px] text-text-muted shrink-0">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          DuckDB
        </span>
        {dataset && (
          <span className="font-mono">{dataset.columns.length} columns</span>
        )}
        {filters.length > 0 && (
          <span className="font-mono text-accent">{filters.length} filter{filters.length !== 1 ? 's' : ''} active</span>
        )}
        <span className="font-mono">{workspaceTab}</span>
        {visibleCellCount > 0 && <span className="font-mono">{visibleCellCount} cell{visibleCellCount !== 1 ? 's' : ''}</span>}
      </div>
      <div className="font-mono">
        Zen Data Explorer
      </div>
    </div>
  )
}
