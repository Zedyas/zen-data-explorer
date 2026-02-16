import { useMemo } from 'react'
import { useAppStore } from '../store.ts'
import type { TableQueryResponse } from '../types.ts'

export function MetricsBar() {
  const dataset = useAppStore((s) => s.activeDataset)
  const workspaceTab = useAppStore((s) => s.workspaceTab)
  const activeCellId = useAppStore((s) => s.activeCellId)
  const cells = useAppStore((s) => s.cells)

  const activeCell = useMemo(() => cells.find((c) => c.id === activeCellId) ?? null, [cells, activeCellId])
  const activeCellResult = activeCell?.result as TableQueryResponse | null

  if (!dataset) return null

  return (
    <div className="h-8 border-b border-border-strong bg-surface px-3 flex items-center justify-between text-[11px]">
      <div className="flex items-center gap-3 text-text-muted">
        <span className="font-mono">{dataset.rowCount.toLocaleString()} rows</span>
        <span className="font-mono">{dataset.columns.length} cols</span>
        <span className="font-mono">mode: {workspaceTab}</span>
      </div>
      <div className="flex items-center gap-2">
        {workspaceTab === 'dynamic' && activeCell && activeCellResult && (
          <span className="px-1.5 py-0.5 rounded border border-accent/40 bg-accent-muted text-accent font-mono">
            active {activeCell.title}: {activeCellResult.rowCount.toLocaleString()} rows
          </span>
        )}
        {workspaceTab === 'dynamic' && !activeCell && (
          <span className="px-1.5 py-0.5 rounded border border-border bg-bg-deep text-text-muted font-mono">
            no active cell: showing overview context
          </span>
        )}
      </div>
    </div>
  )
}
