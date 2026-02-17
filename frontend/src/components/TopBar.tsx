import { useRef, type ChangeEvent } from 'react'
import { useAppStore } from '../store.ts'
import { useUploadDataset } from '../api.ts'

export function TopBar() {
  const dataset = useAppStore((s) => s.activeDataset)
  const datasets = useAppStore((s) => s.datasets)
  const removeDataset = useAppStore((s) => s.removeDataset)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const filters = useAppStore((s) => s.filters)
  const sort = useAppStore((s) => s.sort)
  const upload = useUploadDataset()
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!dataset) return null

  const formatCount = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  const handleExport = () => {
    const params = new URLSearchParams()
    if (sort) {
      params.set('sort_column', sort.column)
      params.set('sort_direction', sort.direction)
    }
    if (filters.length > 0) {
      params.set('filters', JSON.stringify(filters))
    }
    const url = `/api/datasets/${dataset.id}/export?${params}`
    const a = document.createElement('a')
    a.href = url
    a.download = dataset.name
    a.click()
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) upload.mutate(file)
    e.currentTarget.value = ''
  }

  return (
    <div className="h-9 flex items-center gap-3 px-3 border-b border-border panel-surface shrink-0">
      {/* Sidebar toggle */}
      <button
        onClick={toggleSidebar}
        className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
        title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="2" width="14" height="12" rx="2" />
          <line x1="5.5" y1="2" x2="5.5" y2="14" />
        </svg>
      </button>

      {/* Separator */}
      <div className="w-px h-4 bg-border" />

      {/* Dataset info */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-text truncate">{dataset.name}</span>
        <span className="px-1.5 py-0.5 rounded bg-surface-elevated font-mono text-xs text-text-muted shrink-0">
          {formatCount(dataset.rowCount)} x {dataset.columns.length}
        </span>
        {datasets.length > 1 && (
          <span className="px-1.5 py-0.5 rounded border border-border-strong bg-surface text-[10px] text-text-muted font-mono">
            {datasets.length} instances
          </span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
        title="Add another dataset"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 3v10M3 8h10" />
        </svg>
        Add Data
      </button>

      <button
        onClick={handleExport}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
        title="Export filtered data as CSV"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 10v3h10v-3" />
          <path d="M8 2v8" />
          <path d="M5 7l3 3 3-3" />
        </svg>
        Export
      </button>

      <button
        onClick={() => removeDataset(dataset.id)}
        className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
        title="Close dataset"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="4" y1="4" x2="12" y2="12" />
          <line x1="12" y1="4" x2="4" y2="12" />
        </svg>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={onFileChange}
        className="hidden"
      />
    </div>
  )
}
