import { useAppStore } from '../store.ts'
import { SqlCell } from './SqlCell.tsx'
import { TableCell } from './TableCell.tsx'
import type { InvestigationCell, QueryResponse, TableQueryResponse } from '../types.ts'

function PythonCell({ cell }: { cell: InvestigationCell }) {
  const updateCell = useAppStore((s) => s.updateCell)
  const removeCell = useAppStore((s) => s.removeCell)
  const setActiveCell = useAppStore((s) => s.setActiveCell)
  const activeCellId = useAppStore((s) => s.activeCellId)
  const isActive = activeCellId === cell.id

  return (
    <div
      id={`cell-${cell.id}`}
      onClick={() => setActiveCell(cell.id)}
      className={`rounded-lg overflow-hidden ${isActive ? 'gradient-border-active' : 'gradient-border-subtle'}`}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border-strong bg-surface">
        <span className="text-xs text-text-secondary">{cell.title} (display only)</span>
        <button onClick={() => removeCell(cell.id)} className="text-text-muted hover:text-error text-sm px-1">&times;</button>
      </div>
      <textarea
        value={cell.python ?? ''}
        onChange={(e) => updateCell(cell.id, { python: e.target.value })}
        className="w-full min-h-[120px] bg-bg-deep text-text-secondary font-mono text-xs p-2.5 outline-none resize-y border-t border-border/50"
      />
    </div>
  )
}

function CompareCell({ cell }: { cell: InvestigationCell }) {
  const cells = useAppStore((s) => s.cells)
  const datasets = useAppStore((s) => s.datasets)
  const updateCell = useAppStore((s) => s.updateCell)
  const removeCell = useAppStore((s) => s.removeCell)
  const setActiveCell = useAppStore((s) => s.setActiveCell)
  const activeCellId = useAppStore((s) => s.activeCellId)
  const isActive = activeCellId === cell.id

  const sourceCells = cells.filter((c) => c.id !== cell.id && (c.type === 'table' || c.type === 'sql'))
  const compare = cell.compare ?? { leftCellId: null, rightCellId: null }
  const left = sourceCells.find((c) => c.id === compare.leftCellId) ?? null
  const right = sourceCells.find((c) => c.id === compare.rightCellId) ?? null

  const leftResult = (left?.result as QueryResponse | TableQueryResponse | null) ?? null
  const rightResult = (right?.result as QueryResponse | TableQueryResponse | null) ?? null

  const leftDataset = datasets.find((d) => d.id === left?.datasetId)
  const rightDataset = datasets.find((d) => d.id === right?.datasetId)

  function selectLeft(value: string) {
    updateCell(cell.id, { compare: { ...compare, leftCellId: value || null } })
  }

  function selectRight(value: string) {
    updateCell(cell.id, { compare: { ...compare, rightCellId: value || null } })
  }

  return (
    <div
      id={`cell-${cell.id}`}
      onClick={() => setActiveCell(cell.id)}
      className={`rounded-lg overflow-hidden ${isActive ? 'gradient-border-active' : 'gradient-border-subtle'}`}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border-strong bg-surface">
        <span className="text-xs text-text-secondary">{cell.title}</span>
        <button onClick={() => removeCell(cell.id)} className="text-text-muted hover:text-error text-sm px-1">&times;</button>
      </div>

      <div className="px-2.5 py-1.5 border-b border-border bg-bg-deep flex items-center gap-2 text-xs flex-wrap">
        <select
          value={compare.leftCellId ?? ''}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => selectLeft(e.target.value)}
          className="h-6 px-2 rounded border border-border-strong bg-surface-elevated text-text-secondary min-w-40"
        >
          <option value="">Left source cell</option>
          {sourceCells.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · {datasets.find((d) => d.id === c.datasetId)?.name ?? 'dataset'}{c.result ? '' : ' (run)'}
            </option>
          ))}
        </select>
        <select
          value={compare.rightCellId ?? ''}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => selectRight(e.target.value)}
          className="h-6 px-2 rounded border border-border-strong bg-surface-elevated text-text-secondary min-w-40"
        >
          <option value="">Right source cell</option>
          {sourceCells.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · {datasets.find((d) => d.id === c.datasetId)?.name ?? 'dataset'}{c.result ? '' : ' (run)'}
            </option>
          ))}
        </select>

        {leftResult && rightResult && (
          <span className="ml-auto text-[10px] font-mono text-text-muted">
            delta rows: {leftResult.rowCount - rightResult.rowCount}
          </span>
        )}
      </div>

      {!left || !right ? (
        <div className="px-3 py-4 text-xs text-text-muted">Select two source cells to compare.</div>
      ) : (!leftResult || !rightResult) ? (
        <div className="px-3 py-4 text-xs text-text-muted">
          One or both selected cells have no result yet. Run those source cells, then compare.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
          <ComparePane title={left?.title ?? 'Left'} subtitle={leftDataset?.name} result={leftResult} />
          <ComparePane title={right?.title ?? 'Right'} subtitle={rightDataset?.name} result={rightResult} />
        </div>
      )}
    </div>
  )
}

function ComparePane({ title, subtitle, result }: { title: string; subtitle?: string; result: QueryResponse | TableQueryResponse }) {
  return (
    <div className="border-t border-border lg:border-t-0 lg:border-l first:lg:border-l-0">
      <div className="px-2.5 py-1 border-b border-border/60 bg-surface flex items-center justify-between text-[10px] font-mono">
        <span className="text-text-secondary">{title}</span>
        <span className="text-text-muted">{subtitle ? `${subtitle} · ` : ''}{result.rowCount}x{result.columns.length}</span>
      </div>
      <div className="overflow-auto max-h-[320px]">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-[1]">
            <tr className="bg-surface">
              {result.columns.map((col) => (
                <th key={col} className="px-2 py-1 text-left font-medium text-text-secondary border-r border-border/30 last:border-r-0">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} className="border-t border-border/40 hover:bg-surface-hover/30">
                {result.columns.map((col) => (
                  <td key={col} className="px-2 py-0.5 font-mono border-r border-border/20 last:border-r-0">
                    {row[col] == null ? <span className="text-text-muted/40 italic">null</span> : String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function CellCanvas() {
  const cells = useAppStore((s) => s.cells)
  const addCell = useAppStore((s) => s.addCell)
  const activeDataset = useAppStore((s) => s.activeDataset)

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <div className="flex items-center gap-2">
        <button disabled={!activeDataset} onClick={() => addCell('table')} className="px-2 py-1 rounded border border-border-strong bg-surface text-xs text-text-secondary hover:text-text hover:border-accent disabled:opacity-40 transition-colors">
          + Table Cell
        </button>
        <button disabled={!activeDataset} onClick={() => addCell('sql')} className="px-2 py-1 rounded border border-border-strong bg-surface text-xs text-text-secondary hover:text-text hover:border-accent disabled:opacity-40 transition-colors">
          + SQL Cell
        </button>
        <button disabled={!activeDataset} onClick={() => addCell('python')} className="px-2 py-1 rounded border border-border-strong bg-surface text-xs text-text-secondary hover:text-text hover:border-accent disabled:opacity-40 transition-colors">
          + Python Cell
        </button>
        <button onClick={() => addCell('compare')} className="px-2 py-1 rounded border border-border-strong bg-surface text-xs text-text-secondary hover:text-text hover:border-accent transition-colors">
          + Compare Cell
        </button>
        {!activeDataset && <span className="text-[10px] text-text-muted">Load/select a dataset to add query cells.</span>}
      </div>

      {cells.length === 0 && (
        <div className="gradient-border-subtle rounded-lg p-6 text-center text-text-muted text-sm">
          Dynamic Views is empty. Add your first cell to start from the current Overview snapshot.
        </div>
      )}

      {cells.map((cell) => {
        if (cell.type === 'table') return <TableCell key={cell.id} cell={cell} />
        if (cell.type === 'sql') return <SqlCell key={cell.id} cell={cell} />
        if (cell.type === 'compare') return <CompareCell key={cell.id} cell={cell} />
        return <PythonCell key={cell.id} cell={cell} />
      })}
    </div>
  )
}
