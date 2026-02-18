export type MetricDefinition = {
  id: string
  label: string
  scope: 'all' | 'numeric' | 'string' | 'date' | 'boolean'
  definition: string
  formula?: string
  notes?: string
}

export const METRIC_GLOSSARY: MetricDefinition[] = [
  {
    id: 'sampleSize',
    label: 'Profiled rows',
    scope: 'all',
    definition: 'Number of rows used to compute profile metrics.',
    notes: 'For large datasets this can be sampled.',
  },
  {
    id: 'nonNullCount',
    label: 'Non-null vals',
    scope: 'all',
    definition: 'Count of rows where the column has a non-null value.',
    formula: 'COUNT(column)',
  },
  {
    id: 'uniqueCount',
    label: 'Unique vals',
    scope: 'all',
    definition: 'Count of distinct non-null values.',
    formula: 'COUNT(DISTINCT column)',
  },
  {
    id: 'nullCount',
    label: 'Null count',
    scope: 'all',
    definition: 'Count of rows where the column value is null.',
    formula: 'COUNT(*) - COUNT(column)',
  },
  {
    id: 'coveragePct',
    label: 'Coverage',
    scope: 'all',
    definition: 'Share of profiled rows with non-null values.',
    formula: '(nonNullCount / sampleSize) * 100',
  },
  {
    id: 'cardinalityPct',
    label: 'Cardinality',
    scope: 'all',
    definition: 'How unique values are among non-null rows.',
    formula: '(uniqueCount / nonNullCount) * 100',
  },
  {
    id: 'keyHint',
    label: 'Key hint',
    scope: 'all',
    definition: 'Heuristic signal for key-like behavior.',
    notes:
      'strong: all profiled rows are non-null and unique; possible: no nulls and cardinality >= 98%; unlikely: otherwise.',
  },
  {
    id: 'dominantValue',
    label: 'Dominant',
    scope: 'all',
    definition: 'Most frequent non-null value and its share.',
    formula: '(dominantValueCount / nonNullCount) * 100',
    notes: 'If top frequency is tied, dominant is reported as none.',
  },

  {
    id: 'sum',
    label: 'Sum',
    scope: 'numeric',
    definition: 'Total of all non-null numeric values.',
  },
  {
    id: 'iqr',
    label: 'IQR',
    scope: 'numeric',
    definition: 'Interquartile range.',
    formula: 'p75 - p25',
  },
  {
    id: 'p5',
    label: 'P5',
    scope: 'numeric',
    definition: '5th percentile (value below which 5% of non-null values fall).',
  },
  {
    id: 'p25',
    label: 'P25',
    scope: 'numeric',
    definition: '25th percentile (first quartile).',
  },
  {
    id: 'p75',
    label: 'P75',
    scope: 'numeric',
    definition: '75th percentile (third quartile).',
  },
  {
    id: 'p95',
    label: 'P95',
    scope: 'numeric',
    definition: '95th percentile.',
  },
  {
    id: 'p99',
    label: 'P99',
    scope: 'numeric',
    definition: '99th percentile.',
  },
  {
    id: 'zeroRatePct',
    label: 'Zero rate',
    scope: 'numeric',
    definition: 'Share of non-null values equal to 0.',
    formula: '(count(value = 0) / nonNullCount) * 100',
  },
  {
    id: 'negativeRatePct',
    label: 'Neg rate',
    scope: 'numeric',
    definition: 'Share of non-null values less than 0.',
    formula: '(count(value < 0) / nonNullCount) * 100',
  },
  {
    id: 'outlierRatePct',
    label: 'Outlier rate',
    scope: 'numeric',
    definition: 'Share of non-null values outside IQR fences.',
    formula: '(count(value < p25 - 1.5*IQR or value > p75 + 1.5*IQR) / nonNullCount) * 100',
  },
  {
    id: 'uniquenessRatePct',
    label: 'Unique rate',
    scope: 'numeric',
    definition: 'Share of non-null rows that are unique.',
    formula: '(uniqueCount / nonNullCount) * 100',
  },
  {
    id: 'duplicateRatePct',
    label: 'Duplicate rate',
    scope: 'numeric',
    definition: 'Share of non-null rows that are duplicates.',
    formula: '100 - uniquenessRatePct',
  },
  {
    id: 'lowTailRatePct',
    label: 'Low tail (< P5)',
    scope: 'numeric',
    definition: 'Share of non-null values below the 5th percentile.',
    formula: '(count(value < p5) / nonNullCount) * 100',
  },
  {
    id: 'highTailRatePct',
    label: 'High tail (> P95)',
    scope: 'numeric',
    definition: 'Share of non-null values above the 95th percentile.',
    formula: '(count(value > p95) / nonNullCount) * 100',
  },

  {
    id: 'blankWhitespaceCount',
    label: 'Blank/WS count',
    scope: 'string',
    definition: 'Count of non-null rows where the trimmed value is empty.',
    formula: 'count(TRIM(value) = "")',
  },
  {
    id: 'sentinelCount',
    label: 'Sentinel count',
    scope: 'string',
    definition: 'Count of values matching common missing-value tokens.',
    notes: 'Tokens include: na, n/a, null, none, -, empty, whitespace-only.',
  },
  {
    id: 'distinctPatternCount',
    label: 'Distinct patterns',
    scope: 'string',
    definition: 'Count of unique normalized string shapes.',
    notes: 'Normalization maps letters to A and digits to 9 (e.g. AB-123 and CD-999 share a shape).',
  },
  {
    id: 'outlierLengthCount',
    label: 'Outlier lengths',
    scope: 'string',
    definition: 'Count of values with unusually short or long string length.',
    formula: 'count(abs(length - mean_length) > 2 * stddev_length)',
  },
  {
    id: 'top10CoveragePct',
    label: 'Top 10 coverage',
    scope: 'string',
    definition: 'Share of non-null rows covered by the 10 most frequent values.',
  },
  {
    id: 'tailProfile',
    label: 'Tail profile',
    scope: 'string',
    definition: 'Concentration indicator derived from top-10 coverage.',
    notes: 'low >= 70%, medium >= 40% and < 70%, high < 40%.',
  },

  {
    id: 'missingPeriodDays',
    label: 'Missing days',
    scope: 'date',
    definition: 'Days missing inside the min-max date span.',
    formula: '(DATEDIFF(min, max) + 1) - distinct_day_count',
  },
  {
    id: 'largestGapDays',
    label: 'Largest gap',
    scope: 'date',
    definition: 'Largest day gap between consecutive observed dates.',
  },

  {
    id: 'trueSharePct',
    label: 'True %',
    scope: 'boolean',
    definition: 'Share of profiled rows where value is true.',
    formula: '(trueCount / sampleSize) * 100',
  },
  {
    id: 'falseSharePct',
    label: 'False %',
    scope: 'boolean',
    definition: 'Share of profiled rows where value is false.',
    formula: '(falseCount / sampleSize) * 100',
  },
  {
    id: 'nullSharePct',
    label: 'Null %',
    scope: 'boolean',
    definition: 'Share of profiled rows where value is null.',
    formula: '(nullCount / sampleSize) * 100',
  },
]

export const METRIC_GLOSSARY_BY_ID = Object.fromEntries(
  METRIC_GLOSSARY.map((metric) => [metric.id, metric]),
) as Record<string, MetricDefinition>
