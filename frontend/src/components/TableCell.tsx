import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRunTableQuery } from '../api.ts'
import { useAppStore } from '../store.ts'
import type { Filter, InvestigationCell, TableQueryResponse } from '../types.ts'

const FILTER_OPS = ['=', '!=', '>', '<', '>=', '<=', 'contains', 'starts_with', 'is_null', 'is_not_null']
const AGG_OPS = ['count', 'sum', 'avg', 'min', 'max'] as const
const INPUT_CLASS = 'h-6 bg-surface-elevated border border-border-strong rounded px-1.5 text-[11px] text-text-secondary'
const ACTION_CLASS = 'h-6 px-2 rounded border border-border-strong bg-surface text-[11px] text-text-secondary hover:text-text hover:border-accent transition-colors'

type ControlKey = 'filter' | 'group' | 'agg' | 'sort' | 'limit'

function isNullOp(op: string) {
  return op === 'is_null' || op === 'is_not_null'
}

export function TableCell({ cell }: { cell: InvestigationCell }) {
  const datasets = useAppStore((s) => s.datasets)
  const activeDataset = useAppStore((s) => s.activeDataset)
  const dataset = datasets.find((d) => d.id === cell.datasetId) ?? activeDataset
  const updateCell = useAppStore((s) => s.updateCell)
  const removeCell = useAppStore((s) => s.removeCell)
  const setActiveCell = useAppStore((s) => s.setActiveCell)
  const activeCellId = useAppStore((s) => s.activeCellId)
  const mutation = useRunTableQuery(dataset?.id)

  const spec = cell.tableSpec ?? { filters: [], groupBy: [], aggregations: [], sort: [], limit: 200 }
  const columns = dataset?.columns ?? []
  const isActive = activeCellId === cell.id

  const [activeControl, setActiveControl] = useState<ControlKey | null>(null)
  const [filterDraft, setFilterDraft] = useState<Filter>({
    column: columns[0]?.name ?? '',
    operator: '=',
    value: '',
  })
  const [groupByDraft, setGroupByDraft] = useState(columns[0]?.name ?? '')
  const [aggDraft, setAggDraft] = useState<{ op: 'count' | 'sum' | 'avg' | 'min' | 'max'; column: string }>({
    op: 'count',
    column: columns[0]?.name ?? '*',
  })
  const [sortDraft, setSortDraft] = useState<{ column: string; direction: 'asc' | 'desc' }>({
    column: columns[0]?.name ?? '',
    direction: 'asc',
  })
  const [limitDraft, setLimitDraft] = useState(String(spec.limit ?? 200))

  const result = cell.result as TableQueryResponse | null
  const canRun = useMemo(() => !!dataset, [dataset])

  const runCell = useCallback(() => {
    if (!canRun) return
    updateCell(cell.id, { isRunning: true, error: null })
    mutation.mutate(spec, {
      onSuccess: (data) => {
        updateCell(cell.id, {
          result: data,
          sql: data.generatedSql,
          python: data.generatedPython,
          isRunning: false,
          error: null,
        })
      },
      onError: (err) => {
        updateCell(cell.id, { isRunning: false, error: err.message, result: null })
      },
    })
  }, [canRun, updateCell, cell.id, mutation, spec])

  useEffect(() => {
    if (!cell.autoRun) return
    if (!canRun || cell.isRunning || cell.result) return
    updateCell(cell.id, { autoRun: false })
    runCell()
  }, [cell.autoRun, canRun, cell.isRunning, cell.result, cell.id, runCell, updateCell])

  function addFilter() {
    if (!filterDraft.column || !filterDraft.operator) return
    const cleanFilter: Filter = isNullOp(filterDraft.operator)
      ? { column: filterDraft.column, operator: filterDraft.operator, value: '' }
      : filterDraft
    updateCell(cell.id, { tableSpec: { ...spec, filters: [...spec.filters, cleanFilter] } })
  }

  function addGroup() {
    if (!groupByDraft || spec.groupBy.includes(groupByDraft)) return
    updateCell(cell.id, { tableSpec: { ...spec, groupBy: [...spec.groupBy, groupByDraft] } })
  }

  function addAgg() {
    updateCell(cell.id, {
      tableSpec: {
        ...spec,
        aggregations: [...spec.aggregations, { op: aggDraft.op, column: aggDraft.column }],
      },
    })
  }

  function addSort() {
    if (!sortDraft.column) return
    updateCell(cell.id, {
      tableSpec: {
        ...spec,
        sort: [...spec.sort, sortDraft],
      },
    })
  }

  function applyLimit() {
    const parsed = Number(limitDraft)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.max(1, Math.min(10000, Math.trunc(parsed)))
    setLimitDraft(String(clamped))
    updateCell(cell.id, { tableSpec: { ...spec, limit: clamped } })
  }

  function toggleControl(key: ControlKey) {
    setActiveControl((curr) => (curr === key ? null : key))
  }

  return (
    <div
      id={`cell-${cell.id}`}
      onClick={() => setActiveCell(cell.id)}
      className={`rounded-lg overflow-hidden ${isActive ? 'gradient-border-active' : 'gradient-border-subtle'}`}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border-strong bg-surface">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-text-secondary truncate">{cell.title}</span>
          {dataset && <span className="text-[10px] text-text-muted font-mono">{dataset.name}</span>}
          {result && (
            <span className="text-[10px] font-mono text-text-muted">
              {result.rowCount.toLocaleString()}x{result.columns.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              runCell()
            }}
            disabled={cell.isRunning || !canRun}
            className="px-2 py-0.5 rounded text-xs bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 transition-colors"
          >
            {cell.isRunning ? 'Running...' : 'Run'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              removeCell(cell.id)
            }}
            className="text-text-muted hover:text-error text-sm px-1"
          >
            &times;
          </button>
        </div>
      </div>

      <div className="px-2.5 py-1 border-b border-border-strong bg-bg-deep flex items-center gap-1.5 text-[10px] font-mono flex-wrap">
        <ControlToggle label="Filter" value={String(spec.filters.length)} active={activeControl === 'filter'} onClick={() => toggleControl('filter')} />
        <ControlToggle label="Group" value={String(spec.groupBy.length)} active={activeControl === 'group'} onClick={() => toggleControl('group')} />
        <ControlToggle label="Agg" value={String(spec.aggregations.length)} active={activeControl === 'agg'} onClick={() => toggleControl('agg')} />
        <ControlToggle label="Sort" value={String(spec.sort.length)} active={activeControl === 'sort'} onClick={() => toggleControl('sort')} />
        <ControlToggle label="Limit" value={String(spec.limit ?? 200)} active={activeControl === 'limit'} onClick={() => toggleControl('limit')} />
      </div>

      {(spec.filters.length > 0 || spec.groupBy.length > 0 || spec.aggregations.length > 0 || spec.sort.length > 0) && (
        <div className="px-2.5 py-1 border-b border-border bg-bg-deep/80 flex items-center gap-1 flex-wrap">
          {spec.filters.map((f, idx) => (
            <Chip
              key={`f-${idx}`}
              label={`${f.column} ${formatFilterOp(f.operator)}${isNullOp(f.operator) ? '' : ` ${String(f.value)}`}`}
              onRemove={() => updateCell(cell.id, { tableSpec: { ...spec, filters: spec.filters.filter((_, i) => i !== idx) } })}
            />
          ))}
          {spec.groupBy.map((g) => (
            <Chip
              key={`g-${g}`}
              label={`group ${g}`}
              onRemove={() => updateCell(cell.id, { tableSpec: { ...spec, groupBy: spec.groupBy.filter((c) => c !== g) } })}
            />
          ))}
          {spec.aggregations.map((a, idx) => (
            <Chip
              key={`a-${idx}`}
              label={`${a.op}(${a.column})`}
              onRemove={() => updateCell(cell.id, { tableSpec: { ...spec, aggregations: spec.aggregations.filter((_, i) => i !== idx) } })}
            />
          ))}
          {spec.sort.map((s, idx) => (
            <Chip
              key={`s-${idx}`}
              label={`sort ${s.column} ${s.direction}`}
              onRemove={() => updateCell(cell.id, { tableSpec: { ...spec, sort: spec.sort.filter((_, i) => i !== idx) } })}
            />
          ))}
        </div>
      )}

      {activeControl && (
        <div className="px-2.5 py-1.5 border-b border-border bg-bg-deep">
          {activeControl === 'filter' && (
            <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
              <select
                value={filterDraft.column}
                onChange={(e) => setFilterDraft((s) => ({ ...s, column: e.target.value }))}
                className={INPUT_CLASS}
              >
                {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <select
                value={filterDraft.operator}
                onChange={(e) => setFilterDraft((s) => ({ ...s, operator: e.target.value }))}
                className={INPUT_CLASS}
              >
                {FILTER_OPS.map((op) => <option key={op} value={op}>{formatFilterOp(op)}</option>)}
              </select>
              {!isNullOp(filterDraft.operator) && (
                <input
                  value={String(filterDraft.value)}
                  onChange={(e) => setFilterDraft((s) => ({ ...s, value: e.target.value }))}
                  placeholder="value"
                  className={`${INPUT_CLASS} min-w-28`}
                />
              )}
              <button onClick={addFilter} className={ACTION_CLASS}>+ Filter</button>
            </div>
          )}

          {activeControl === 'group' && (
            <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
              <select
                value={groupByDraft}
                onChange={(e) => setGroupByDraft(e.target.value)}
                className={INPUT_CLASS}
              >
                {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <button onClick={addGroup} className={ACTION_CLASS}>+ Group</button>
            </div>
          )}

          {activeControl === 'agg' && (
            <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
              <select
                value={aggDraft.op}
                onChange={(e) => setAggDraft((s) => ({ ...s, op: e.target.value as typeof AGG_OPS[number] }))}
                className={INPUT_CLASS}
              >
                {AGG_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              <select
                value={aggDraft.column}
                onChange={(e) => setAggDraft((s) => ({ ...s, column: e.target.value }))}
                className={INPUT_CLASS}
              >
                <option value="*">*</option>
                {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <button onClick={addAgg} className={ACTION_CLASS}>+ Agg</button>
            </div>
          )}

          {activeControl === 'sort' && (
            <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
              <select
                value={sortDraft.column}
                onChange={(e) => setSortDraft((s) => ({ ...s, column: e.target.value }))}
                className={INPUT_CLASS}
              >
                {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <select
                value={sortDraft.direction}
                onChange={(e) => setSortDraft((s) => ({ ...s, direction: e.target.value as 'asc' | 'desc' }))}
                className={INPUT_CLASS}
              >
                <option value="asc">asc</option>
                <option value="desc">desc</option>
              </select>
              <button onClick={addSort} className={ACTION_CLASS}>+ Sort</button>
            </div>
          )}

          {activeControl === 'limit' && (
            <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
              <input
                type="number"
                min={1}
                max={10000}
                value={limitDraft}
                onChange={(e) => setLimitDraft(e.target.value)}
                className={`${INPUT_CLASS} w-20`}
              />
              <button onClick={applyLimit} className={ACTION_CLASS}>Apply</button>
            </div>
          )}
        </div>
      )}

      {cell.error && (
        <div className="px-2.5 py-1.5 text-xs text-error border-t border-border bg-error/5">{cell.error}</div>
      )}

      {result && (
        <div className="border-t border-border">
          <div className="px-2.5 py-1 text-[10px] text-text-muted border-b border-border/50 font-mono">
            {result.rowCount.toLocaleString()} rows x {result.columns.length} cols
          </div>
          <div className="overflow-auto max-h-[360px]">
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
                  <tr key={i} className="border-t border-border/50 hover:bg-surface-hover/40">
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
          <details className="border-t border-border/40">
            <summary className="px-2.5 py-1 text-[10px] text-text-muted cursor-pointer">Generated code</summary>
            <div className="px-2.5 pb-2 space-y-2">
              <pre className="m-0 p-2 rounded bg-bg-deep text-[10px] text-text-secondary font-mono overflow-auto">{result.generatedSql}</pre>
              <pre className="m-0 p-2 rounded bg-bg-deep text-[10px] text-text-secondary font-mono overflow-auto">{result.generatedPython}</pre>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

function formatFilterOp(op: string) {
  if (op === 'starts_with') return 'starts with'
  if (op === 'is_null') return 'is null'
  if (op === 'is_not_null') return 'is not null'
  return op
}

function ControlToggle({
  label,
  value,
  active,
  onClick,
}: {
  label: string
  value: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-1 py-0.5 rounded border transition-colors ${
        active
          ? 'bg-accent-dim border-accent/40 text-accent'
          : 'bg-surface border-border text-text-muted hover:text-text-secondary'
      }`}
    >
      {label} {value}
    </button>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded text-[10px] bg-accent-dim text-accent font-mono">
      {label}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="text-accent/70 hover:text-accent"
          aria-label={`Remove ${label}`}
        >
          x
        </button>
      )}
    </span>
  )
}
