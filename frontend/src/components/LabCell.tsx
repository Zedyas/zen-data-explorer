import { useMemo } from 'react'
import { useAppStore } from '../store.ts'
import type { InvestigationCell, LabModule } from '../types.ts'

type CellResultData = {
  columns: string[]
  rows: Record<string, unknown>[]
}

const MODULE_ORDER: LabModule[] = [
  'missingness',
  'validation',
  'keys',
  'outliers',
  'relationships',
  'univariate',
  'sampling',
  'parse_cast',
  'sentinel',
  'freshness',
]

const MODULE_LABELS: Record<LabModule, string> = {
  missingness: 'Missingness',
  validation: 'Validation',
  keys: 'Keys',
  outliers: 'Outliers',
  relationships: 'Relationships',
  univariate: 'Univariate',
  sampling: 'Sampling',
  parse_cast: 'Parse/Cast',
  sentinel: 'Sentinel Audit',
  freshness: 'Freshness',
}

function toCellText(value: unknown): string {
  if (value == null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function LabCell({ cell }: { cell: InvestigationCell }) {
  const cells = useAppStore((s) => s.cells)
  const updateCell = useAppStore((s) => s.updateCell)
  const removeCell = useAppStore((s) => s.removeCell)
  const setActiveCell = useAppStore((s) => s.setActiveCell)
  const activeCellId = useAppStore((s) => s.activeCellId)
  const isActive = activeCellId === cell.id

  const tableCells = useMemo(
    () => cells.filter((c) => c.datasetId === cell.datasetId && c.type === 'table'),
    [cells, cell.datasetId],
  )

  const lab = cell.lab ?? {
    sourceCellId: tableCells.at(-1)?.id ?? null,
    activeModule: 'missingness' as LabModule,
    maxColumns: 8,
    nullThresholdPct: 10,
    uniqueFloorPct: 95,
  }

  const activeModule = lab.activeModule ?? 'missingness'
  const sourceCell = tableCells.find((c) => c.id === lab.sourceCellId) ?? tableCells.at(-1) ?? null
  const sourceResult = sourceCell?.result as CellResultData | null
  const rows = sourceResult?.rows ?? []
  const columns = sourceResult?.columns ?? []
  const previewRows = rows.slice(0, 5)

  function patchLab(patch: Partial<NonNullable<InvestigationCell['lab']>>) {
    updateCell(cell.id, { lab: { ...lab, ...patch, modules: undefined } })
  }

  return (
    <div
      id={`cell-${cell.id}`}
      onClick={() => setActiveCell(cell.id)}
      className={`rounded-lg overflow-hidden ${isActive ? 'gradient-border-active' : 'gradient-border-subtle'}`}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border-strong bg-surface">
        <span className="text-xs text-text-secondary">{cell.title}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted font-mono">lab scaffold</span>
          <button onClick={() => removeCell(cell.id)} className="text-text-muted hover:text-error text-sm px-1">&times;</button>
        </div>
      </div>

      <div className="px-2 py-1.5 border-b border-border/60 bg-bg-deep/70 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[10px] text-text-muted font-mono">Source table:</label>
          <select
            value={sourceCell?.id ?? ''}
            onChange={(e) => patchLab({ sourceCellId: e.target.value || null })}
            className="bg-surface border border-border rounded px-2 py-1 text-xs text-text-secondary"
          >
            <option value="">Select table cell</option>
            {tableCells.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          {sourceResult && (
            <span className="text-[10px] text-text-muted font-mono ml-auto">
              {rows.length.toLocaleString()} rows x {columns.length} cols
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {MODULE_ORDER.map((module) => (
            <button
              key={module}
              onClick={() => patchLab({ activeModule: module })}
              className={`px-2 py-0.5 rounded text-[10px] border whitespace-nowrap transition-colors ${
                activeModule === module
                  ? 'border-accent/40 bg-accent-dim text-accent'
                  : 'border-border bg-surface text-text-muted hover:text-text-secondary'
              }`}
            >
              {MODULE_LABELS[module]}
            </button>
          ))}
        </div>
      </div>

      {!sourceCell && (
        <div className="px-3 py-2 text-xs text-text-muted bg-bg-deep/60">Create and run a Table cell first, then select it as Lab source.</div>
      )}

      {sourceCell && !sourceResult && (
        <div className="px-3 py-2 text-xs text-text-muted bg-bg-deep/60">Run `{sourceCell.title}` to produce rows for this Lab scaffold.</div>
      )}

      {sourceResult && (
        <div className="p-2 bg-bg-deep/55 h-[400px] md:h-[420px] overflow-y-auto space-y-2">
          <div className="rounded border border-border/60 bg-surface/75 px-2 py-1.5 text-[10px] text-text-secondary">
            <div className="font-mono">Module: {MODULE_LABELS[activeModule]}</div>
            <div className="text-text-muted mt-0.5">
              Full Lab analytics were split out to branch `lab-feature-full`.
              This scaffold stays on master so you can keep notebook structure and source selection.
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-[10px]">
            <MetricCard label="Rows in source" value={rows.length.toLocaleString()} />
            <MetricCard label="Columns in source" value={columns.length.toLocaleString()} />
            <MetricCard label="Preview rows" value={previewRows.length.toLocaleString()} />
          </div>

          <div className="rounded border border-border/60 bg-surface/70 overflow-auto">
            {previewRows.length === 0 ? (
              <div className="text-[10px] text-text-muted px-2 py-2">No rows available in source result.</div>
            ) : (
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-bg-deep/55 border-b border-border/60">
                    {columns.map((column) => (
                      <th key={column} className="px-1.5 py-1 text-left font-mono text-text-muted">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => (
                    <tr key={`row-${idx}`} className="border-t border-border/40 hover:bg-bg-deep/45">
                      {columns.map((column) => (
                        <td key={`${idx}-${column}`} className="px-1.5 py-1 font-mono text-text-secondary whitespace-nowrap">
                          {toCellText(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/70 bg-surface px-1.5 py-1">
      <div className="text-[9px] text-text-muted">{label}</div>
      <div className="text-[10px] font-mono text-text-secondary">{value}</div>
    </div>
  )
}
