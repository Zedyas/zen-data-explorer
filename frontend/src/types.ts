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
  stats?: Record<string, number | null>
  histogram?: { bin?: number; low?: number; high?: number; label?: string; count: number }[]
  topValues?: { value: string; count: number }[]
}

export interface QueryResponse {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  executionTime: number
}

export interface SqlCell {
  id: string
  sql: string
  result: QueryResponse | null
  error: string | null
  isRunning: boolean
}

export type WorkspaceTab = 'overview' | 'dynamic'

export type CellType = 'table' | 'sql' | 'python' | 'compare'

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
  sql?: string
  python?: string
  compare?: {
    leftDatasetId: string | null
    rightDatasetId: string | null
    leftSpec: TableQuerySpec
    rightSpec: TableQuerySpec
    leftResult: TableQueryResponse | null
    rightResult: TableQueryResponse | null
  }
  autoRun?: boolean
  result: QueryResponse | TableQueryResponse | null
  error: string | null
  isRunning: boolean
}
