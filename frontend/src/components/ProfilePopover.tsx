import { useEffect, useRef } from 'react'
import { useAppStore } from '../store.ts'
import { useColumnProfile } from '../api.ts'
import type { ProfileResponse } from '../types.ts'

export function ProfilePopover({ anchorRect }: { anchorRect: DOMRect | null }) {
  const dataset = useAppStore((s) => s.activeDataset)
  const profileColumn = useAppStore((s) => s.profileColumn)
  const setProfileColumn = useAppStore((s) => s.setProfileColumn)
  const ref = useRef<HTMLDivElement>(null)

  const { data: profile, isLoading } = useColumnProfile(dataset?.id, profileColumn)

  // Dismiss on click outside
  useEffect(() => {
    if (!profileColumn) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setProfileColumn(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [profileColumn, setProfileColumn])

  // Dismiss on Escape
  useEffect(() => {
    if (!profileColumn) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileColumn(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [profileColumn, setProfileColumn])

  if (!profileColumn || !anchorRect) return null

  // Position: below the column header, clamped to viewport
  const left = Math.min(anchorRect.left, window.innerWidth - 340)
  const top = anchorRect.bottom + 4

  return (
    <div
      ref={ref}
      className="fixed z-50 w-80 gradient-border-subtle rounded-lg overflow-hidden"
      style={{ left, top, maxHeight: 'calc(100vh - 100px)' }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-strong bg-surface flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text">{profileColumn}</span>
          {profile && (
              <span className="text-[10px] font-mono text-text-muted px-1 py-px rounded border border-border bg-surface-elevated">
                {profile.type}
              </span>
            )}
        </div>
        <button
          onClick={() => setProfileColumn(null)}
          className="text-text-muted hover:text-text text-sm"
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div className="overflow-y-auto bg-surface-elevated" style={{ maxHeight: 'calc(100vh - 160px)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-text-muted">
            Profiling...
          </div>
        ) : profile ? (
          <ProfileContent profile={profile} />
        ) : null}
      </div>
    </div>
  )
}

function ProfileContent({ profile }: { profile: ProfileResponse }) {
  const nullPct = profile.sampleSize > 0
    ? ((profile.nullCount / profile.sampleSize) * 100).toFixed(1)
    : '0'

  return (
    <div className="p-3 space-y-3">
      {/* Base stats */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <StatBox label="Rows" value={profile.totalRows.toLocaleString()} />
        <StatBox label="Unique" value={profile.uniqueCount.toLocaleString()} />
        <StatBox label="Null %" value={`${nullPct}%`} />
      </div>

      {profile.sampled && (
        <div className="text-[10px] text-text-muted font-mono">
          Sampled {profile.sampleSize.toLocaleString()} rows
        </div>
      )}

      {/* Type-specific content */}
      {profile.type === 'integer' || profile.type === 'float' ? (
        <NumericProfile profile={profile} />
      ) : profile.type === 'string' ? (
        <StringProfile profile={profile} />
      ) : profile.type === 'date' ? (
        <DateProfile profile={profile} />
      ) : profile.type === 'boolean' && profile.topValues ? (
        <TopValuesChart values={profile.topValues} total={profile.nonNullCount} />
      ) : null}
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded px-2 py-1.5 border border-border-strong">
      <div className="text-[10px] text-text-muted">{label}</div>
      <div className="text-xs font-mono text-text">{value}</div>
    </div>
  )
}

function NumericProfile({ profile }: { profile: ProfileResponse }) {
  const s = profile.stats
  if (!s) return null

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <StatsRow label="Min" value={fmt(s.min)} />
        <StatsRow label="Max" value={fmt(s.max)} />
        <StatsRow label="Mean" value={fmt(s.mean)} />
        <StatsRow label="Median" value={fmt(s.median)} />
        <StatsRow label="Std Dev" value={fmt(s.stddev)} />
        <StatsRow label="P25" value={fmt(s.p25)} />
        <StatsRow label="P75" value={fmt(s.p75)} />
        <StatsRow label="P95" value={fmt(s.p95)} />
      </div>
      {profile.histogram && profile.histogram.length > 0 && (
        <Histogram bins={profile.histogram} />
      )}
    </>
  )
}

function StringProfile({ profile }: { profile: ProfileResponse }) {
  return (
    <>
      {profile.stats && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <StatBox label="Min Len" value={String(profile.stats.minLength ?? '-')} />
          <StatBox label="Max Len" value={String(profile.stats.maxLength ?? '-')} />
          <StatBox label="Avg Len" value={String(profile.stats.avgLength ?? '-')} />
        </div>
      )}
      {profile.topValues && profile.topValues.length > 0 && (
        <TopValuesChart values={profile.topValues} total={profile.nonNullCount} />
      )}
    </>
  )
}

function DateProfile({ profile }: { profile: ProfileResponse }) {
  return (
    <>
      {profile.stats && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <StatBox label="Min" value={String(profile.stats.min ?? '-')} />
          <StatBox label="Max" value={String(profile.stats.max ?? '-')} />
        </div>
      )}
      {profile.histogram && profile.histogram.length > 0 && (
        <div>
          <div className="text-[10px] text-text-muted mb-1">Distribution by month</div>
          <Histogram bins={profile.histogram} />
        </div>
      )}
    </>
  )
}

function StatsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-muted">{label}</span>
      <span className="font-mono text-text">{value}</span>
    </div>
  )
}

function Histogram({ bins }: { bins: { count: number; low?: number; high?: number; label?: string }[] }) {
  const maxCount = Math.max(...bins.map((b) => b.count), 1)

  return (
    <div>
      <svg viewBox={`0 0 ${bins.length * 20} 60`} className="w-full h-16 rounded border border-border/70 bg-bg-deep/60" preserveAspectRatio="none">
        {bins.map((bin, i) => {
          const height = (bin.count / maxCount) * 50
          return (
            <rect
              key={i}
              x={i * 20 + 1}
              y={50 - height}
              width={18}
              height={height}
              rx={1}
              className="fill-accent/60"
            />
          )
        })}
      </svg>
      {/* Axis labels */}
      <div className="flex justify-between text-[9px] font-mono text-text-muted mt-0.5">
        <span>{bins[0]?.label ?? fmt(bins[0]?.low)}</span>
        <span>{bins[bins.length - 1]?.label ?? fmt(bins[bins.length - 1]?.high)}</span>
      </div>
    </div>
  )
}

function TopValuesChart({ values, total }: { values: { value: string; count: number }[]; total: number }) {
  const maxCount = Math.max(...values.map((v) => v.count), 1)

  return (
    <div>
      <div className="text-[10px] text-text-muted mb-1.5">Top values</div>
      <div className="space-y-1">
        {values.map((v) => {
          const pct = total > 0 ? ((v.count / total) * 100).toFixed(1) : '0'
          const barPct = (v.count / maxCount) * 100
          return (
            <div key={v.value} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate font-mono text-text" title={v.value}>
                {v.value}
              </span>
              <div className="flex-1 h-3 bg-bg-deep/70 border border-border/70 rounded overflow-hidden">
                <div
                  className="h-full bg-accent/40 rounded"
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <span className="text-[10px] text-text-muted font-mono w-10 text-right">
                {pct}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function fmt(val: number | null | undefined): string {
  if (val == null) return '-'
  if (Number.isInteger(val)) return val.toLocaleString()
  return val.toLocaleString(undefined, { maximumFractionDigits: 4 })
}
