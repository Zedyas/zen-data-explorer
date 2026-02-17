import type { AggregationSpec } from '../types.ts'

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
          ? 'bg-accent-dim border-accent/40 text-accent'
          : 'bg-surface border-border text-text-muted hover:text-text-secondary'
      }`}
    >
      {label} {value}
    </button>
  )
}

export function QueryChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded text-[10px] bg-accent-dim text-accent font-mono">
      {label}
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
    </span>
  )
}
