import { useAppStore } from '../store.ts'
import type { Column } from '../types.ts'

const TYPE_PREFIX: Record<string, string> = {
  string: 'A',
  integer: '#',
  float: '#',
  date: 'D',
  boolean: 'B',
}

const TYPE_BADGE_LABELS: Record<string, string> = {
  string: 'str',
  integer: 'int',
  float: 'flt',
  date: 'date',
  boolean: 'bool',
}

// Mini sparkline: 8 bars showing distribution shape
function Sparkline({ data }: { data: number[] }) {
  const values = data.filter((v) => v > 0)
  if (!values.length) return null
  const max = Math.max(...values, 1)

  return (
    <div className="flex items-end gap-[2px] h-3 mt-0.5 w-full">
      {values.map((v, i) => (
        <div
          key={i}
          className="sparkline-bar rounded-t-sm"
          style={{
            flex: 1,
            minWidth: values.length >= 8 ? '3px' : '6px',
            height: `${Math.max((v / max) * 100, 10)}%`,
          }}
        />
      ))}
    </div>
  )
}

interface ColumnHeaderProps {
  column: Column
  sparkline?: number[]
  onProfileClick?: (e: React.MouseEvent) => void
}

export function ColumnHeader({ column, sparkline, onProfileClick }: ColumnHeaderProps) {
  const sort = useAppStore((s) => s.sort)
  const setSort = useAppStore((s) => s.setSort)
  const isSorted = sort?.column === column.name
  const nullPct = column.totalCount > 0
    ? ((column.nullCount / column.totalCount) * 100)
    : 0
  const nullToneClass = nullPct >= 25
    ? 'text-error'
    : nullPct >= 10
      ? 'text-warning'
      : 'text-text-muted'

  return (
    <div className="w-full text-left group select-none">
      {/* Clickable sort area */}
      <button
        onClick={() => setSort(column.name)}
        className="w-full text-left cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono text-text-muted">{TYPE_PREFIX[column.type] ?? '?'}</span>
          <span className="text-[10px] font-semibold tracking-[0.08em] text-text-secondary uppercase truncate">{column.name}</span>
          {isSorted && (
            <span className="text-accent text-[10px]">
              {sort.direction === 'asc' ? '↑' : '↓'}
            </span>
          )}
          {!isSorted && (
            <span className="text-text-muted/0 group-hover:text-text-muted/50 text-[10px] transition-colors">
              ↕
            </span>
          )}
        </div>

        <div className="mt-0.5">
          <span className={`type-badge-${column.type} inline-flex items-center px-1.5 py-px rounded-sm border text-[9px] font-mono leading-none`}>
            {TYPE_BADGE_LABELS[column.type] ?? column.type}
          </span>
        </div>

        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className={`text-[9px] font-mono ${nullToneClass}`}>
            {nullPct.toFixed(1)}% null
          </span>
          {column.uniqueCount != null && (
            <span className="text-[9px] font-mono text-text-muted">
              {column.uniqueCount.toLocaleString()} uniq
            </span>
          )}
        </div>
      </button>

      {/* Row 3: Sparkline (clickable for profile) */}
      <button
        onClick={onProfileClick}
        className="w-full cursor-pointer hover:opacity-80 transition-opacity"
        title="Click to profile column"
      >
        {sparkline ? <Sparkline data={sparkline} /> : (
          <div className="h-3 mt-0.5 flex items-center">
            <span className="text-[9px] text-text-muted/0 group-hover:text-text-muted/50 transition-colors">
              profile
            </span>
          </div>
        )}
      </button>
    </div>
  )
}
