import type { AggregationSpec, Filter, HavingSpec, TableQuerySpec } from '../types.ts'

export const FILTER_OPS = ['=', '!=', '>', '<', '>=', '<=', 'contains', 'starts_with', 'is_null', 'is_not_null'] as const
export const AGG_OPS: ReadonlyArray<AggregationSpec['op']> = ['count', 'sum', 'avg', 'min', 'max']
export const HAVING_OPS: ReadonlyArray<'=' | '!=' | '>' | '<' | '>=' | '<='> = ['=', '!=', '>', '<', '>=', '<=']

export const INPUT_CLASS = 'h-6 bg-surface-elevated border border-border-strong rounded px-1.5 text-[11px] text-text-secondary'
export const ACTION_CLASS = 'h-6 px-2 rounded border border-border-strong bg-surface text-[11px] text-text-secondary hover:text-text hover:border-accent transition-colors'

export function isNullOp(op: string) {
  return op === 'is_null' || op === 'is_not_null'
}

export function getAggAlias(agg: AggregationSpec): string {
  if (typeof agg.as === 'string' && agg.as.trim()) return agg.as.trim()
  return `${agg.op}_${agg.column.replace('*', 'all')}`
}

export function formatFilterOp(op: string) {
  if (op === 'starts_with') return 'starts with'
  if (op === 'is_null') return 'is null'
  if (op === 'is_not_null') return 'is not null'
  return op
}

export function ensureDraftColumn(current: string, columns: string[]): string {
  if (!columns.length) return ''
  if (current && columns.includes(current)) return current
  return columns[0]
}

export function appendFilter(spec: TableQuerySpec, draft: Filter): TableQuerySpec {
  if (!draft.column || !draft.operator) return spec
  const normalized: Filter = isNullOp(draft.operator)
    ? { column: draft.column, operator: draft.operator, value: '' }
    : draft
  return { ...spec, filters: [...spec.filters, normalized] }
}

export function appendGroupBy(spec: TableQuerySpec, column: string): TableQuerySpec {
  if (!column || spec.groupBy.includes(column)) return spec
  return { ...spec, groupBy: [...spec.groupBy, column] }
}

export function appendAggregation(
  spec: TableQuerySpec,
  draft: { op: AggregationSpec['op']; column: string },
): TableQuerySpec {
  if (!draft.column) return spec
  return { ...spec, aggregations: [...spec.aggregations, { op: draft.op, column: draft.column }] }
}

export function appendHaving(spec: TableQuerySpec, draft: HavingSpec): TableQuerySpec {
  if (!draft.metric || !draft.operator) return spec
  const raw = String(draft.value).trim()
  if (!raw) return spec
  const parsed = Number(raw)
  const value: string | number = Number.isFinite(parsed) ? parsed : raw
  return {
    ...spec,
    having: [...spec.having, { metric: draft.metric, operator: draft.operator, value }],
  }
}

export function appendSort(spec: TableQuerySpec, draft: { column: string; direction: 'asc' | 'desc' }): TableQuerySpec {
  if (!draft.column) return spec
  return { ...spec, sort: [...spec.sort, draft] }
}

export function applyLimitValue(spec: TableQuerySpec, input: string): { spec: TableQuerySpec; limit: string } {
  const parsed = Number(input)
  if (!Number.isFinite(parsed)) return { spec, limit: String(spec.limit ?? 200) }
  const clamped = Math.max(1, Math.min(10000, Math.trunc(parsed)))
  return { spec: { ...spec, limit: clamped }, limit: String(clamped) }
}

export function QueryToggle({
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
          ? 'bg-bg-deep/60 border-border-strong text-text-muted'
          : 'bg-surface border-border text-text-muted hover:text-text-secondary'
      }`}
    >
      {label} {value}
    </button>
  )
}

export function QueryChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded text-[10px] bg-bg-deep/55 border border-border/70 text-text-muted font-mono">
      {label}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="text-text-muted hover:text-text"
        aria-label={`Remove ${label}`}
      >
        x
      </button>
    </span>
  )
}
