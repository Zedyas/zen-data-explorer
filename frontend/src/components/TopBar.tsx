import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useAppStore } from '../store.ts'
import { useDiscoverDataset, useImportDatasets } from '../api.ts'
import type { DiscoverResponse } from '../types.ts'

export function TopBar() {
  const dataset = useAppStore((s) => s.activeDataset)
  const datasets = useAppStore((s) => s.datasets)
  const removeDataset = useAppStore((s) => s.removeDataset)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const filters = useAppStore((s) => s.filters)
  const sort = useAppStore((s) => s.sort)
  const discover = useDiscoverDataset()
  const importDatasets = useImportDatasets()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<DiscoverResponse | null>(null)
  const [selectedEntities, setSelectedEntities] = useState<string[]>([])

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
    if (file) {
      discover.mutate(file, {
        onSuccess: (data) => {
          if (!data.requiresSelection) {
            importDatasets.mutate({ importId: data.importId, importMode: 'all' })
            return
          }
          setPendingImport(data)
          setSelectedEntities(data.entities.map((entity) => entity.name))
        },
      })
    }
    e.currentTarget.value = ''
  }

  const toggleEntity = useCallback((name: string) => {
    setSelectedEntities((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name],
    )
  }, [])

  const confirmSelection = useCallback(() => {
    if (!pendingImport) return
    importDatasets.mutate(
      {
        importId: pendingImport.importId,
        importMode: 'selected',
        selectedEntities,
        datasetNameMode: 'filename_entity',
      },
      {
        onSuccess: () => {
          setPendingImport(null)
          setSelectedEntities([])
        },
      },
    )
  }, [importDatasets, pendingImport, selectedEntities])

  const busy = discover.isPending || importDatasets.isPending
  const pendingLabel = pendingImport?.format === 'excel' ? 'Sheets' : 'Tables'
  const importError = useMemo(() => {
    if (importDatasets.isError) return importDatasets.error.message
    if (discover.isError) return discover.error.message
    return null
  }, [discover.error, discover.isError, importDatasets.error, importDatasets.isError])

  return (
    <div className="h-12 flex items-center gap-3 px-3 border-b border-border panel-surface shrink-0">
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

      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[16px] font-medium text-text truncate">{dataset.name}</span>
        <span className="px-1.5 py-0.5 border border-border bg-bg font-mono text-xs text-text-muted shrink-0">
          {formatCount(dataset.rowCount)} x {dataset.columns.length}
        </span>
        {datasets.length > 1 && (
          <span className="px-1.5 py-0.5 border border-border bg-bg text-[10px] text-text-muted font-mono">
            {datasets.length} instances
          </span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-50"
        title="Add another dataset"
        disabled={busy}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 3v10M3 8h10" />
        </svg>
        {busy ? 'Importing...' : 'Add Data'}
      </button>

      <button
        onClick={handleExport}
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
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
        accept=".csv,.parquet,.xlsx,.sqlite,.db"
        onChange={onFileChange}
        className="hidden"
      />

      {pendingImport && (
        <div className="fixed inset-0 z-50 bg-bg-deep/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md border border-border-strong bg-surface">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-text">Select {pendingLabel} to Import</div>
                <div className="text-[11px] text-text-muted">{pendingImport.name}</div>
              </div>
              <button
                onClick={() => {
                  setPendingImport(null)
                  setSelectedEntities([])
                }}
                className="text-text-muted hover:text-text text-sm"
              >
                &times;
              </button>
            </div>

            <div className="max-h-[320px] overflow-y-auto p-3 space-y-1">
              {pendingImport.entities.map((entity) => {
                const checked = selectedEntities.includes(entity.name)
                return (
                  <label key={entity.name} className="flex items-center justify-between gap-3 px-2 py-1.5 border border-border bg-bg cursor-pointer">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEntity(entity.name)}
                      />
                      <span className="text-sm text-text truncate">{entity.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-text-muted shrink-0">
                      {entity.rowCount.toLocaleString()} rows
                    </span>
                  </label>
                )
              })}
            </div>

            {importError && (
              <div className="px-4 py-2 text-xs text-error border-t border-border">{importError}</div>
            )}

            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <button
                onClick={() => setSelectedEntities(pendingImport.entities.map((e) => e.name))}
                className="text-xs text-text-muted hover:text-text"
              >
                Select all
              </button>
              <button
                onClick={confirmSelection}
                disabled={selectedEntities.length === 0 || importDatasets.isPending}
                className="h-8 px-3 border border-border-strong bg-bg text-xs text-text-secondary hover:text-text hover:border-accent disabled:opacity-40"
              >
                {importDatasets.isPending ? 'Importing...' : `Import ${selectedEntities.length}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
