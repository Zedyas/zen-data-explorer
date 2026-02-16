import { useCallback, useState, type DragEvent } from 'react'
import { useUploadDataset } from '../api.ts'

export function Landing() {
  const upload = useUploadDataset()
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) upload.mutate(file)
    },
    [upload],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) upload.mutate(file)
    },
    [upload],
  )

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
            ${upload.isPending ? 'pointer-events-none opacity-60' : ''}
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
            {upload.isPending ? 'Uploading...' : 'Drop CSV file here'}
          </p>
          <p className="text-xs text-text-muted">
            or click to browse
          </p>

          <input
            id="file-input"
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Error */}
        {upload.isError && (
          <div className="mt-4 p-3 rounded-md bg-error/10 border border-error/20 text-error text-sm animate-slide-up">
            {upload.error.message}
          </div>
        )}

        {/* Supported formats */}
        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-text-muted">
          <span className="px-2 py-0.5 rounded bg-surface border border-border font-mono">
            .csv
          </span>
          <span className="text-text-muted/50">More formats coming soon</span>
        </div>
      </div>
    </div>
  )
}
