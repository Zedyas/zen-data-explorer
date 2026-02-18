import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '../store.ts'
import type { Filter, Column } from '../types.ts'

// ── Operator options by column type ──
const OPERATORS: Record<string, { label: string; value: string }[]> = {
  string: [
    { label: '=', value: '=' },
    { label: '!=', value: '!=' },
    { label: 'contains', value: 'contains' },
    { label: 'starts with', value: 'starts_with' },
    { label: 'is null', value: 'is_null' },
    { label: 'is not null', value: 'is_not_null' },
  ],
  integer: [
    { label: '=', value: '=' },
    { label: '!=', value: '!=' },
    { label: '>', value: '>' },
    { label: '<', value: '<' },
    { label: '>=', value: '>=' },
    { label: '<=', value: '<=' },
    { label: 'is null', value: 'is_null' },
    { label: 'is not null', value: 'is_not_null' },
  ],
  float: [
    { label: '=', value: '=' },
    { label: '!=', value: '!=' },
    { label: '>', value: '>' },
    { label: '<', value: '<' },
    { label: '>=', value: '>=' },
    { label: '<=', value: '<=' },
    { label: 'is null', value: 'is_null' },
    { label: 'is not null', value: 'is_not_null' },
  ],
  date: [
    { label: '=', value: '=' },
    { label: 'before', value: '<' },
    { label: 'after', value: '>' },
    { label: 'is null', value: 'is_null' },
    { label: 'is not null', value: 'is_not_null' },
  ],
  boolean: [
    { label: '=', value: '=' },
    { label: 'is null', value: 'is_null' },
    { label: 'is not null', value: 'is_not_null' },
  ],
}

function getOperators(type: string) {
  return OPERATORS[type] ?? OPERATORS.string
}

// ── Filter Pill ──
function FilterPill({ filter, index }: { filter: Filter; index: number }) {
  const removeFilter = useAppStore((s) => s.removeFilter)

  const displayValue =
    filter.operator === 'is_null' || filter.operator === 'is_not_null'
      ? ''
      : typeof filter.value === 'string'
        ? `"${filter.value}"`
        : String(filter.value)

  const displayOp =
    filter.operator === 'is_null'
      ? 'is null'
      : filter.operator === 'is_not_null'
        ? 'is not null'
      : filter.operator === 'starts_with'
        ? 'starts with'
        : filter.operator

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-muted border border-accent/40 text-xs font-mono text-accent animate-scale-in">
      <span className="text-accent">{filter.column}</span>
      <span className="text-accent/70">{displayOp}</span>
      {displayValue && <span>{displayValue}</span>}
      <button
        onClick={() => removeFilter(index)}
        className="ml-0.5 text-accent/75 hover:text-text transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="3" y1="3" x2="9" y2="9" />
          <line x1="9" y1="3" x2="3" y2="9" />
        </svg>
      </button>
    </span>
  )
}

// ── Add Filter Dropdown ──
function AddFilterDropdown({ onClose }: { onClose: () => void }) {
  const columns = useAppStore((s) => s.activeDataset?.columns ?? [])
  const addFilter = useAppStore((s) => s.addFilter)
  const [step, setStep] = useState<'column' | 'operator' | 'value'>('column')
  const [selectedColumn, setSelectedColumn] = useState<Column | null>(null)
  const [selectedOp, setSelectedOp] = useState<string>('')
  const [value, setValue] = useState('')
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    inputRef.current?.focus()
  }, [step])

  const filteredColumns = columns.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  )

  const handleSubmit = useCallback(() => {
    if (!selectedColumn) return
    const filter: Filter = {
      column: selectedColumn.name,
      operator: selectedOp,
      value: selectedOp === 'is_null' || selectedOp === 'is_not_null' ? '' : value,
    }
    addFilter(filter)
    onClose()
  }, [selectedColumn, selectedOp, value, addFilter, onClose])

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 w-64 gradient-border-subtle rounded-lg overflow-hidden z-50 animate-slide-down"
    >
      {/* Step: Column */}
      {step === 'column' && (
        <div>
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search columns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1 text-xs bg-surface border border-border rounded focus:border-accent focus:outline-none text-text placeholder:text-text-muted"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredColumns.map((col) => (
              <button
                key={col.name}
                onClick={() => {
                  setSelectedColumn(col)
                  setStep('operator')
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-surface-hover transition-colors"
              >
                <span className={`type-badge-${col.type} px-1 py-0.5 rounded text-[10px] font-mono`}>
                  {col.type.slice(0, 3)}
                </span>
                <span className="text-text">{col.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step: Operator */}
      {step === 'operator' && selectedColumn && (
        <div>
          <div className="px-3 py-2 border-b border-border text-xs text-text-muted">
            <span className="font-mono text-accent">{selectedColumn.name}</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {getOperators(selectedColumn.type).map((op) => (
              <button
                key={op.value}
                onClick={() => {
                  setSelectedOp(op.value)
                  if (op.value === 'is_null' || op.value === 'is_not_null') {
                    addFilter({ column: selectedColumn.name, operator: op.value, value: '' })
                    onClose()
                  } else {
                    setStep('value')
                  }
                }}
                className="w-full px-3 py-1.5 text-xs text-left hover:bg-surface-hover transition-colors font-mono text-text"
              >
                {op.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step: Value */}
      {step === 'value' && selectedColumn && (
        <div className="p-3">
          <div className="text-xs text-text-muted mb-2">
            <span className="font-mono text-accent">{selectedColumn.name}</span>
            <span className="mx-1 text-text-muted">{selectedOp}</span>
          </div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type={selectedColumn.type === 'integer' || selectedColumn.type === 'float' ? 'number' : 'text'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && value && handleSubmit()}
              placeholder="Enter value..."
              className="flex-1 px-2 py-1 text-xs bg-surface border border-border rounded focus:border-accent focus:outline-none text-text font-mono placeholder:text-text-muted"
            />
            <button
              onClick={handleSubmit}
              disabled={!value}
              className="px-2 py-1 text-xs rounded bg-accent text-text-inverse font-medium disabled:opacity-40 hover:bg-accent-hover transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Toolbar ──
export function FilterToolbar() {
  const filters = useAppStore((s) => s.filters)
  const clearFilters = useAppStore((s) => s.clearFilters)
  const dataset = useAppStore((s) => s.activeDataset)
  const visibleColumns = useAppStore((s) => s.visibleColumns)
  const toggleColumn = useAppStore((s) => s.toggleColumn)
  const setVisibleColumns = useAppStore((s) => s.setVisibleColumns)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showColumnsDropdown, setShowColumnsDropdown] = useState(false)
  const columnsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setShowColumnsDropdown(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  return (
    <div className="h-9 flex items-center gap-2 px-3 border-b border-border panel-surface shrink-0">
      {/* Add filter button */}
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border border-border-strong bg-surface-elevated/40 hover:border-accent text-text-secondary hover:text-text transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="6" y1="2" x2="6" y2="10" />
            <line x1="2" y1="6" x2="10" y2="6" />
          </svg>
          Filter
        </button>
        {showDropdown && <AddFilterDropdown onClose={() => setShowDropdown(false)} />}
      </div>

      {/* Columns visibility */}
      <div className="relative" ref={columnsRef}>
        <button
          onClick={() => setShowColumnsDropdown(!showColumnsDropdown)}
          className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border border-border-strong bg-surface-elevated/40 hover:border-accent text-text-secondary hover:text-text transition-colors"
        >
          Columns
        </button>
        {showColumnsDropdown && (
          <div className="absolute top-full left-0 mt-1 w-56 gradient-border-subtle rounded-lg overflow-hidden z-50 animate-slide-down">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-border text-[10px] uppercase tracking-wider text-text-muted">
              <span>Visible Columns</span>
              <button
                onClick={() => dataset && setVisibleColumns(dataset.columns.map((c) => c.name))}
                className="text-accent hover:text-accent-hover normal-case tracking-normal"
              >
                Show all
              </button>
            </div>
            <div className="max-h-52 overflow-y-auto p-1">
              {dataset?.columns.map((col) => (
                <label
                  key={col.name}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-hover text-xs cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(col.name)}
                    onChange={() => toggleColumn(col.name)}
                  />
                  <span className={`type-badge-${col.type} px-1 py-0.5 rounded text-[10px] font-mono`}>
                    {col.type.slice(0, 3)}
                  </span>
                  <span className="truncate">{col.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Active filter pills */}
      {filters.map((f, i) => (
        <FilterPill key={`${f.column}-${f.operator}-${i}`} filter={f} index={i} />
      ))}

      {/* Clear all */}
      {filters.length > 1 && (
        <button
          onClick={clearFilters}
          className="text-[10px] text-text-muted hover:text-text transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
