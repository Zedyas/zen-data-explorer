import { useCallback, useMemo, useState, type DragEvent } from 'react'
import { useDiscoverDataset, useImportDatasets } from '../api.ts'
import type { DiscoverResponse } from '../types.ts'

export function Landing() {
  const discover = useDiscoverDataset()
  const importDatasets = useImportDatasets()
  const [dragOver, setDragOver] = useState(false)
  const [pendingImport, setPendingImport] = useState<DiscoverResponse | null>(null)
  const [selectedEntities, setSelectedEntities] = useState<string[]>([])

  const busy = discover.isPending || importDatasets.isPending

  const beginImport = useCallback((file: File) => {
    discover.mutate(file, {
      onSuccess: (data) => {
        if (!data.requiresSelection) {
          importDatasets.mutate({ importId: data.importId, importMode: 'all' })
          return
        }
        setPendingImport(data)
        setSelectedEntities(data.entities.map((e) => e.name))
      },
    })
  }, [discover, importDatasets])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) beginImport(file)
    },
    [beginImport],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) beginImport(file)
    },
    [beginImport],
  )

  const activeError = useMemo(() => {
    if (importDatasets.isError) return importDatasets.error.message
    if (discover.isError) return discover.error.message
    return null
  }, [discover.error, discover.isError, importDatasets.error, importDatasets.isError])

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

  const toggleEntity = useCallback((name: string) => {
    setSelectedEntities((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name],
    )
  }, [])

  const pendingLabel = pendingImport?.format === 'excel' ? 'Sheets' : 'Tables'

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-bg-deep">
      <div className="w-full max-w-lg animate-fade-in">
        {/* Title */}
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-text mb-2">
            Zen Data Explorer
          </h1>
          <p className="text-sm text-text-muted">
            Drop a file to begin exploring
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`
            relative rounded-lg border-2 border-dashed transition-all duration-200
            flex flex-col items-center justify-center p-12 cursor-pointer
            ${
              dragOver
                ? 'border-accent bg-accent-dim scale-[1.01]'
                : 'border-border-strong hover:border-text-muted bg-surface'
            }
            ${busy ? 'pointer-events-none opacity-60' : ''}
          `}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          {/* Icon */}
          <div className={`mb-4 transition-transform duration-200 ${dragOver ? 'scale-110' : ''}`}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-text-muted"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>

          <p className="text-sm text-text-secondary mb-1">
            {busy ? 'Importing...' : 'Drop data file here'}
          </p>
          <p className="text-xs text-text-muted">
            or click to browse
          </p>

          <input
            id="file-input"
            type="file"
            accept=".csv,.parquet,.xlsx,.sqlite,.db"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Error */}
        {activeError && (
          <div className="mt-4 p-3 rounded-md bg-error/10 border border-error/20 text-error text-sm animate-slide-up">
            {activeError}
          </div>
        )}

        {/* Supported formats */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-text-muted flex-wrap">
          <span className="px-2 py-0.5 rounded bg-surface border border-border font-mono">
            .csv
          </span>
          <span className="px-2 py-0.5 rounded bg-surface border border-border font-mono">.parquet</span>
          <span className="px-2 py-0.5 rounded bg-surface border border-border font-mono">.xlsx</span>
          <span className="px-2 py-0.5 rounded bg-surface border border-border font-mono">.sqlite</span>
          <span className="px-2 py-0.5 rounded bg-surface border border-border font-mono">.db</span>
        </div>
      </div>

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
