import { useMemo } from 'react'
import { useRunCode } from '../api.ts'
import { useAppStore } from '../store.ts'
import type { InvestigationCell } from '../types.ts'

export function CodeCell({ cell }: { cell: InvestigationCell }) {
  const updateCell = useAppStore((s) => s.updateCell)
  const removeCell = useAppStore((s) => s.removeCell)
  const setActiveCell = useAppStore((s) => s.setActiveCell)
  const activeCellId = useAppStore((s) => s.activeCellId)
  const isActive = activeCellId === cell.id
  const mutation = useRunCode(cell.datasetId)

  const language = cell.codeLanguage ?? 'sql'
  const sqlCode = useMemo(() => cell.codeSql ?? cell.code ?? 'SELECT * FROM data LIMIT 50', [cell.codeSql, cell.code])
  const pythonCode = useMemo(() => cell.codePython ?? 'df.head(50)', [cell.codePython])
  const code = language === 'sql' ? sqlCode : pythonCode

  function run() {
    const payload = { language, code }
    updateCell(cell.id, { isRunning: true, error: null })
    mutation.mutate(payload, {
      onSuccess: (data) => {
        updateCell(cell.id, {
          result: data,
          textOutput: data.textOutput ?? null,
          isRunning: false,
          error: null,
        })
      },
      onError: (err) => {
        updateCell(cell.id, {
          isRunning: false,
          error: err.message,
        })
      },
    })
  }

  return (
    <div
      id={`cell-${cell.id}`}
      onClick={() => setActiveCell(cell.id)}
      className={`overflow-hidden border bg-surface ${isActive ? 'border-accent border-l-2' : 'border-border'}`}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">{cell.title}</span>
          <select
            value={language}
            onChange={(e) => {
              const next = e.target.value as 'sql' | 'python'
              updateCell(cell.id, {
                codeLanguage: next,
                result: null,
                textOutput: null,
                error: null,
              })
            }}
            className="h-6 bg-bg border border-border text-[11px] text-text-secondary px-1"
          >
            <option value="sql">SQL</option>
            <option value="python">Python</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              run()
            }}
            className="h-6 px-2 border border-border bg-bg text-[11px] text-text-secondary hover:text-text hover:border-accent disabled:opacity-40"
            disabled={cell.isRunning}
          >
            {cell.isRunning ? 'Running...' : 'Run'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              removeCell(cell.id)
            }}
            className="text-text-muted hover:text-error text-sm px-1"
          >
            &times;
          </button>
        </div>
      </div>

      <textarea
        value={code}
        onChange={(e) => {
          const next = e.target.value
          if (language === 'sql') {
            updateCell(cell.id, { codeSql: next, code: next })
          } else {
            updateCell(cell.id, { codePython: next })
          }
        }}
        className="w-full min-h-[140px] bg-bg text-text font-mono text-xs p-2.5 outline-none resize-y border-b border-border"
      />

      {cell.error && <div className="px-2.5 py-2 text-xs text-error bg-error/10 border-t border-error/20">{cell.error}</div>}

      {cell.textOutput && (
        <pre className="px-2.5 py-2 text-xs text-text-secondary bg-bg border-t border-border overflow-auto">{cell.textOutput}</pre>
      )}

      {cell.result && cell.result.columns.length > 0 && (
        <div className="overflow-auto max-h-[320px] bg-bg border-t border-border">
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 z-[1]">
              <tr className="bg-bg border-b border-border">
                {cell.result.columns.map((col) => (
                  <th key={col} className="px-3 py-2 text-left font-medium text-text-secondary">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cell.result.rows.map((row, i) => (
                <tr key={i} className="h-[34px] border-b border-border hover:bg-surface-hover/40 transition-colors">
                  {cell.result!.columns.map((col) => (
                    <td key={col} className="px-3 py-0 font-mono text-xs text-text">
                      {row[col] == null ? <span className="text-text-muted/40 italic">null</span> : <span className="truncate block">{String(row[col])}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
