import { useRef, useEffect, useCallback } from 'react'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { sql } from '@codemirror/lang-sql'
import { defaultKeymap } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { useAppStore } from '../store.ts'
import { useRunQuery } from '../api.ts'
import type { InvestigationCell, QueryResponse } from '../types.ts'

const darkTheme = EditorView.theme({
  '&': {
    backgroundColor: '#121b22',
    color: '#dce8f5',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  },
  '.cm-content': {
    caretColor: '#2dd4bf',
    padding: '8px 0',
  },
  '.cm-cursor': { borderLeftColor: '#2dd4bf' },
  '.cm-activeLine': { backgroundColor: 'rgba(45, 212, 191, 0.04)' },
  '.cm-selectionBackground': { backgroundColor: 'rgba(45, 212, 191, 0.15) !important' },
  '.cm-gutters': {
    backgroundColor: '#0d1419',
    color: '#4d6070',
    border: 'none',
    minWidth: '32px',
  },
}, { dark: true })

export function SqlCell({ cell }: { cell: InvestigationCell }) {
  const datasets = useAppStore((s) => s.datasets)
  const activeDataset = useAppStore((s) => s.activeDataset)
  const dataset = datasets.find((d) => d.id === cell.datasetId) ?? activeDataset
  const updateCell = useAppStore((s) => s.updateCell)
  const removeCell = useAppStore((s) => s.removeCell)
  const setActiveCell = useAppStore((s) => s.setActiveCell)
  const activeCellId = useAppStore((s) => s.activeCellId)
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const sqlRef = useRef(cell.sql ?? '')
  const queryMutation = useRunQuery(dataset?.id)

  const isActive = activeCellId === cell.id

  const runQuery = useCallback(() => {
    const currentSql = sqlRef.current.trim()
    if (!currentSql || !dataset) return
    updateCell(cell.id, { isRunning: true, error: null })
    queryMutation.mutate(currentSql, {
      onSuccess: (data) => {
        updateCell(cell.id, { result: data, isRunning: false, error: null })
      },
      onError: (err) => {
        updateCell(cell.id, { result: null, isRunning: false, error: err.message })
      },
    })
  }, [cell.id, dataset, queryMutation, updateCell])

  useEffect(() => {
    if (!editorRef.current || viewRef.current) return

    const runKeymap = keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          runQuery()
          return true
        },
      },
    ])

    const state = EditorState.create({
      doc: cell.sql ?? '',
      extensions: [
        runKeymap,
        keymap.of(defaultKeymap),
        sql(),
        syntaxHighlighting(defaultHighlightStyle),
        darkTheme,
        cmPlaceholder('SELECT * FROM data LIMIT 50'),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newSql = update.state.doc.toString()
            sqlRef.current = newSql
            updateCell(cell.id, { sql: newSql })
          }
        }),
        EditorView.lineWrapping,
      ],
    })

    viewRef.current = new EditorView({ state, parent: editorRef.current })
    return () => {
      viewRef.current?.destroy()
      viewRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const result = cell.result as QueryResponse | null

  return (
    <div
      id={`cell-${cell.id}`}
      onClick={() => setActiveCell(cell.id)}
      className={`rounded-lg overflow-hidden ${isActive ? 'gradient-border-active' : 'gradient-border-subtle'}`}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border-strong bg-surface">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{cell.title}</span>
          {dataset && <span className="text-[10px] text-text-muted/80 font-mono">{dataset.name}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              runQuery()
            }}
            disabled={cell.isRunning}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 transition-colors"
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

      <div ref={editorRef} className="min-h-[60px] max-h-[200px] overflow-auto border-b border-border/60" />

      {cell.error && (
        <div className="px-3 py-2 text-xs text-error border-t border-border bg-error/5">{cell.error}</div>
      )}

      {result && !cell.isRunning && (
        <div className="border-t border-border">
          <div className="flex items-center gap-3 px-2.5 py-1 text-[10px] text-text-muted border-b border-border/70 bg-bg-deep/70">
            <span className="font-mono">{result.rowCount} row{result.rowCount !== 1 ? 's' : ''}</span>
            <span className="font-mono">{result.executionTime}s</span>
          </div>

          {result.rows.length > 0 ? (
            <div className="overflow-auto max-h-[360px]">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-surface">
                    {result.columns.map((col) => (
                      <th key={col} className="px-2 py-1 text-left font-medium text-text-secondary border-r border-border/40 last:border-r-0">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-t border-border/50 hover:bg-surface-hover/40">
                      {result.columns.map((col) => (
                        <td key={col} className="px-2 py-0.5 font-mono border-r border-border/30 last:border-r-0">
                          {row[col] == null ? <span className="text-text-muted/40 italic">null</span> : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-3 py-3 text-xs text-text-muted">Query returned no rows</div>
          )}
        </div>
      )}
    </div>
  )
}
