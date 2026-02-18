import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRunTableQuery } from '../api.ts'
import { useAppStore } from '../store.ts'
import type { AggregationSpec, Filter, HavingSpec, InvestigationCell, TableQueryResponse } from '../types.ts'
import {
  ACTION_CLASS,
  AGG_OPS,
  appendAggregation,
  appendFilter,
  appendGroupBy,
  appendHaving,
  appendSort,
  applyLimitValue,
  ensureDraftColumn,
  getFilterOpsForType,
  HAVING_OPS,
  INPUT_CLASS,
  normalizeFilterOperator,
  QueryChip,
  QueryToggle,
  formatFilterOp,
  getAggAlias,
  isNullOp,
} from './query-builder-shared.tsx'

type ControlKey = 'filter' | 'analyze' | 'sort' | 'limit'

export function TableCell({ cell }: { cell: InvestigationCell }) {
  const datasets = useAppStore((s) => s.datasets)
  const activeDataset = useAppStore((s) => s.activeDataset)
  const dataset = datasets.find((d) => d.id === cell.datasetId) ?? activeDataset
  const updateCell = useAppStore((s) => s.updateCell)
  const removeCell = useAppStore((s) => s.removeCell)
  const setActiveCell = useAppStore((s) => s.setActiveCell)
  const activeCellId = useAppStore((s) => s.activeCellId)
  const mutation = useRunTableQuery(dataset?.id)

  const spec = cell.tableSpec ?? { filters: [], groupBy: [], aggregations: [], having: [], sort: [], limit: 200 }
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

  const havingMetrics = useMemo(() => spec.aggregations.map(getAggAlias), [spec.aggregations])
  const [havingDraft, setHavingDraft] = useState<HavingSpec>({
    metric: havingMetrics[0] ?? '',
    operator: '>',
    value: '',
  })

  useEffect(() => {
    if (havingMetrics.length === 0) {
      setHavingDraft((s) => ({ ...s, metric: '' }))
      return
    }
    setHavingDraft((s) =>
      havingMetrics.includes(s.metric)
        ? s
        : { ...s, metric: havingMetrics[0] },
    )
  }, [havingMetrics])

  useEffect(() => {
    const names = columns.map((c) => c.name)
    setFilterDraft((s) => ({ ...s, column: ensureDraftColumn(s.column, names) }))
    setGroupByDraft((prev) => ensureDraftColumn(prev, names))
    setAggDraft((s) => ({ ...s, column: s.column === '*' ? '*' : ensureDraftColumn(s.column, names) }))
    setSortDraft((s) => ({ ...s, column: ensureDraftColumn(s.column, names) }))
  }, [columns])

  useEffect(() => {
    const type = columns.find((c) => c.name === filterDraft.column)?.type
    setFilterDraft((s) => ({ ...s, operator: normalizeFilterOperator(s.operator, type) }))
  }, [columns, filterDraft.column])

  const result = cell.result as TableQueryResponse | null
  const canRun = useMemo(() => !!dataset, [dataset])
  const filterOps = useMemo(
    () => getFilterOpsForType(columns.find((c) => c.name === filterDraft.column)?.type),
    [columns, filterDraft.column],
  )

  const runCell = useCallback(() => {
    if (!canRun) return
    updateCell(cell.id, { isRunning: true, error: null })
    mutation.mutate(spec, {
      onSuccess: (data) => {
        updateCell(cell.id, {
          result: data,
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
    updateCell(cell.id, { tableSpec: appendFilter(spec, filterDraft) })
  }

  function addGroup() {
    updateCell(cell.id, { tableSpec: appendGroupBy(spec, groupByDraft) })
  }

  function addAgg() {
    updateCell(cell.id, { tableSpec: appendAggregation(spec, aggDraft) })
  }

  function addHaving() {
    updateCell(cell.id, { tableSpec: appendHaving(spec, havingDraft) })
  }

  function addSort() {
    updateCell(cell.id, { tableSpec: appendSort(spec, sortDraft) })
  }

  function applyLimit() {
    const next = applyLimitValue(spec, limitDraft)
    setLimitDraft(next.limit)
    updateCell(cell.id, { tableSpec: next.spec })
  }

  function toggleControl(key: ControlKey) {
    setActiveControl((curr) => (curr === key ? null : key))
  }

  return (
    <div
      id={`cell-${cell.id}`}
      onClick={() => setActiveCell(cell.id)}
      className={`overflow-hidden border bg-surface ${isActive ? 'border-accent border-l-2' : 'border-border'}`}
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

      <div className="px-2.5 py-1 border-b border-border-strong bg-bg-deep/70 flex items-center gap-1.5 text-[10px] font-mono flex-wrap">
        <QueryToggle label="Filter" value={String(spec.filters.length)} active={activeControl === 'filter'} onClick={() => toggleControl('filter')} />
        <QueryToggle
          label="Analyze"
          value={`G${spec.groupBy.length} A${spec.aggregations.length} H${spec.having.length}`}
          active={activeControl === 'analyze'}
          onClick={() => toggleControl('analyze')}
        />
        <QueryToggle label="Sort" value={String(spec.sort.length)} active={activeControl === 'sort'} onClick={() => toggleControl('sort')} />
        <QueryToggle label="Limit" value={String(spec.limit ?? 200)} active={activeControl === 'limit'} onClick={() => toggleControl('limit')} />
      </div>

      {(spec.filters.length > 0 || spec.groupBy.length > 0 || spec.aggregations.length > 0 || spec.having.length > 0 || spec.sort.length > 0) && (
        <div className="px-2.5 py-1 border-b border-border bg-bg-deep/60 flex items-center gap-1 flex-wrap">
          {spec.filters.map((f, idx) => (
            <QueryChip
              key={`f-${idx}`}
              label={`${f.column} ${formatFilterOp(f.operator)}${isNullOp(f.operator) ? '' : ` ${String(f.value)}`}`}
              onRemove={() => updateCell(cell.id, { tableSpec: { ...spec, filters: spec.filters.filter((_, i) => i !== idx) } })}
            />
          ))}
          {spec.groupBy.map((g) => (
            <QueryChip
              key={`g-${g}`}
              label={`group ${g}`}
              onRemove={() => updateCell(cell.id, { tableSpec: { ...spec, groupBy: spec.groupBy.filter((c) => c !== g) } })}
            />
          ))}
          {spec.aggregations.map((a, idx) => (
            <QueryChip
              key={`a-${idx}`}
              label={`${getAggAlias(a)}=${a.op}(${a.column})`}
              onRemove={() => {
                const removed = getAggAlias(a)
                const nextAggs = spec.aggregations.filter((_, i) => i !== idx)
                updateCell(cell.id, {
                  tableSpec: {
                    ...spec,
                    aggregations: nextAggs,
                    having: spec.having.filter((h) => h.metric !== removed),
                  },
                })
              }}
            />
          ))}
          {spec.having.map((h, idx) => (
            <QueryChip
              key={`h-${idx}`}
              label={`having ${h.metric} ${h.operator} ${String(h.value)}`}
              onRemove={() => updateCell(cell.id, { tableSpec: { ...spec, having: spec.having.filter((_, i) => i !== idx) } })}
            />
          ))}
          {spec.sort.map((s, idx) => (
            <QueryChip
              key={`s-${idx}`}
              label={`sort ${s.column} ${s.direction}`}
              onRemove={() => updateCell(cell.id, { tableSpec: { ...spec, sort: spec.sort.filter((_, i) => i !== idx) } })}
            />
          ))}
        </div>
      )}

      {activeControl && (
        <div className="px-2.5 py-1.5 border-b border-border bg-bg-deep/70">
          {activeControl === 'filter' && (
            <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
              <select
                value={filterDraft.column}
                onChange={(e) => {
                  const nextColumn = e.target.value
                  const nextType = columns.find((c) => c.name === nextColumn)?.type
                  setFilterDraft((s) => ({
                    ...s,
                    column: nextColumn,
                    operator: normalizeFilterOperator(s.operator, nextType),
                  }))
                }}
                className={INPUT_CLASS}
              >
                {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <select
                value={filterDraft.operator}
                onChange={(e) => setFilterDraft((s) => ({ ...s, operator: e.target.value }))}
                className={INPUT_CLASS}
              >
                {filterOps.map((op) => <option key={op} value={op}>{formatFilterOp(op)}</option>)}
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

          {activeControl === 'analyze' && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                <span className="w-12 text-right text-text-muted font-mono text-[10px]">Group</span>
                <select
                  value={groupByDraft}
                  onChange={(e) => setGroupByDraft(e.target.value)}
                  className={INPUT_CLASS}
                >
                  {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <button onClick={addGroup} className={ACTION_CLASS}>+ Group</button>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                <span className="w-12 text-right text-text-muted font-mono text-[10px]">Agg</span>
                <select
                  value={aggDraft.op}
                  onChange={(e) => setAggDraft((s) => ({ ...s, op: e.target.value as AggregationSpec['op'] }))}
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

              <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                <span className="w-12 text-right text-text-muted font-mono text-[10px]">Having</span>
                <select
                  value={havingDraft.metric}
                  onChange={(e) => setHavingDraft((s) => ({ ...s, metric: e.target.value }))}
                  className={INPUT_CLASS}
                  disabled={havingMetrics.length === 0}
                >
                  {havingMetrics.length === 0 ? (
                    <option value="">add agg first</option>
                  ) : (
                    havingMetrics.map((m) => <option key={m} value={m}>{m}</option>)
                  )}
                </select>
                <select
                  value={havingDraft.operator}
                  onChange={(e) => setHavingDraft((s) => ({ ...s, operator: e.target.value as HavingSpec['operator'] }))}
                  className={INPUT_CLASS}
                  disabled={havingMetrics.length === 0}
                >
                  {HAVING_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
                <input
                  value={String(havingDraft.value)}
                  onChange={(e) => setHavingDraft((s) => ({ ...s, value: e.target.value }))}
                  placeholder="value"
                  className={`${INPUT_CLASS} min-w-24`}
                  disabled={havingMetrics.length === 0}
                />
                <button onClick={addHaving} className={ACTION_CLASS} disabled={havingMetrics.length === 0}>+ Having</button>
              </div>
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
        <div className="border-t border-border bg-bg">
          <div className="px-3 py-1.5 text-[10px] text-text-muted border-b border-border font-mono bg-bg">
            {result.rowCount.toLocaleString()} rows x {result.columns.length} cols
          </div>
          <div className="overflow-auto max-h-[360px] bg-bg">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-[1]">
                <tr className="bg-bg border-b border-border">
                  {result.columns.map((col) => (
                    <th key={col} className="px-3 py-2 text-left font-medium text-text-secondary">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="h-[34px] border-b border-border hover:bg-surface-hover/40 transition-colors">
                    {result.columns.map((col) => (
                      <td key={col} className="px-3 py-0 font-mono text-xs text-text">
                        {row[col] == null ? <span className="text-text-muted/40 italic">null</span> : <span className="truncate block">{String(row[col])}</span>}
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
