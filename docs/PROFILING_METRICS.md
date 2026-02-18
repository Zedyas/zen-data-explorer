# Profiling Metrics Definitions

This document is the canonical source for profiler metric definitions.
It is intended to be reused in the in-app About/Help section later.

Frontend mapping for About UI:

- `frontend/src/content/metricGlossary.ts`

## Scope And Sampling

- Profiling runs against the dataset context, not the currently visible page.
- If dataset rows are `<= 1,000,000`, profiling uses the full dataset.
- If dataset rows are `> 1,000,000`, profiling samples `1,000,000` rows.
- Any metric marked as a rate is computed over profiled rows (or non-null profiled rows where noted).

## Universal Metrics (All Column Types)

- `nonNullCount` (`Non-null vals`): `COUNT(column)`
- `uniqueCount` (`Unique vals`): `COUNT(DISTINCT column)`
- `sampleSize` (`Profiled rows` in UI): number of rows used for metric computation
- `nullCount` (`Null count`): `COUNT(*) - COUNT(column)`
- `coveragePct` (`Coverage`): `(nonNullCount / sampleSize) * 100`
- `cardinalityPct` (`Cardinality`): `(uniqueCount / nonNullCount) * 100` when `nonNullCount > 0`
- `cardinalityBand`:
  - `low`: `< 20%`
  - `medium`: `>= 20%` and `< 80%`
  - `high`: `>= 80%`
- `keyHint` (heuristic only):
  - `strong`: all profiled rows are non-null and unique
  - `possible`: no nulls and cardinality `>= 98%`
  - `unlikely`: otherwise
- `dominantValue` / `dominantValueCount` / `dominantValueSharePct`:
  - most frequent non-null value and share
  - share formula: `(dominantValueCount / nonNullCount) * 100`
  - if top frequency is tied, dominant is reported as `none`

## Numeric Metrics (`integer`, `float`)

- `min`, `max`, `sum`, `mean`, `median`, `stddev`
- Percentiles: `p5`, `p25`, `p75`, `p95`, `p99`
- `iqr`: `p75 - p25`
- `uniquenessRatePct`: `(uniqueCount / nonNullCount) * 100`
- `duplicateRatePct`: `100 - uniquenessRatePct`
- `zeroRatePct`: `% of non-null rows where value = 0`
- `negativeRatePct`: `% of non-null rows where value < 0`
- `outlierCount` / `outlierRatePct`:
  - outliers are values outside IQR fences
  - lower fence: `p25 - 1.5 * iqr`
  - upper fence: `p75 + 1.5 * iqr`
  - rate formula: `(outlierCount / nonNullCount) * 100`
- Tail metrics:
  - `lowTailCount`: count where value `< p5` (computed internally)
  - `lowTailRatePct`: `(lowTailCount / nonNullCount) * 100`
  - `highTailCount`: count where value `> p95`
  - `highTailRatePct`: `(highTailCount / nonNullCount) * 100`
  - `lowTailValues`: most frequent values inside the low-tail subset
  - `highTailValues`: most frequent values inside the high-tail subset
- `histogram`: bucketed distribution over profiled rows

## String Metrics

- Length stats:
  - `minLength`, `maxLength`, `medianLength`
- Blank/whitespace:
  - `blankWhitespaceCount`: rows where `TRIM(value)` is empty
  - `blankWhitespacePct`: `(blankWhitespaceCount / nonNullCount) * 100`
- Sentinel detection:
  - `sentinelCount`: total rows matching sentinel tokens
  - `sentinelTokens`: per-token counts
  - sentinel token set: `na`, `n/a`, `null`, `none`, `-`, empty string, whitespace-only
- Outlier length detection:
  - `outlierLengthCount`: count of values with unusually short/long length
  - rule: `ABS(LENGTH(value) - mean_length) > 2 * stddev_length`
  - `outlierLengthPct`: `(outlierLengthCount / nonNullCount) * 100`
  - `outlierLengthExamples`: representative values (truncated examples)
- Pattern metrics:
  - `patternClasses`: top classes by share (`uuid`, `email`, `numeric-only`, `code-like`, `free-text`)
  - `distinctPatternCount`: count of distinct normalized shapes
  - normalization maps letters to `A` and digits to `9`
- Frequency concentration:
  - `topValues`: top frequent values and counts
  - `top10CoveragePct`: share covered by top 10 values
  - `tailProfile`:
    - `low`: top-10 coverage `>= 70%`
    - `medium`: top-10 coverage `>= 40%` and `< 70%`
    - `high`: top-10 coverage `< 40%`

## Date Metrics

- `min`, `max`: earliest and latest non-null date
- `missingPeriodDays`: missing days inside `[min, max]`
  - formula: `(DATEDIFF(min, max) + 1) - distinct_day_count`
- `largestGapDays`: largest day gap between consecutive observed dates
- `histogram`: monthly counts

## Boolean Metrics

- `trueCount`, `falseCount`, `nullCount`
- `trueSharePct`, `falseSharePct`, `nullSharePct`
- Boolean shares are computed over profiled rows (`sampleSize`)

## Notes

- Percentages are rounded for display and can have small rounding drift.
- Metrics are descriptive signals, not data quality guarantees.
- `keyHint` and tail/outlier metrics are heuristics intended to speed exploration.

## Planned Drilldown UX (Future)

Planned behavior for metric-driven exploration:

- Clickable profile metrics that can auto-create filters in Overview/Table Cell.
- Examples:
  - `Outlier lengths` -> filter rows where string length is outlier by the profile rule.
  - `Min Len` / `Max Len` -> filter rows where length equals column min/max length.
  - `Distinct patterns` / pattern-class chips -> filter rows matching selected pattern shape/class.
  - numeric tail rates (`< P5`, `> P95`) -> filter to low-tail or high-tail rows.
- Actions should integrate with existing filter chips (append, not replace, unless user selects replace mode).
- Intended as shortcuts for common investigations, not a separate filtering system.
