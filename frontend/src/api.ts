import { useQuery, useMutation } from '@tanstack/react-query'
import type {
  DiscoverResponse,
  Filter,
  ImportRequest,
  ImportResponse,
  PageResponse,
  UploadResponse,
  SchemaResponse,
  ProfileResponse,
  QueryResponse,
  TableQueryResponse,
  TableQuerySpec,
} from './types.ts'
import { useAppStore } from './store.ts'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
  }
  return res.json()
}

// ── Upload ──

function applyImportedDatasets(
  setActiveDataset: (dataset: {
    id: string
    name: string
    sourceType?: 'file' | 'database'
    rowCount: number
    columns: UploadResponse['columns']
  } | null) => void,
  datasets: UploadResponse[],
) {
  for (const ds of datasets) {
    setActiveDataset({
      id: ds.id,
      name: ds.name,
      sourceType: ds.sourceType ?? 'file',
      rowCount: ds.rowCount,
      columns: ds.columns,
    })
  }
}

export function useUploadDataset() {
  const setActiveDataset = useAppStore((s) => s.setActiveDataset)

  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<UploadResponse>('/datasets/upload', { method: 'POST', body: form })
    },
    onSuccess: (data) => {
      setActiveDataset({
        id: data.id,
        name: data.name,
        sourceType: data.sourceType ?? 'file',
        rowCount: data.rowCount,
        columns: data.columns,
      })
    },
  })
}

export function useDiscoverDataset() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<DiscoverResponse>('/datasets/discover', { method: 'POST', body: form })
    },
  })
}

export function useImportDatasets() {
  const setActiveDataset = useAppStore((s) => s.setActiveDataset)

  return useMutation({
    mutationFn: (body: ImportRequest) =>
      request<ImportResponse>('/datasets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      applyImportedDatasets(setActiveDataset, data.datasets)
    },
  })
}

// ── Schema ──

export function useDatasetSchema(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['schema', datasetId],
    queryFn: () => request<SchemaResponse>(`/datasets/${datasetId}/schema`),
    enabled: !!datasetId,
    staleTime: Infinity,
  })
}

// ── Page ──

interface PageParams {
  datasetId: string
  pageSize: number
  cursor: string | null
  sort: { column: string; direction: 'asc' | 'desc' } | null
  filters: Filter[]
}

export function useDatasetPage(params: PageParams | null) {
  return useQuery({
    queryKey: ['page', params?.datasetId, params?.cursor, params?.pageSize, params?.sort, params?.filters],
    queryFn: () => {
      if (!params) throw new Error('No params')
      const searchParams = new URLSearchParams()
      searchParams.set('page_size', String(params.pageSize))
      if (params.cursor) {
        searchParams.set('cursor', params.cursor)
      }
      if (params.sort) {
        searchParams.set('sort_column', params.sort.column)
        searchParams.set('sort_direction', params.sort.direction)
      }
      if (params.filters.length > 0) {
        searchParams.set('filters', JSON.stringify(params.filters))
      }
      return request<PageResponse>(`/datasets/${params.datasetId}/page?${searchParams}`)
    },
    enabled: !!params?.datasetId,
    placeholderData: (prev) => prev,
  })
}

// ── Column Profile ──

export function useColumnProfile(datasetId: string | undefined, column: string | null) {
  return useQuery({
    queryKey: ['profile', datasetId, column],
    queryFn: () => {
      if (!datasetId || !column) throw new Error('Dataset and column are required')
      return request<ProfileResponse>(`/datasets/${datasetId}/profile/${encodeURIComponent(column)}`)
    },
    enabled: !!datasetId && !!column,
    staleTime: 5 * 60 * 1000,
  })
}

// ── SQL Query ──

export function useRunQuery(datasetId: string | undefined) {
  return useMutation({
    mutationFn: (sql: string) =>
      request<QueryResponse>(`/datasets/${datasetId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      }),
  })
}

// ── Table Query Cell ──

export function useRunTableQuery(datasetId: string | undefined) {
  return useMutation({
    mutationFn: (spec: TableQuerySpec) => {
      if (!datasetId) throw new Error('No active dataset')
      return request<TableQueryResponse>(`/datasets/${datasetId}/table-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
      })
    },
  })
}
