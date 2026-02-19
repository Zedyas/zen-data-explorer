import { useCallback, useEffect, useMemo, useRef, useState, type RefObject, type UIEvent } from 'react'
import { useRunTableQuery } from '../api.ts'
import { useAppStore } from '../store.ts'
import { CodeCell } from './CodeCell.tsx'
import { TableCell } from './TableCell.tsx'
import type { AggregationSpec, ColumnType, Filter, HavingSpec, InvestigationCell, TableQueryResponse, TableQuerySpec } from '../types.ts'
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
type CompareControlKey = 'filter' | 'analyze' | 'sort' | 'limit'

function defaultSpec(): TableQuerySpec {
  return {
    filters: [],
    groupBy: [],
    aggregations: [],
    having: [],
    sort: [],
    limit: 200,
  }
}

function compareMetricDelta(left: number, right: number): string {
  const diff = left - right
  const pct = right === 0 ? null : (diff / right) * 100
  if (pct == null || !Number.isFinite(pct)) return `${diff.toLocaleString()}`
  return `${diff.toLocaleString()} (${pct.toFixed(1)}%)`
}

function CompareCell({ cell }: { cell: InvestigationCell }) {
  const datasets = useAppStore((s) => s.datasets)
  const updateCell = useAppStore((s) => s.updateCell)
  const removeCell = useAppStore((s) => s.removeCell)
  const setActiveCell = useAppStore((s) => s.setActiveCell)
  const activeCellId = useAppStore((s) => s.activeCellId)
  const isActive = activeCellId === cell.id

  const compare = cell.compare

  useEffect(() => {
    if (compare) return
    const left = datasets[0]?.id ?? null
    const right = datasets.find((d) => d.id !== left)?.id ?? left
    updateCell(cell.id, {
      compare: {
        leftDatasetId: left,
        rightDatasetId: right,
        leftSpec: defaultSpec(),
        rightSpec: defaultSpec(),
        leftResult: null,
        rightResult: null,
      },
      compareUi: {
        showControls: false,
        syncScroll: false,
      },
    })
  }, [compare, datasets, updateCell, cell.id])

  useEffect(() => {
    if (!compare || cell.compareUi) return
    updateCell(cell.id, {
      compareUi: {
        showControls: false,
        syncScroll: false,
      },
    })
  }, [compare, cell.compareUi, updateCell, cell.id])

  const leftDataset = datasets.find((d) => d.id === compare?.leftDatasetId) ?? null
  const rightDataset = datasets.find((d) => d.id === compare?.rightDatasetId) ?? null
  const leftMutation = useRunTableQuery(leftDataset?.id)
  const rightMutation = useRunTableQuery(rightDataset?.id)

  const [leftFilterDraft, setLeftFilterDraft] = useState<Filter>({ column: '', operator: '=', value: '' })
  const [rightFilterDraft, setRightFilterDraft] = useState<Filter>({ column: '', operator: '=', value: '' })
  const [leftGroupDraft, setLeftGroupDraft] = useState('')
  const [rightGroupDraft, setRightGroupDraft] = useState('')
  const [leftAggDraft, setLeftAggDraft] = useState<{ op: AggregationSpec['op']; column: string }>({ op: 'count', column: '*' })
  const [rightAggDraft, setRightAggDraft] = useState<{ op: AggregationSpec['op']; column: string }>({ op: 'count', column: '*' })
  const [leftHavingDraft, setLeftHavingDraft] = useState<HavingSpec>({ metric: '', operator: '>', value: '' })
  const [rightHavingDraft, setRightHavingDraft] = useState<HavingSpec>({ metric: '', operator: '>', value: '' })
  const [leftSortDraft, setLeftSortDraft] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: '', direction: 'asc' })
  const [rightSortDraft, setRightSortDraft] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: '', direction: 'asc' })
  const [leftLimitDraft, setLeftLimitDraft] = useState('200')
  const [rightLimitDraft, setRightLimitDraft] = useState('200')
  const runVersionRef = useRef(0)
  const syncingRef = useRef(false)
  const leftPaneRef = useRef<HTMLDivElement | null>(null)
  const rightPaneRef = useRef<HTMLDivElement | null>(null)
  const showControls = cell.compareUi?.showControls ?? false
  const syncScroll = cell.compareUi?.syncScroll ?? false

  useEffect(() => {
    const cols = leftDataset?.columns ?? []
    const names = cols.map((c) => c.name)
    setLeftFilterDraft((s) => ({ ...s, column: ensureDraftColumn(s.column, names) }))
    setLeftGroupDraft((s) => ensureDraftColumn(s, names))
    setLeftAggDraft((s) => ({ ...s, column: s.column === '*' ? '*' : ensureDraftColumn(s.column, names) }))
    setLeftSortDraft((s) => ({ ...s, column: ensureDraftColumn(s.column, names) }))
  }, [leftDataset])

  useEffect(() => {
    const cols = rightDataset?.columns ?? []
    const names = cols.map((c) => c.name)
    setRightFilterDraft((s) => ({ ...s, column: ensureDraftColumn(s.column, names) }))
    setRightGroupDraft((s) => ensureDraftColumn(s, names))
    setRightAggDraft((s) => ({ ...s, column: s.column === '*' ? '*' : ensureDraftColumn(s.column, names) }))
    setRightSortDraft((s) => ({ ...s, column: ensureDraftColumn(s.column, names) }))
  }, [rightDataset])

  const leftMetrics = useMemo(() => (compare?.leftSpec.aggregations ?? []).map(getAggAlias), [compare?.leftSpec.aggregations])
  const rightMetrics = useMemo(() => (compare?.rightSpec.aggregations ?? []).map(getAggAlias), [compare?.rightSpec.aggregations])

  useEffect(() => {
    if (!leftMetrics.length) return
    if (!leftHavingDraft.metric || !leftMetrics.includes(leftHavingDraft.metric)) {
      setLeftHavingDraft((s) => ({ ...s, metric: leftMetrics[0] }))
    }
  }, [leftMetrics, leftHavingDraft.metric])

  useEffect(() => {
    if (!rightMetrics.length) return
    if (!rightHavingDraft.metric || !rightMetrics.includes(rightHavingDraft.metric)) {
      setRightHavingDraft((s) => ({ ...s, metric: rightMetrics[0] }))
    }
  }, [rightMetrics, rightHavingDraft.metric])

  if (!compare) {
    return (
      <div id={`cell-${cell.id}`} className="overflow-hidden border border-border bg-surface">
        <div className="px-3 py-2 text-xs text-text-muted">Preparing compare cell...</div>
      </div>
    )
  }

  const compareState = compare

  function patchCompare(next: NonNullable<InvestigationCell['compare']>) {
    updateCell(cell.id, { compare: next })
  }

  function setCompareUi(patch: Partial<NonNullable<InvestigationCell['compareUi']>>) {
    updateCell(cell.id, {
      compareUi: {
        showControls,
        syncScroll,
        ...patch,
      },
    })
  }

  function updateSpec(side: 'left' | 'right', patch: Partial<TableQuerySpec>) {
    if (side === 'left') {
      patchCompare({ ...compareState, leftSpec: { ...compareState.leftSpec, ...patch }, leftResult: null })
    } else {
      patchCompare({ ...compareState, rightSpec: { ...compareState.rightSpec, ...patch }, rightResult: null })
    }
  }

  const runCompare = useCallback(() => {
    if (!leftDataset || !rightDataset) {
      updateCell(cell.id, { error: 'Select datasets for both Left and Right panels.' })
      return
    }

    const compareSnapshot = compareState
    const runVersion = runVersionRef.current + 1
    runVersionRef.current = runVersion

    updateCell(cell.id, { isRunning: true, error: null })
    let leftDone = false
    let rightDone = false
    let leftResult: TableQueryResponse | null = null
    let rightResult: TableQueryResponse | null = null
    let leftErr: string | null = null
    let rightErr: string | null = null

    const finalize = () => {
      if (!leftDone || !rightDone) return
      if (runVersionRef.current !== runVersion) return
      const error = [leftErr, rightErr].filter(Boolean).join(' | ') || null
      updateCell(cell.id, {
        isRunning: false,
        error,
        compare: { ...compareSnapshot, leftResult, rightResult },
      })
    }

    leftMutation.mutate(compareSnapshot.leftSpec, {
      onSuccess: (data) => {
        leftResult = data
        leftDone = true
        finalize()
      },
      onError: (err) => {
        leftErr = err.message
        leftDone = true
        finalize()
      },
    })

    rightMutation.mutate(compareSnapshot.rightSpec, {
      onSuccess: (data) => {
        rightResult = data
        rightDone = true
        finalize()
      },
      onError: (err) => {
        rightErr = err.message
        rightDone = true
        finalize()
      },
    })
  }, [leftDataset, rightDataset, updateCell, cell.id, compareState, leftMutation, rightMutation])

  const handlePaneScroll = useCallback(
    (side: 'left' | 'right') => (event: UIEvent<HTMLDivElement>) => {
      if (!syncScroll || syncingRef.current) return
      const source = event.currentTarget
      const target = side === 'left' ? rightPaneRef.current : leftPaneRef.current
      if (!target) return
      syncingRef.current = true
      target.scrollTop = source.scrollTop
      requestAnimationFrame(() => {
        syncingRef.current = false
      })
    },
    [syncScroll],
  )

  useEffect(() => {
    if (!compareState.leftDatasetId || !compareState.rightDatasetId) return
    if (cell.isRunning) return
    if (compareState.leftResult || compareState.rightResult) return
    runCompare()
  }, [compareState.leftDatasetId, compareState.rightDatasetId, compareState.leftResult, compareState.rightResult, cell.isRunning, runCompare])

  return (
    <div
      id={`cell-${cell.id}`}
      onClick={() => setActiveCell(cell.id)}
      className={`overflow-hidden border bg-surface ${isActive ? 'border-accent border-l-2' : 'border-border'}`}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border-strong bg-surface">
        <span className="text-xs text-text-secondary">{cell.title}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              runCompare()
            }}
            disabled={cell.isRunning}
            className="px-2 py-0.5 rounded text-xs bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 transition-colors"
          >
            {cell.isRunning ? 'Running...' : 'Run Compare'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setCompareUi({ showControls: !showControls })
            }}
            className="px-2 py-0.5 rounded text-xs border border-border-strong bg-surface text-text-muted hover:text-text-secondary"
          >
            {showControls ? 'Hide controls' : 'Edit controls'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setCompareUi({ syncScroll: !syncScroll })
            }}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              syncScroll
                ? 'border-accent/40 bg-accent-dim text-accent'
                : 'border-border-strong bg-surface text-text-muted hover:text-text-secondary'
            }`}
          >
            Sync scroll
          </button>
          <button onClick={() => removeCell(cell.id)} className="text-text-muted hover:text-error text-sm px-1">&times;</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        <CompareSideConfig
          label="Left"
          datasets={datasets}
          datasetId={compareState.leftDatasetId}
          setDatasetId={(datasetId) => patchCompare({ ...compareState, leftDatasetId: datasetId, leftSpec: defaultSpec(), leftResult: null, rightResult: null })}
          spec={compareState.leftSpec}
          setSpec={(patch) => updateSpec('left', patch)}
          result={compareState.leftResult}
          filterDraft={leftFilterDraft}
          setFilterDraft={setLeftFilterDraft}
          groupDraft={leftGroupDraft}
          setGroupDraft={setLeftGroupDraft}
          aggDraft={leftAggDraft}
          setAggDraft={setLeftAggDraft}
          havingDraft={leftHavingDraft}
          setHavingDraft={setLeftHavingDraft}
          sortDraft={leftSortDraft}
          setSortDraft={setLeftSortDraft}
          limitDraft={leftLimitDraft}
          setLimitDraft={setLeftLimitDraft}
          metrics={leftMetrics}
          showControls={showControls}
          paneRef={leftPaneRef}
          onPaneScroll={handlePaneScroll('left')}
          isRunning={cell.isRunning}
        />

        <CompareSideConfig
          label="Right"
          datasets={datasets}
          datasetId={compareState.rightDatasetId}
          setDatasetId={(datasetId) => patchCompare({ ...compareState, rightDatasetId: datasetId, rightSpec: defaultSpec(), leftResult: null, rightResult: null })}
          spec={compareState.rightSpec}
          setSpec={(patch) => updateSpec('right', patch)}
          result={compareState.rightResult}
          filterDraft={rightFilterDraft}
          setFilterDraft={setRightFilterDraft}
          groupDraft={rightGroupDraft}
          setGroupDraft={setRightGroupDraft}
          aggDraft={rightAggDraft}
          setAggDraft={setRightAggDraft}
          havingDraft={rightHavingDraft}
          setHavingDraft={setRightHavingDraft}
          sortDraft={rightSortDraft}
          setSortDraft={setRightSortDraft}
          limitDraft={rightLimitDraft}
          setLimitDraft={setRightLimitDraft}
          metrics={rightMetrics}
          showControls={showControls}
          paneRef={rightPaneRef}
          onPaneScroll={handlePaneScroll('right')}
          isRunning={cell.isRunning}
        />
      </div>

      {(compareState.leftResult && compareState.rightResult) && (
        <div className="px-2.5 py-1 border-t border-border bg-bg-deep text-[10px] font-mono text-text-muted flex items-center gap-3 flex-wrap">
          <span>rows delta: {compareMetricDelta(compareState.leftResult.rowCount, compareState.rightResult.rowCount)}</span>
          <span>cols delta: {compareMetricDelta(compareState.leftResult.columns.length, compareState.rightResult.columns.length)}</span>
          <span>left: {compareState.leftResult.rowCount.toLocaleString()}x{compareState.leftResult.columns.length}</span>
          <span>right: {compareState.rightResult.rowCount.toLocaleString()}x{compareState.rightResult.columns.length}</span>
        </div>
      )}

      {cell.error && <div className="px-3 py-2 text-xs text-error border-t border-border bg-error/5">{cell.error}</div>}
    </div>
  )
}

function CompareSideConfig({
  label,
  datasets,
  datasetId,
  setDatasetId,
  spec,
  setSpec,
  result,
  filterDraft,
  setFilterDraft,
  groupDraft,
  setGroupDraft,
  aggDraft,
  setAggDraft,
  havingDraft,
  setHavingDraft,
  sortDraft,
  setSortDraft,
  limitDraft,
  setLimitDraft,
  metrics,
  showControls,
  paneRef,
  onPaneScroll,
  isRunning,
}: {
  label: string
  datasets: Array<{ id: string; name: string; columns: Array<{ name: string; type: ColumnType }> }>
  datasetId: string | null
  setDatasetId: (id: string | null) => void
  spec: TableQuerySpec
  setSpec: (patch: Partial<TableQuerySpec>) => void
  result: TableQueryResponse | null
  filterDraft: Filter
  setFilterDraft: (v: Filter | ((prev: Filter) => Filter)) => void
  groupDraft: string
  setGroupDraft: (v: string) => void
  aggDraft: { op: AggregationSpec['op']; column: string }
  setAggDraft: (v: { op: AggregationSpec['op']; column: string } | ((prev: { op: AggregationSpec['op']; column: string }) => { op: AggregationSpec['op']; column: string })) => void
  havingDraft: HavingSpec
  setHavingDraft: (v: HavingSpec | ((prev: HavingSpec) => HavingSpec)) => void
  sortDraft: { column: string; direction: 'asc' | 'desc' }
  setSortDraft: (v: { column: string; direction: 'asc' | 'desc' } | ((prev: { column: string; direction: 'asc' | 'desc' }) => { column: string; direction: 'asc' | 'desc' })) => void
  limitDraft: string
  setLimitDraft: (v: string) => void
  metrics: string[]
  showControls: boolean
  paneRef: RefObject<HTMLDivElement | null>
  onPaneScroll: (event: UIEvent<HTMLDivElement>) => void
  isRunning: boolean
}) {
  const dataset = datasets.find((d) => d.id === datasetId)
  const columns = dataset?.columns ?? []
  const [activeControl, setActiveControl] = useState<CompareControlKey | null>('filter')
  const filterOps = useMemo(
    () => getFilterOpsForType(columns.find((c) => c.name === filterDraft.column)?.type),
    [columns, filterDraft.column],
  )

  useEffect(() => {
    const type = columns.find((c) => c.name === filterDraft.column)?.type
    setFilterDraft((s) => ({ ...s, operator: normalizeFilterOperator(s.operator, type) }))
  }, [columns, filterDraft.column, setFilterDraft])

  function addFilter() {
    setSpec(appendFilter(spec, filterDraft))
  }

  function addGroup() {
    setSpec(appendGroupBy(spec, groupDraft))
  }

  function addAgg() {
    setSpec(appendAggregation(spec, aggDraft))
  }

  function addHaving() {
    setSpec(appendHaving(spec, havingDraft))
  }

  function addSort() {
    setSpec(appendSort(spec, sortDraft))
  }

  function applyLimit() {
    const next = applyLimitValue(spec, limitDraft)
    setLimitDraft(next.limit)
    setSpec(next.spec)
  }

  return (
    <div className="border-t border-border lg:border-t-0 lg:border-l first:lg:border-l-0">
      <div className="px-2.5 py-1 border-b border-border/60 bg-surface flex items-center justify-between text-[10px] font-mono">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-muted">{result ? `${result.rowCount}x${result.columns.length}` : 'not run'}</span>
      </div>

      <div className="p-2 space-y-1.5 bg-bg-deep/70 border-b border-border/60">
        <select
          value={datasetId ?? ''}
          onChange={(e) => setDatasetId(e.target.value || null)}
          className={`${INPUT_CLASS} w-full`}
          disabled={isRunning}
        >
          <option value="">Select dataset</option>
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        {!dataset && <div className="text-[10px] text-text-muted">Pick a dataset to configure this side.</div>}
        {showControls && (
          <fieldset className="space-y-1.5" disabled={isRunning}>
            <div className="flex items-center gap-1.5 text-[10px] font-mono flex-wrap">
              <QueryToggle label="Filter" value={String(spec.filters.length)} active={activeControl === 'filter'} onClick={() => setActiveControl((v) => (v === 'filter' ? null : 'filter'))} />
              <QueryToggle label="Analyze" value={`G${spec.groupBy.length} A${spec.aggregations.length} H${spec.having.length}`} active={activeControl === 'analyze'} onClick={() => setActiveControl((v) => (v === 'analyze' ? null : 'analyze'))} />
              <QueryToggle label="Sort" value={String(spec.sort.length)} active={activeControl === 'sort'} onClick={() => setActiveControl((v) => (v === 'sort' ? null : 'sort'))} />
              <QueryToggle label="Limit" value={String(spec.limit ?? 200)} active={activeControl === 'limit'} onClick={() => setActiveControl((v) => (v === 'limit' ? null : 'limit'))} />
            </div>

            {activeControl === 'filter' && (
              <div className="flex items-center gap-1.5 flex-wrap">
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
                <select value={filterDraft.operator} onChange={(e) => setFilterDraft((s) => ({ ...s, operator: e.target.value }))} className={INPUT_CLASS}>
                  {filterOps.map((op) => <option key={op} value={op}>{formatFilterOp(op)}</option>)}
                </select>
                {!isNullOp(filterDraft.operator) && (
                  <input value={String(filterDraft.value)} onChange={(e) => setFilterDraft((s) => ({ ...s, value: e.target.value }))} className={`${INPUT_CLASS} min-w-20`} placeholder="value" />
                )}
                <button onClick={addFilter} className={ACTION_CLASS}>+ Filter</button>
              </div>
            )}

            {activeControl === 'analyze' && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="w-12 text-right text-text-muted font-mono text-[10px]">Group</span>
                  <select value={groupDraft} onChange={(e) => setGroupDraft(e.target.value)} className={INPUT_CLASS}>
                    {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                  <button onClick={addGroup} className={ACTION_CLASS}>+ Group</button>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="w-12 text-right text-text-muted font-mono text-[10px]">Agg</span>
                  <select value={aggDraft.op} onChange={(e) => setAggDraft((s) => ({ ...s, op: e.target.value as AggregationSpec['op'] }))} className={INPUT_CLASS}>
                    {AGG_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <select value={aggDraft.column} onChange={(e) => setAggDraft((s) => ({ ...s, column: e.target.value }))} className={INPUT_CLASS}>
                    <option value="*">*</option>
                    {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                  <button onClick={addAgg} className={ACTION_CLASS}>+ Agg</button>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="w-12 text-right text-text-muted font-mono text-[10px]">Having</span>
                  <select value={havingDraft.metric} onChange={(e) => setHavingDraft((s) => ({ ...s, metric: e.target.value }))} className={INPUT_CLASS} disabled={metrics.length === 0}>
                    {metrics.length === 0 ? <option value="">agg first</option> : metrics.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={havingDraft.operator} onChange={(e) => setHavingDraft((s) => ({ ...s, operator: e.target.value as HavingSpec['operator'] }))} className={INPUT_CLASS} disabled={metrics.length === 0}>
                    {HAVING_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <input value={String(havingDraft.value)} onChange={(e) => setHavingDraft((s) => ({ ...s, value: e.target.value }))} className={`${INPUT_CLASS} min-w-20`} placeholder="value" disabled={metrics.length === 0} />
                  <button onClick={addHaving} className={ACTION_CLASS} disabled={metrics.length === 0}>+ Having</button>
                </div>
              </div>
            )}

            {activeControl === 'sort' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <select value={sortDraft.column} onChange={(e) => setSortDraft((s) => ({ ...s, column: e.target.value }))} className={INPUT_CLASS}>
                  {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <select value={sortDraft.direction} onChange={(e) => setSortDraft((s) => ({ ...s, direction: e.target.value as 'asc' | 'desc' }))} className={INPUT_CLASS}>
                  <option value="asc">asc</option>
                  <option value="desc">desc</option>
                </select>
                <button onClick={addSort} className={ACTION_CLASS}>+ Sort</button>
              </div>
            )}

            {activeControl === 'limit' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <input type="number" min={1} max={10000} value={limitDraft} onChange={(e) => setLimitDraft(e.target.value)} className={`${INPUT_CLASS} w-16`} />
                <button onClick={applyLimit} className={ACTION_CLASS}>Apply</button>
              </div>
            )}
          </fieldset>
        )}
      </div>

      <div className="px-2 py-1 border-b border-border/50 bg-bg-deep/55 flex items-center gap-1 flex-wrap">
        {spec.filters.map((f, i) => (
          <QueryChip key={`f-${i}`} label={`${f.column} ${formatFilterOp(f.operator)}${isNullOp(f.operator) ? '' : ` ${String(f.value)}`}`} onRemove={() => setSpec({ filters: spec.filters.filter((_, idx) => idx !== i) })} />
        ))}
        {spec.groupBy.map((g) => (
          <QueryChip key={`g-${g}`} label={`group ${g}`} onRemove={() => setSpec({ groupBy: spec.groupBy.filter((x) => x !== g) })} />
        ))}
        {spec.aggregations.map((a, i) => (
          <QueryChip
            key={`a-${i}`}
            label={`${getAggAlias(a)}=${a.op}(${a.column})`}
            onRemove={() => {
              const removed = getAggAlias(a)
              setSpec({
                aggregations: spec.aggregations.filter((_, idx) => idx !== i),
                having: spec.having.filter((h) => h.metric !== removed),
              })
            }}
          />
        ))}
        {spec.having.map((h, i) => (
          <QueryChip key={`h-${i}`} label={`having ${h.metric} ${h.operator} ${String(h.value)}`} onRemove={() => setSpec({ having: spec.having.filter((_, idx) => idx !== i) })} />
        ))}
        {spec.sort.map((s, i) => (
          <QueryChip key={`s-${i}`} label={`sort ${s.column} ${s.direction}`} onRemove={() => setSpec({ sort: spec.sort.filter((_, idx) => idx !== i) })} />
        ))}
      </div>

      {result && (
        <div
          ref={paneRef}
          onScroll={onPaneScroll}
          className="overflow-auto max-h-[280px] bg-bg"
        >
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
      )}

      {!result && dataset && (
        <div className="px-2.5 py-2 text-[10px] text-text-muted bg-bg-deep/70">Run Compare to populate results for this side.</div>
      )}
    </div>
  )
}

export function CellCanvas() {
  const cells = useAppStore((s) => s.cells)
  const addCell = useAppStore((s) => s.addCell)
  const activeDataset = useAppStore((s) => s.activeDataset)
  const visibleCells = activeDataset ? cells.filter((c) => c.datasetId === activeDataset.id) : []

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[14px] font-mono uppercase tracking-[0.18em] text-text-secondary">Notebook</span>
        <div className="flex items-center gap-2 flex-wrap">
          <button disabled={!activeDataset} onClick={() => addCell('table')} className="h-7 px-2 rounded border border-border-strong bg-surface text-xs text-text-secondary hover:text-text hover:border-accent disabled:opacity-40 transition-colors">
            + Table Cell
          </button>
          <button disabled={!activeDataset} onClick={() => addCell('code')} className="h-7 px-2 rounded border border-border-strong bg-surface text-xs text-text-secondary hover:text-text hover:border-accent disabled:opacity-40 transition-colors">
            + Code Cell
          </button>
          <button onClick={() => addCell('compare')} className="h-7 px-2 rounded border border-border-strong bg-surface text-xs text-text-secondary hover:text-text hover:border-accent transition-colors">
            + Compare Cell
          </button>
          {!activeDataset && <span className="text-[10px] text-text-muted">Load/select a dataset to add cells.</span>}
        </div>
      </div>

      {visibleCells.length === 0 && (
        <div className="border border-dashed border-border-strong rounded-md p-6 text-center text-text-secondary text-sm bg-transparent">
          Notebook is empty. Add your first cell to start from the current Overview snapshot.
        </div>
      )}

      {visibleCells.map((cell) => {
        if (cell.type === 'table') return <TableCell key={cell.id} cell={cell} />
        if (cell.type === 'code') return <CodeCell key={cell.id} cell={cell} />
        return <CompareCell key={cell.id} cell={cell} />
      })}
    </div>
  )
}
