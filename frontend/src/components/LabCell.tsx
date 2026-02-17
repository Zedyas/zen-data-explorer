import { useMemo, type ReactNode } from 'react'
import { useAppStore } from '../store.ts'
import type { InvestigationCell, LabModule } from '../types.ts'

type CellResultData = {
  columns: string[]
  rows: Record<string, unknown>[]
}

type ColumnStat = {
  name: string
  missing: number
  nonMissing: number
  unique: number
  missingRate: number
  uniqueRate: number
}

type NumericVector = {
  name: string
  values: Array<number | null>
  nonMissing: number
  nonMissingRate: number
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

const MODULE_DESCRIPTIONS: Record<LabModule, string> = {
  missingness: 'Cross-column missingness matrix plus UpSet-style missing-set intersections.',
  validation: 'Threshold-based data quality checks over this source result.',
  keys: 'Single and composite key candidate diagnostics.',
  outliers: 'Numeric spread and outlier rates by field.',
  relationships: 'Top numeric pair correlations with overlap context.',
  univariate: 'Per-column distribution profile snapshots for fast triage.',
  sampling: 'Representativeness checks across sampled subsets.',
  parse_cast: 'String-to-type convertibility diagnostics by column.',
  sentinel: 'Hidden missing-token audit across text fields.',
  freshness: 'Date recency and runout-style completeness checks.',
}

const SENTINEL_TOKENS = [
  'n/a',
  'na',
  'unknown',
  'unk',
  'none',
  'null',
  '-',
  '--',
  'missing',
  'not available',
]

function isMissingValue(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  return false
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v || !/^-?\d+(\.\d+)?$/.test(v)) return null
  const parsed = Number(v)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const timestamp = Date.parse(trimmed)
  if (!Number.isFinite(timestamp)) return null
  const dt = new Date(timestamp)
  const y = dt.getUTCFullYear()
  if (y < 1900 || y > 2100) return null
  return dt
}

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (['1', 'true', 't', 'yes', 'y'].includes(v)) return true
  if (['0', 'false', 'f', 'no', 'n'].includes(v)) return false
  return null
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function signedPct(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${pct(Math.abs(value))}`
}

function fmt(value: number | null): string {
  if (value == null) return '-'
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function cellValueText(value: unknown): string {
  if (value == null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function heatBg(alpha: number): string {
  const bounded = Math.max(0, Math.min(alpha, 1))
  return `rgba(248, 113, 113, ${0.08 + bounded * 0.45})`
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthsBetween(start: Date, end: Date): number {
  const years = end.getUTCFullYear() - start.getUTCFullYear()
  const months = end.getUTCMonth() - start.getUTCMonth()
  return years * 12 + months
}

function prevMonthKey(current: string): string {
  const [yRaw, mRaw] = current.split('-')
  const y = Number(yRaw)
  const m = Number(mRaw)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return current
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  const frac = pos - lo
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac
}

function pearsonCorrelation(a: Array<number | null>, b: Array<number | null>): { n: number; r: number | null } {
  let n = 0
  let sumX = 0
  let sumY = 0
  let sumXX = 0
  let sumYY = 0
  let sumXY = 0

  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]
    const y = b[i]
    if (x == null || y == null) continue
    n += 1
    sumX += x
    sumY += y
    sumXX += x * x
    sumYY += y * y
    sumXY += x * y
  }

  if (n < 5) return { n, r: null }
  const cov = sumXY - (sumX * sumY) / n
  const varX = sumXX - (sumX * sumX) / n
  const varY = sumYY - (sumY * sumY) / n
  if (varX <= 0 || varY <= 0) return { n, r: null }
  return { n, r: cov / Math.sqrt(varX * varY) }
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
    outlierMetric: '',
    outlierPercentile: 0.99,
  }

  const activeModule = lab.activeModule ?? lab.modules?.[0] ?? 'missingness'

  const sourceCell = tableCells.find((c) => c.id === lab.sourceCellId) ?? tableCells.at(-1) ?? null
  const sourceResult = sourceCell?.result as CellResultData | null
  const rows = sourceResult?.rows ?? []
  const columns = sourceResult?.columns ?? []
  const rowLimit = 6

  const columnStats = useMemo<ColumnStat[]>(() => {
    if (!columns.length) return []
    return columns.map((name) => {
      let missing = 0
      const seen = new Set<string>()
      for (const row of rows) {
        const value = row[name]
        if (isMissingValue(value)) missing += 1
        else seen.add(JSON.stringify(value))
      }
      const total = rows.length
      const nonMissing = total - missing
      const missingRate = total > 0 ? missing / total : 0
      const uniqueRate = nonMissing > 0 ? seen.size / nonMissing : 0
      return { name, missing, nonMissing, unique: seen.size, missingRate, uniqueRate }
    })
  }, [columns, rows])

  const missingColumns = useMemo(() => {
    const ordered = [...columnStats].sort((a, b) => b.missingRate - a.missingRate)
    return ordered.slice(0, Math.max(2, Math.min(20, lab.maxColumns)))
  }, [columnStats, lab.maxColumns])

  const matrix = useMemo(() => {
    const cols = missingColumns.map((c) => c.name)
    if (!cols.length || rows.length === 0) return []
    const counts = Array.from({ length: cols.length }, () => Array(cols.length).fill(0))

    for (const row of rows) {
      const missingFlags = cols.map((name) => isMissingValue(row[name]))
      for (let i = 0; i < cols.length; i += 1) {
        if (!missingFlags[i]) continue
        for (let j = 0; j < cols.length; j += 1) {
          if (missingFlags[j]) counts[i][j] += 1
        }
      }
    }

    return counts.map((line) => line.map((count) => ({
      count,
      rate: rows.length > 0 ? count / rows.length : 0,
    })))
  }, [missingColumns, rows])

  const missingnessPatterns = useMemo(() => {
    const cols = missingColumns.map((c) => c.name)
    if (!cols.length || rows.length === 0) return []

    const counts = new Map<string, { cols: string[]; count: number }>()
    for (const row of rows) {
      const missingSet = cols.filter((name) => isMissingValue(row[name]))
      if (missingSet.length === 0) continue
      const key = missingSet.join('||')
      const current = counts.get(key)
      if (current) {
        current.count += 1
      } else {
        counts.set(key, { cols: missingSet, count: 1 })
      }
    }

    return [...counts.values()]
      .map((entry) => ({
        columns: entry.cols,
        setSize: entry.cols.length,
        count: entry.count,
        rate: entry.count / rows.length,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        if (b.setSize !== a.setSize) return b.setSize - a.setSize
        return a.columns.join(',').localeCompare(b.columns.join(','))
      })
  }, [missingColumns, rows])

  const nullThreshold = Math.max(0, Math.min(100, lab.nullThresholdPct)) / 100
  const uniqueThreshold = Math.max(0, Math.min(100, lab.uniqueFloorPct)) / 100

  const nullCheckHits = useMemo(
    () => columnStats.filter((c) => c.missingRate >= nullThreshold).sort((a, b) => b.missingRate - a.missingRate),
    [columnStats, nullThreshold],
  )

  const constantLikeHits = useMemo(
    () => columnStats.filter((c) => c.nonMissing > 0 && c.uniqueRate <= 0.01).sort((a, b) => a.uniqueRate - b.uniqueRate),
    [columnStats],
  )

  const singleKeyCandidates = useMemo(
    () => columnStats
      .filter((c) => c.missing === 0 && c.uniqueRate >= uniqueThreshold)
      .sort((a, b) => b.uniqueRate - a.uniqueRate),
    [columnStats, uniqueThreshold],
  )

  const compositeKeyPairs = useMemo(() => {
    const base = [...columnStats]
      .filter((c) => c.nonMissing > 0 && c.uniqueRate >= Math.min(uniqueThreshold, 0.6))
      .sort((a, b) => b.uniqueRate - a.uniqueRate)
      .slice(0, 10)

    const pairs: Array<{ left: string; right: string; uniqueRate: number; missingRate: number }> = []

    for (let i = 0; i < base.length; i += 1) {
      for (let j = i + 1; j < base.length; j += 1) {
        const left = base[i].name
        const right = base[j].name
        let missing = 0
        const seen = new Set<string>()
        for (const row of rows) {
          const a = row[left]
          const b = row[right]
          if (isMissingValue(a) || isMissingValue(b)) {
            missing += 1
            continue
          }
          seen.add(`${JSON.stringify(a)}|${JSON.stringify(b)}`)
        }
        const nonMissing = rows.length - missing
        if (nonMissing <= 0) continue
        const uniqueRate = seen.size / nonMissing
        pairs.push({
          left,
          right,
          uniqueRate,
          missingRate: rows.length > 0 ? missing / rows.length : 0,
        })
      }
    }

    return pairs
      .filter((p) => p.missingRate === 0 && p.uniqueRate >= uniqueThreshold)
      .sort((a, b) => b.uniqueRate - a.uniqueRate)
  }, [columnStats, rows, uniqueThreshold])

  const numericVectors = useMemo<NumericVector[]>(() => {
    if (!columns.length || !rows.length) return []
    const minCoverage = 0.3

    return columns.map((name) => {
      let parseable = 0
      const values = rows.map((row) => {
        const parsed = parseNumericValue(row[name])
        if (parsed != null) parseable += 1
        return parsed
      })
      const nonMissingRate = rows.length > 0 ? parseable / rows.length : 0
      return { name, values, nonMissing: parseable, nonMissingRate }
    }).filter((v) => v.nonMissing >= 10 && v.nonMissingRate >= minCoverage)
  }, [columns, rows])

  const outlierPercentile = useMemo(() => {
    const raw = lab.outlierPercentile ?? 0.99
    if (!Number.isFinite(raw)) return 0.99
    return Math.max(0.8, Math.min(0.999, raw))
  }, [lab.outlierPercentile])

  const selectedOutlierMetric = useMemo(() => {
    if (numericVectors.length === 0) return null
    const chosen = lab.outlierMetric ?? ''
    return numericVectors.some((v) => v.name === chosen)
      ? chosen
      : numericVectors[0].name
  }, [lab.outlierMetric, numericVectors])

  const outlierProfiles = useMemo(() => {
    return numericVectors.map((vector) => {
      const nums = vector.values.filter((v): v is number => v != null)
      const sorted = [...nums].sort((a, b) => a - b)
      const p25 = quantile(sorted, 0.25)
      const p75 = quantile(sorted, 0.75)
      const p95 = quantile(sorted, 0.95)
      const p99 = quantile(sorted, 0.99)
      const median = quantile(sorted, 0.5)
      const min = sorted[0] ?? null
      const max = sorted[sorted.length - 1] ?? null

      if (p25 == null || p75 == null || median == null) {
        return {
          name: vector.name,
          outlierRate: 0,
          zeroRate: 0,
          negRate: 0,
          p25,
          p75,
          p95,
          p99,
          median,
          min,
          max,
        }
      }

      const iqr = p75 - p25
      const low = p25 - 1.5 * iqr
      const high = p75 + 1.5 * iqr
      const outlierCount = nums.filter((n) => n < low || n > high).length
      const zeroCount = nums.filter((n) => n === 0).length
      const negCount = nums.filter((n) => n < 0).length
      const denom = Math.max(1, nums.length)

      return {
        name: vector.name,
        outlierRate: outlierCount / denom,
        zeroRate: zeroCount / denom,
        negRate: negCount / denom,
        p25,
        p75,
        p95,
        p99,
        median,
        min,
        max,
      }
    }).sort((a, b) => b.outlierRate - a.outlierRate)
  }, [numericVectors])

  const outlierRows = useMemo(() => {
    if (!selectedOutlierMetric) {
      return {
        threshold: null as number | null,
        rows: [] as Array<{ rowNumber: number; metricValue: number; row: Record<string, unknown> }>,
      }
    }

    const metricValues = rows
      .map((row, index) => ({ row, rowNumber: index + 1, metricValue: parseNumericValue(row[selectedOutlierMetric]) }))
      .filter((entry): entry is { rowNumber: number; metricValue: number; row: Record<string, unknown> } => entry.metricValue != null)

    const sorted = metricValues.map((entry) => entry.metricValue).sort((a, b) => a - b)
    const threshold = quantile(sorted, outlierPercentile)
    if (threshold == null) {
      return {
        threshold: null,
        rows: [] as Array<{ rowNumber: number; metricValue: number; row: Record<string, unknown> }>,
      }
    }

    const hits = metricValues
      .filter((entry) => entry.metricValue >= threshold)
      .sort((a, b) => b.metricValue - a.metricValue)

    return {
      threshold,
      rows: hits,
    }
  }, [outlierPercentile, rows, selectedOutlierMetric])

  const relationshipVectors = useMemo(() => {
    return [...numericVectors]
      .sort((a, b) => b.nonMissingRate - a.nonMissingRate)
      .slice(0, Math.min(8, lab.maxColumns))
  }, [numericVectors, lab.maxColumns])

  const correlationMatrix = useMemo(() => {
    const matrix: Array<Array<{ corr: number | null; overlap: number }>> = relationshipVectors.map(() =>
      relationshipVectors.map(() => ({ corr: null, overlap: 0 })),
    )

    for (let i = 0; i < relationshipVectors.length; i += 1) {
      matrix[i][i] = { corr: 1, overlap: relationshipVectors[i].nonMissing }
      for (let j = i + 1; j < relationshipVectors.length; j += 1) {
        const corr = pearsonCorrelation(relationshipVectors[i].values, relationshipVectors[j].values)
        matrix[i][j] = { corr: corr.r, overlap: corr.n }
        matrix[j][i] = { corr: corr.r, overlap: corr.n }
      }
    }

    return matrix
  }, [relationshipVectors])

  const relationshipPairs = useMemo(() => {
    const pairs: Array<{ left: string; right: string; corr: number; overlap: number }> = []

    for (let i = 0; i < relationshipVectors.length; i += 1) {
      for (let j = i + 1; j < relationshipVectors.length; j += 1) {
        const cell = correlationMatrix[i]?.[j]
        if (!cell || cell.corr == null) continue
        pairs.push({
          left: relationshipVectors[i].name,
          right: relationshipVectors[j].name,
          corr: cell.corr,
          overlap: cell.overlap,
        })
      }
    }

    return pairs.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr))
  }, [correlationMatrix, relationshipVectors])

  const univariateRows = useMemo(() => {
    return columnStats.map((stat) => {
      const values = rows.map((r) => r[stat.name]).filter((v) => !isMissingValue(v))
      const total = values.length

      const numericVals = values.map(parseNumericValue).filter((v): v is number => v != null)
      const dateVals = values.map(parseDateValue).filter((v): v is Date => v != null)
      const boolVals = values.map(parseBooleanLike).filter((v): v is boolean => v != null)

      const numericRate = total > 0 ? numericVals.length / total : 0
      const dateRate = total > 0 ? dateVals.length / total : 0
      const boolRate = total > 0 ? boolVals.length / total : 0

      let kind = 'string'
      if (boolRate >= 0.8) kind = 'boolean'
      else if (numericRate >= 0.8) kind = 'numeric'
      else if (dateRate >= 0.8) kind = 'date'

      let signal = 'n/a'
      if (kind === 'numeric' && numericVals.length) {
        const sorted = [...numericVals].sort((a, b) => a - b)
        signal = `med ${fmt(quantile(sorted, 0.5))} · p95 ${fmt(quantile(sorted, 0.95))}`
      } else if (kind === 'date' && dateVals.length) {
        const sorted = [...dateVals].sort((a, b) => a.getTime() - b.getTime())
        signal = `${monthKey(sorted[0])} .. ${monthKey(sorted[sorted.length - 1])}`
      } else if (kind === 'boolean' && boolVals.length) {
        const trueCount = boolVals.filter((v) => v).length
        signal = `true ${pct(trueCount / boolVals.length)}`
      } else if (values.length) {
        const freq = new Map<string, number>()
        for (const v of values) {
          const key = String(v)
          freq.set(key, (freq.get(key) ?? 0) + 1)
        }
        const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]
        if (top) signal = `${top[0].slice(0, 16)}${top[0].length > 16 ? '...' : ''} (${pct(top[1] / values.length)})`
      }

      return {
        name: stat.name,
        kind,
        nonMissing: stat.nonMissing,
        unique: stat.unique,
        missingRate: stat.missingRate,
        uniqueRate: stat.uniqueRate,
        signal,
      }
    }).sort((a, b) => {
      if (b.missingRate !== a.missingRate) return b.missingRate - a.missingRate
      return a.name.localeCompare(b.name)
    })
  }, [columnStats, rows])

  const samplingDiagnostics = useMemo(() => {
    if (rows.length === 0 || columns.length === 0) return []
    const fullAvgNullRate = columnStats.reduce((acc, c) => acc + c.missingRate, 0) / columnStats.length

    const fullNumericMeans = new Map<string, number>()
    for (const v of numericVectors) {
      const nums = v.values.filter((n): n is number => n != null)
      if (!nums.length) continue
      fullNumericMeans.set(v.name, nums.reduce((a, n) => a + n, 0) / nums.length)
    }

    return [0.1, 0.25, 0.5].map((ratio) => {
      const stride = Math.max(1, Math.round(1 / ratio))
      const sampleRows = rows.filter((_, idx) => idx % stride === 0)
      const sampleCount = sampleRows.length

      let nullRateAccum = 0
      let retentionAccum = 0

      for (const col of columns) {
        let sampleMissing = 0
        const sampleSeen = new Set<string>()
        for (const row of sampleRows) {
          const value = row[col]
          if (isMissingValue(value)) sampleMissing += 1
          else sampleSeen.add(JSON.stringify(value))
        }
        const sampleNullRate = sampleCount > 0 ? sampleMissing / sampleCount : 0
        nullRateAccum += sampleNullRate

        const fullUnique = columnStats.find((c) => c.name === col)?.unique ?? 0
        retentionAccum += fullUnique > 0 ? sampleSeen.size / fullUnique : 1
      }

      let meanDrift = 0
      if (fullNumericMeans.size > 0) {
        let driftAccum = 0
        let driftN = 0
        for (const [name, fullMean] of fullNumericMeans.entries()) {
          const values = sampleRows.map((r) => parseNumericValue(r[name])).filter((n): n is number => n != null)
          if (!values.length) continue
          const sampleMean = values.reduce((a, n) => a + n, 0) / values.length
          const denom = Math.max(Math.abs(fullMean), 1e-9)
          driftAccum += Math.abs(sampleMean - fullMean) / denom
          driftN += 1
        }
        meanDrift = driftN > 0 ? driftAccum / driftN : 0
      }

      return {
        sample: `${Math.round(ratio * 100)}%`,
        rows: sampleCount,
        avgNullRate: columns.length > 0 ? nullRateAccum / columns.length : 0,
        avgNullDelta: columns.length > 0 ? (nullRateAccum / columns.length) - fullAvgNullRate : 0,
        retention: columns.length > 0 ? retentionAccum / columns.length : 0,
        meanDrift,
      }
    })
  }, [rows, columns, columnStats, numericVectors])

  const parseCastRows = useMemo(() => {
    return columns.map((name) => {
      const values = rows.map((r) => r[name]).filter((v) => !isMissingValue(v))
      const denom = Math.max(1, values.length)
      const numericRate = values.filter((v) => parseNumericValue(v) != null).length / denom
      const dateRate = values.filter((v) => parseDateValue(v) != null).length / denom
      const boolRate = values.filter((v) => parseBooleanLike(v) != null).length / denom

      const best = [
        { label: 'numeric', score: numericRate },
        { label: 'date', score: dateRate },
        { label: 'boolean', score: boolRate },
      ].sort((a, b) => b.score - a.score)[0]

      return {
        name,
        numericRate,
        dateRate,
        boolRate,
        best: best.score >= 0.8 ? best.label : 'none',
      }
    }).sort((a, b) => Math.max(b.numericRate, b.dateRate, b.boolRate) - Math.max(a.numericRate, a.dateRate, a.boolRate))
  }, [columns, rows])

  const sentinelRows = useMemo(() => {
    const rowsOut: Array<{ name: string; hits: number; topTokens: string }> = []

    for (const name of columns) {
      const tokenMap = new Map<string, number>()
      let hits = 0
      for (const row of rows) {
        const raw = row[name]
        if (raw == null) continue
        const normalized = String(raw).trim().toLowerCase()
        if (!normalized) continue
        if (!SENTINEL_TOKENS.includes(normalized)) continue
        hits += 1
        tokenMap.set(normalized, (tokenMap.get(normalized) ?? 0) + 1)
      }
      if (!hits) continue
      const topTokens = [...tokenMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([token, count]) => `${token} (${count})`)
        .join(', ')
      rowsOut.push({ name, hits, topTokens })
    }

    return rowsOut.sort((a, b) => b.hits - a.hits)
  }, [columns, rows])

  const freshnessRows = useMemo(() => {
    const today = new Date()
    const results: Array<{
      name: string
      recencyDays: number
      spanMonths: number
      missingMonths: number
      latestPrevRatio: number | null
    }> = []

    for (const name of columns) {
      const parsed = rows
        .map((r) => parseDateValue(r[name]))
        .filter((d): d is Date => d != null)

      const nonMissing = rows.filter((r) => !isMissingValue(r[name])).length
      if (parsed.length < 10 || nonMissing === 0 || parsed.length / nonMissing < 0.6) continue

      const sorted = [...parsed].sort((a, b) => a.getTime() - b.getTime())
      const minDate = sorted[0]
      const maxDate = sorted[sorted.length - 1]
      const recencyDays = Math.max(0, Math.floor((today.getTime() - maxDate.getTime()) / (1000 * 60 * 60 * 24)))
      const spanMonths = monthsBetween(minDate, maxDate) + 1

      const monthCounts = new Map<string, number>()
      for (const d of sorted) {
        const key = monthKey(d)
        monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1)
      }
      const uniqueMonths = monthCounts.size
      const missingMonths = Math.max(0, spanMonths - uniqueMonths)

      const latestKey = monthKey(maxDate)
      const prevKey = prevMonthKey(latestKey)
      const latest = monthCounts.get(latestKey) ?? 0
      const prev = monthCounts.get(prevKey) ?? 0
      const latestPrevRatio = prev > 0 ? latest / prev : null

      results.push({ name, recencyDays, spanMonths, missingMonths, latestPrevRatio })
    }

    return results.sort((a, b) => a.recencyDays - b.recencyDays)
  }, [columns, rows])

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
          <span className="text-[10px] text-text-muted font-mono">advanced insights</span>
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

        <div className="space-y-1">
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
          <div className="text-[9px] text-text-muted">{MODULE_DESCRIPTIONS[activeModule]}</div>
        </div>
      </div>

      {!sourceCell && (
        <div className="px-3 py-2 text-xs text-text-muted bg-bg-deep/60">Create and run a Table cell first, then select it as Lab source.</div>
      )}

      {sourceCell && !sourceResult && (
        <div className="px-3 py-2 text-xs text-text-muted bg-bg-deep/60">Run `{sourceCell.title}` to produce rows for this Lab cell.</div>
      )}

      {sourceResult && (
        <div className="p-2 bg-bg-deep/55 h-[400px] md:h-[420px] overflow-y-auto">
          {activeModule === 'missingness' && (
            <ModulePanel
              title="Missingness Matrix"
              right={(
                <label className="text-[10px] text-text-muted font-mono">
                  cols
                  <input
                    type="number"
                    min={2}
                    max={20}
                    value={lab.maxColumns}
                    onChange={(e) => patchLab({ maxColumns: Number(e.target.value) || 8 })}
                    className="ml-1 w-12 bg-surface border border-border rounded px-1 py-0.5 text-[10px]"
                  />
                </label>
              )}
            >
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-[10px]">
                {missingColumns.slice(0, 6).map((c) => (
                  <MetricCard key={c.name} label={c.name} value={`${c.missing.toLocaleString()} missing (${pct(c.missingRate)})`} />
                ))}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-[10px]">
                <MetricCard label="Rows with any missing" value={String(missingnessPatterns.reduce((acc, p) => acc + p.count, 0))} />
                <MetricCard label="Unique missing sets" value={String(missingnessPatterns.length)} />
                <MetricCard label="Top set share" value={missingnessPatterns[0] ? pct(missingnessPatterns[0].rate) : '-'} />
              </div>

              <div className="overflow-auto rounded border border-border/60 bg-surface/70 p-2">
                <div
                  className="inline-grid gap-1 text-[10px]"
                  style={{ gridTemplateColumns: `minmax(120px, 160px) repeat(${missingColumns.length}, minmax(56px, 1fr))` }}
                >
                  <div className="px-1 py-0.5 text-text-muted font-mono">col</div>
                  {missingColumns.map((c) => (
                    <div key={`head-${c.name}`} className="px-1 py-0.5 text-text-muted font-mono truncate" title={c.name}>{c.name}</div>
                  ))}

                  {missingColumns.map((rowCol, i) => (
                    <div key={rowCol.name} className="contents">
                      <div className="px-1 py-0.5 text-text-secondary font-mono truncate" title={rowCol.name}>{rowCol.name}</div>
                      {matrix[i]?.map((cellValue, j) => (
                        <div
                          key={`${rowCol.name}-${missingColumns[j]?.name}`}
                          className="px-1 py-0.5 rounded text-text-secondary font-mono"
                          style={{ background: heatBg(cellValue.rate) }}
                        >
                          {pct(cellValue.rate)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <GridRows
                columns={["Missing set", "Cols", "Rows", "Share"]}
                rows={missingnessPatterns.slice(0, 12).map((pattern) => [
                  pattern.columns.join(' + '),
                  String(pattern.setSize),
                  pattern.count.toLocaleString(),
                  pct(pattern.rate),
                ])}
                emptyText="No co-missing sets found"
              />
            </ModulePanel>
          )}

          {activeModule === 'validation' && (
            <ModulePanel
              title="Validation Checks"
              right={(
                <label className="text-[10px] text-text-muted font-mono">
                  null% {'>='}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={lab.nullThresholdPct}
                    onChange={(e) => patchLab({ nullThresholdPct: Number(e.target.value) || 0 })}
                    className="ml-1 w-12 bg-surface border border-border rounded px-1 py-0.5"
                  />
                </label>
              )}
            >
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-[10px]">
                <MetricCard label="Columns scanned" value={String(columnStats.length)} />
                <MetricCard label="Null-threshold hits" value={String(nullCheckHits.length)} />
                <MetricCard label="Constant-like cols" value={String(constantLikeHits.length)} />
              </div>

              <GridRows
                columns={["Column", "Missing", "Missing %"]}
                rows={nullCheckHits.slice(0, rowLimit).map((c) => [c.name, c.missing.toLocaleString(), pct(c.missingRate)])}
                emptyText="No columns above threshold"
              />

              <GridRows
                columns={["Column", "Unique", "Unique/Non-missing"]}
                rows={constantLikeHits.slice(0, rowLimit).map((c) => [c.name, c.unique.toLocaleString(), pct(c.uniqueRate)])}
                emptyText="No constant-like columns"
              />
            </ModulePanel>
          )}

          {activeModule === 'keys' && (
            <ModulePanel
              title="Key Diagnostics"
              right={(
                <label className="text-[10px] text-text-muted font-mono">
                  unique% {'>='}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={lab.uniqueFloorPct}
                    onChange={(e) => patchLab({ uniqueFloorPct: Number(e.target.value) || 0 })}
                    className="ml-1 w-12 bg-surface border border-border rounded px-1 py-0.5"
                  />
                </label>
              )}
            >
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-[10px]">
                <MetricCard label="Single candidates" value={String(singleKeyCandidates.length)} />
                <MetricCard label="Composite candidates" value={String(compositeKeyPairs.length)} />
                <MetricCard label="Rule" value={`>= ${lab.uniqueFloorPct}% unique`} />
              </div>

              <GridRows
                columns={["Column", "Unique %", "Nulls"]}
                rows={singleKeyCandidates.slice(0, rowLimit).map((c) => [c.name, pct(c.uniqueRate), c.missing.toLocaleString()])}
                emptyText="No single-column key candidates"
              />

              <GridRows
                columns={["Pair", "Unique %", "Missing %"]}
                rows={compositeKeyPairs.slice(0, rowLimit).map((p) => [`${p.left} + ${p.right}`, pct(p.uniqueRate), pct(p.missingRate)])}
                emptyText="No composite key candidates"
              />
            </ModulePanel>
          )}

          {activeModule === 'outliers' && (
            <ModulePanel
              title="Outlier Analysis"
              right={(
                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedOutlierMetric ?? ''}
                    onChange={(e) => patchLab({ outlierMetric: e.target.value })}
                    className="bg-surface border border-border rounded px-1.5 py-0.5 text-[10px] text-text-secondary"
                  >
                    {numericVectors.map((v) => (
                      <option key={v.name} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                  <select
                    value={outlierPercentile}
                    onChange={(e) => patchLab({ outlierPercentile: Number(e.target.value) || 0.99 })}
                    className="bg-surface border border-border rounded px-1.5 py-0.5 text-[10px] text-text-secondary"
                  >
                    <option value={0.9}>P90</option>
                    <option value={0.95}>P95</option>
                    <option value={0.99}>P99</option>
                  </select>
                </div>
              )}
            >
              {numericVectors.length === 0 ? (
                <div className="text-[10px] text-text-muted">No numeric columns with enough coverage in this source result.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-[10px]">
                    <MetricCard label="Numeric columns" value={String(numericVectors.length)} />
                    <MetricCard label=">5% outliers" value={String(outlierProfiles.filter((r) => r.outlierRate >= 0.05).length)} />
                    <MetricCard label="Max outlier rate" value={outlierProfiles.length ? pct(outlierProfiles[0].outlierRate) : '-'} />
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-[10px]">
                    <MetricCard
                      label={`Threshold (${Math.round(outlierPercentile * 100)})`}
                      value={outlierRows.threshold == null ? '-' : fmt(outlierRows.threshold)}
                    />
                    <MetricCard label="Outlier rows" value={outlierRows.rows.length.toLocaleString()} />
                    <MetricCard
                      label="Outlier share"
                      value={rows.length > 0 ? pct(outlierRows.rows.length / rows.length) : '-'}
                    />
                  </div>

                  {outlierProfiles.length === 0 ? (
                    <div className="text-[10px] text-text-muted">No outlier diagnostics</div>
                  ) : (
                    <div className="overflow-auto rounded border border-border/60 bg-surface/70">
                      <table className="w-full border-collapse text-[10px]">
                        <thead>
                          <tr className="bg-bg-deep/55 border-b border-border/60">
                            <th className="px-1.5 py-1 text-left font-mono text-text-muted">Column</th>
                            <th className="px-1.5 py-1 text-left font-mono text-text-muted">Outlier %</th>
                            <th className="px-1.5 py-1 text-left font-mono text-text-muted">Zero %</th>
                            <th className="px-1.5 py-1 text-left font-mono text-text-muted">Neg %</th>
                            <th className="px-1.5 py-1 text-left font-mono text-text-muted">P25</th>
                            <th className="px-1.5 py-1 text-left font-mono text-text-muted">P75</th>
                            <th className="px-1.5 py-1 text-left font-mono text-text-muted">P95</th>
                            <th className="px-1.5 py-1 text-left font-mono text-text-muted">P99</th>
                          </tr>
                        </thead>
                        <tbody>
                          {outlierProfiles.map((r) => (
                            <tr key={r.name} className="border-t border-border/40 hover:bg-bg-deep/45">
                              <td className="px-1.5 py-1 font-mono text-text-secondary truncate max-w-40" title={r.name}>{r.name}</td>
                              <td className="px-1.5 py-1 font-mono text-text-secondary">{pct(r.outlierRate)}</td>
                              <td className="px-1.5 py-1 font-mono text-text-muted">{pct(r.zeroRate)}</td>
                              <td className="px-1.5 py-1 font-mono text-text-muted">{pct(r.negRate)}</td>
                              <td className="px-1.5 py-1 font-mono text-text-muted">{fmt(r.p25)}</td>
                              <td className="px-1.5 py-1 font-mono text-text-muted">{fmt(r.p75)}</td>
                              <td className="px-1.5 py-1 font-mono text-text-muted">{fmt(r.p95)}</td>
                              <td className="px-1.5 py-1 font-mono text-text-muted">{fmt(r.p99)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="rounded border border-border/60 bg-surface/70 overflow-auto">
                    <div className="px-2 py-1 text-[10px] text-text-muted border-b border-border/50">
                      Rows where <span className="font-mono text-text-secondary">{selectedOutlierMetric}</span> is &gt;=
                      {' '}P{Math.round(outlierPercentile * 100)} threshold
                    </div>
                    {outlierRows.rows.length === 0 ? (
                      <div className="text-[10px] text-text-muted px-2 py-2">No rows match the selected outlier threshold.</div>
                    ) : (
                      <table className="w-full border-collapse text-[10px]">
                        <thead>
                          <tr className="bg-bg-deep/55 border-b border-border/60">
                            <th className="px-1.5 py-1 text-left font-mono text-text-muted">Row #</th>
                            <th className="px-1.5 py-1 text-left font-mono text-text-muted">Metric value</th>
                            {columns.map((column) => (
                              <th key={column} className="px-1.5 py-1 text-left font-mono text-text-muted">{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {outlierRows.rows.map((entry) => (
                            <tr key={`${entry.rowNumber}-${entry.metricValue}`} className="border-t border-border/40 hover:bg-bg-deep/45">
                              <td className="px-1.5 py-1 font-mono text-text-muted">{entry.rowNumber.toLocaleString()}</td>
                              <td className="px-1.5 py-1 font-mono text-text-secondary">{fmt(entry.metricValue)}</td>
                              {columns.map((column) => (
                                <td key={`${entry.rowNumber}-${column}`} className="px-1.5 py-1 font-mono text-text-secondary whitespace-nowrap">
                                  {cellValueText(entry.row[column])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </ModulePanel>
          )}

          {activeModule === 'relationships' && (
            <ModulePanel title="Relationships">
              {relationshipVectors.length < 2 ? (
                <div className="text-[10px] text-text-muted">Need at least two numeric columns for correlation analysis.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-[10px]">
                    <MetricCard label="Numeric columns" value={String(relationshipVectors.length)} />
                    <MetricCard label="Pair comparisons" value={String(relationshipPairs.length)} />
                    <MetricCard label="Strongest |corr|" value={relationshipPairs.length ? relationshipPairs[0].corr.toFixed(3) : '-'} />
                  </div>

                  <div className="overflow-auto rounded border border-border/60 bg-surface/70 p-2">
                    <div
                      className="inline-grid gap-1 text-[10px]"
                      style={{ gridTemplateColumns: `minmax(130px, 160px) repeat(${relationshipVectors.length}, minmax(72px, 1fr))` }}
                    >
                      <div className="px-1 py-0.5 text-text-muted font-mono">metric</div>
                      {relationshipVectors.map((vector) => (
                        <div key={`corr-head-${vector.name}`} className="px-1 py-0.5 text-text-muted font-mono truncate" title={vector.name}>{vector.name}</div>
                      ))}

                      {relationshipVectors.map((rowVector, rowIdx) => (
                        <div key={`corr-row-${rowVector.name}`} className="contents">
                          <div className="px-1 py-0.5 text-text-secondary font-mono truncate" title={rowVector.name}>{rowVector.name}</div>
                          {relationshipVectors.map((colVector, colIdx) => {
                            const cell = correlationMatrix[rowIdx]?.[colIdx]
                            if (!cell || (rowIdx !== colIdx && cell.corr == null)) {
                              return <div key={`corr-${rowVector.name}-${colVector.name}`} className="px-1 py-0.5 text-text-muted font-mono">-</div>
                            }

                            if (colIdx < rowIdx) {
                              return <div key={`corr-${rowVector.name}-${colVector.name}`} className="px-1 py-0.5 text-text-muted font-mono">·</div>
                            }

                            const corrValue = cell.corr ?? 0
                            return (
                              <div
                                key={`corr-${rowVector.name}-${colVector.name}`}
                                className="px-1 py-0.5 rounded text-text-secondary font-mono"
                                style={rowIdx === colIdx ? undefined : { background: heatBg(Math.abs(corrValue)) }}
                                title={rowIdx === colIdx ? 'self-correlation' : `${cell.overlap.toLocaleString()} overlapping rows`}
                              >
                                {corrValue.toFixed(3)}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  <GridRows
                    columns={["Pair", "Correlation", "Overlap"]}
                    rows={relationshipPairs.slice(0, rowLimit).map((p) => [
                      `${p.left} ↔ ${p.right}`,
                      p.corr.toFixed(3),
                      p.overlap.toLocaleString(),
                    ])}
                    emptyText="No correlation pairs with enough overlap"
                  />
                </>
              )}
            </ModulePanel>
          )}

          {activeModule === 'univariate' && (
            <ModulePanel title="Univariate Explorer">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-[10px]">
                <MetricCard label="Columns profiled" value={String(univariateRows.length)} />
                <MetricCard label="High-missing cols" value={String(univariateRows.filter((r) => r.missingRate >= 0.25).length)} />
                <MetricCard label="High-cardinality cols" value={String(univariateRows.filter((r) => r.uniqueRate >= 0.8).length)} />
              </div>

              {univariateRows.length === 0 ? (
                <div className="text-[10px] text-text-muted">No univariate profile rows</div>
              ) : (
                <div className="overflow-auto rounded border border-border/60 bg-surface/70">
                  <table className="w-full border-collapse text-[10px]">
                    <thead>
                      <tr className="bg-bg-deep/55 border-b border-border/60">
                        <th className="px-1.5 py-1 text-left font-mono text-text-muted">Column</th>
                        <th className="px-1.5 py-1 text-left font-mono text-text-muted">Kind</th>
                        <th className="px-1.5 py-1 text-left font-mono text-text-muted">Non-missing</th>
                        <th className="px-1.5 py-1 text-left font-mono text-text-muted">Distinct</th>
                        <th className="px-1.5 py-1 text-left font-mono text-text-muted">Missing %</th>
                        <th className="px-1.5 py-1 text-left font-mono text-text-muted">Distinct %</th>
                        <th className="px-1.5 py-1 text-left font-mono text-text-muted">Signal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {univariateRows.map((row) => (
                        <tr key={`univariate-${row.name}`} className="border-t border-border/40 hover:bg-bg-deep/45">
                          <td className="px-1.5 py-1 font-mono text-text-secondary">{row.name}</td>
                          <td className="px-1.5 py-1 font-mono text-text-secondary">{row.kind}</td>
                          <td className="px-1.5 py-1 font-mono text-text-secondary">{row.nonMissing.toLocaleString()}</td>
                          <td className="px-1.5 py-1 font-mono text-text-secondary">{row.unique.toLocaleString()}</td>
                          <td className="px-1.5 py-1 font-mono text-text-muted">{pct(row.missingRate)}</td>
                          <td className="px-1.5 py-1 font-mono text-text-muted">{pct(row.uniqueRate)}</td>
                          <td className="px-1.5 py-1 font-mono text-text-secondary">{row.signal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ModulePanel>
          )}

          {activeModule === 'sampling' && (
            <ModulePanel title="Sampling Diagnostics">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-[10px]">
                <MetricCard label="Scenarios" value={String(samplingDiagnostics.length)} />
                <MetricCard label="Rows in context" value={rows.length.toLocaleString()} />
                <MetricCard
                  label="Max mean drift"
                  value={samplingDiagnostics.length ? pct(Math.max(...samplingDiagnostics.map((s) => s.meanDrift))) : '-'}
                />
              </div>

              <GridRows
                columns={["Sample", "Rows", "Avg null %", "Null delta", "Distinct retention", "Mean drift"]}
                rows={samplingDiagnostics.map((s) => [
                  s.sample,
                  s.rows.toLocaleString(),
                  pct(s.avgNullRate),
                  signedPct(s.avgNullDelta),
                  pct(Math.min(1, s.retention)),
                  pct(s.meanDrift),
                ])}
                emptyText="No sampling diagnostics"
              />
            </ModulePanel>
          )}

          {activeModule === 'parse_cast' && (
            <ModulePanel title="Parse/Cast Readiness">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-[10px]">
                <MetricCard label="Columns scanned" value={String(parseCastRows.length)} />
                <MetricCard label=">=80% parse-ready" value={String(parseCastRows.filter((r) => r.best !== 'none').length)} />
                <MetricCard
                  label="Numeric-ready cols"
                  value={String(parseCastRows.filter((r) => r.numericRate >= 0.8).length)}
                />
              </div>

              <GridRows
                columns={["Column", "Numeric", "Date", "Boolean", "Best"]}
                rows={parseCastRows.slice(0, rowLimit).map((r) => [
                  r.name,
                  pct(r.numericRate),
                  pct(r.dateRate),
                  pct(r.boolRate),
                  r.best,
                ])}
                emptyText="No parse/cast diagnostics"
              />
            </ModulePanel>
          )}

          {activeModule === 'sentinel' && (
            <ModulePanel title="Sentinel / Placeholder Audit">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-[10px]">
                <MetricCard label="Affected columns" value={String(sentinelRows.length)} />
                <MetricCard label="Total token hits" value={String(sentinelRows.reduce((acc, r) => acc + r.hits, 0))} />
                <MetricCard label="Tracked tokens" value={String(SENTINEL_TOKENS.length)} />
              </div>

              <GridRows
                columns={["Column", "Hits", "Top tokens"]}
                rows={sentinelRows.slice(0, rowLimit).map((r) => [
                  r.name,
                  r.hits.toLocaleString(),
                  r.topTokens,
                ])}
                emptyText="No sentinel tokens detected"
              />
            </ModulePanel>
          )}

          {activeModule === 'freshness' && (
            <ModulePanel title="Freshness / Runout">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-[10px]">
                <MetricCard label="Date-like columns" value={String(freshnessRows.length)} />
                <MetricCard
                  label="Most recent (days)"
                  value={freshnessRows.length ? String(Math.min(...freshnessRows.map((r) => r.recencyDays))) : '-'}
                />
                <MetricCard
                  label="Missing month flags"
                  value={String(freshnessRows.filter((r) => r.missingMonths > 0).length)}
                />
              </div>

              <GridRows
                columns={["Column", "Recency (days)", "Span months", "Missing months", "Latest/Prev"]}
                rows={freshnessRows.slice(0, rowLimit).map((r) => [
                  r.name,
                  r.recencyDays.toLocaleString(),
                  r.spanMonths.toLocaleString(),
                  r.missingMonths.toLocaleString(),
                  r.latestPrevRatio == null ? '-' : `${r.latestPrevRatio.toFixed(2)}x`,
                ])}
                emptyText="No date-like freshness diagnostics"
              />
            </ModulePanel>
          )}
        </div>
      )}
    </div>
  )
}

function ModulePanel({
  title,
  right,
  children,
}: {
  title: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded border border-border bg-bg-deep/60 overflow-hidden">
      <div className="px-2 py-0.5 border-b border-border/60 flex items-center justify-between">
        <span className="text-[11px] text-text-secondary">{title}</span>
        {right}
      </div>
      <div className="p-1.5 space-y-1.5">{children}</div>
    </div>
  )
}

function GridRows({
  columns,
  rows,
  emptyText,
}: {
  columns: string[]
  rows: string[][]
  emptyText: string
}) {
  return (
    <div className="rounded border border-border/60 bg-surface/70 p-1.5">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((col) => (
          <div key={col} className="text-[9px] uppercase tracking-wide text-text-muted font-mono px-1 py-0.5">{col}</div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="text-[10px] text-text-muted px-1 py-2">{emptyText}</div>
      ) : (
        <div className="space-y-1 mt-1">
          {rows.map((row, idx) => (
            <div
              key={`${row.join('|')}-${idx}`}
              className="grid gap-1 rounded border border-border/40 bg-bg-deep/55 px-1 py-0.5"
              style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
            >
              {row.map((cell, cellIdx) => (
                <div key={`${cell}-${cellIdx}`} className="text-[10px] font-mono text-text-secondary truncate" title={cell}>{cell}</div>
              ))}
            </div>
          ))}
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
