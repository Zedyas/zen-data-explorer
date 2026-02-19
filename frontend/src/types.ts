export type ColumnType = 'string' | 'integer' | 'float' | 'date' | 'boolean'

export interface Column {
  name: string
  type: ColumnType
  nullCount: number
  totalCount: number
  uniqueCount?: number
  sparkline?: number[]
}

export interface Filter {
  column: string
  operator: string
  value: string | number | string[]
}

export interface Dataset {
  id: string
  name: string
  sourceType?: 'file' | 'database'
  rowCount: number
  columns: Column[]
}

export interface PageResponse {
  rows: Record<string, unknown>[]
  columns: string[]
  totalRows: number
  filteredRows: number
  nextCursor: string | null
  prevCursor: string | null
  page: number
  pageSize: number
  totalPages: number
}

export interface SchemaResponse {
  columns: Column[]
  rowCount: number
}

export interface UploadResponse {
  id: string
  name: string
  sourceType?: 'file' | 'database'
  rowCount: number
  columns: Column[]
}

export interface DiscoverEntity {
  name: string
  kind: 'dataset' | 'sheet' | 'table'
  rowCount: number
}

export interface DiscoverResponse {
  importId: string
  name: string
  format: 'csv' | 'parquet' | 'excel' | 'sqlite'
  entities: DiscoverEntity[]
  requiresSelection: boolean
}

export interface ImportRequest {
  importId: string
  selectedEntities?: string[]
  importMode?: 'selected' | 'all'
  datasetNameMode?: 'filename_entity' | 'entity_only'
}

export interface ImportResponse {
  importId: string
  datasets: UploadResponse[]
}

// Phase 2 types

export interface ProfileResponse {
  column: string
  type: ColumnType
  totalRows: number
  sampled: boolean
  sampleSize: number
  nonNullCount: number
  nullCount: number
  uniqueCount: number
  coveragePct?: number
  cardinalityPct?: number
  cardinalityBand?: 'low' | 'medium' | 'high'
  keyHint?: 'strong' | 'possible' | 'unlikely'
  dominantValue?: string | null
  dominantValueCount?: number
  dominantValueSharePct?: number
  stats?: Record<string, number | string | null>
  histogram?: { bin?: number; low?: number; high?: number; label?: string; count: number }[]
  topValues?: { value: string; count: number }[]
  patternClasses?: { label: string; count: number; sharePct: number }[]
  top10CoveragePct?: number
  tailProfile?: 'low' | 'medium' | 'high'
  sentinelCount?: number
  sentinelTokens?: { token: string; count: number }[]
  outlierLengthExamples?: string[]
  lowTailValues?: { value: string; count: number }[]
  highTailValues?: { value: string; count: number }[]
}

export interface QueryResponse {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  executionTime: number
}

export type WorkspaceTab = 'overview' | 'notebook'

export type CellType = 'table' | 'compare'

export interface AggregationSpec {
  op: 'count' | 'sum' | 'avg' | 'min' | 'max'
  column: string
  as?: string
}

export interface SortSpec {
  column: string
  direction: 'asc' | 'desc'
}

export interface HavingSpec {
  metric: string
  operator: '=' | '!=' | '>' | '<' | '>=' | '<='
  value: string | number
}

export interface TableQuerySpec {
  filters: Filter[]
  groupBy: string[]
  aggregations: AggregationSpec[]
  having: HavingSpec[]
  sort: SortSpec[]
  limit?: number
}

export interface TableQueryResponse {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  generatedSql: string
  generatedPython: string
}

export interface InvestigationCell {
  id: string
  type: CellType
  title: string
  datasetId?: string
  tableSpec?: TableQuerySpec
  compare?: {
    leftDatasetId: string | null
    rightDatasetId: string | null
    leftSpec: TableQuerySpec
    rightSpec: TableQuerySpec
    leftResult: TableQueryResponse | null
    rightResult: TableQueryResponse | null
  }
  compareUi?: {
    showControls: boolean
    syncScroll: boolean
  }
  autoRun?: boolean
  result: QueryResponse | TableQueryResponse | null
  error: string | null
  isRunning: boolean
}
