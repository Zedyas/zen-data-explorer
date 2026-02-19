import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAppStore } from '../store.ts'
import { useDatasetPage } from '../api.ts'
import { ColumnHeader } from './ColumnHeader.tsx'
import { ProfilePopover } from './ProfilePopover.tsx'
import { ColumnMenu } from './ColumnMenu.tsx'
import type { Column, PageResponse } from '../types.ts'

const ROW_HEIGHT = 34

export function DataTable() {
  const dataset = useAppStore((s) => s.activeDataset)
  const filters = useAppStore((s) => s.filters)
  const sort = useAppStore((s) => s.sort)
  const setSortDirect = useAppStore((s) => s.setSortDirect)
  const page = useAppStore((s) => s.page)
  const pageSize = useAppStore((s) => s.pageSize)
  const cursor = useAppStore((s) => s.cursor)
  const cursorStack = useAppStore((s) => s.cursorStack)
  const goNextPage = useAppStore((s) => s.goNextPage)
  const goPrevPage = useAppStore((s) => s.goPrevPage)
  const setPaginationState = useAppStore((s) => s.setPaginationState)
  const visibleColumns = useAppStore((s) => s.visibleColumns)
  const toggleColumn = useAppStore((s) => s.toggleColumn)
  const addFilter = useAppStore((s) => s.addFilter)
  const setProfileColumn = useAppStore((s) => s.setProfileColumn)

  const [profileAnchor, setProfileAnchor] = useState<DOMRect | null>(null)
  const [contextMenu, setContextMenu] = useState<{ column: string; x: number; y: number } | null>(null)
  const [jumpInput, setJumpInput] = useState('1')
  const [isJumping, setIsJumping] = useState(false)

  useEffect(() => {
    setJumpInput(String(page + 1))
  }, [page])

  const { data: pageData, isLoading, isFetching } = useDatasetPage(
    dataset
      ? { datasetId: dataset.id, pageSize, cursor, sort, filters }
      : null,
  )

  const parentRef = useRef<HTMLDivElement>(null)

  const handleProfileClick = useCallback(
    (colName: string, e: React.MouseEvent) => {
      e.stopPropagation()
      const rect = (e.currentTarget as HTMLElement).closest('th')?.getBoundingClientRect()
      if (rect) {
        setProfileAnchor(rect)
        setProfileColumn(colName)
      }
    },
    [setProfileColumn],
  )

  const sparklineByColumn = useMemo(() => {
    if (!dataset) return new Map<string, number[]>()

    const map = new Map<string, number[]>()
    for (const col of dataset.columns) {
      const values = Array.isArray(col.sparkline) ? col.sparkline : []
      map.set(col.name, values)
    }
    return map
  }, [dataset])

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (!dataset) return []

    const rowNumCol: ColumnDef<Record<string, unknown>> = {
      id: '_rownum',
      header: () => <span className="text-[11px] font-mono text-text-muted">#</span>,
      size: 64,
      minSize: 64,
      maxSize: 64,
      cell: ({ row }) => (
        <span className="text-[10px] text-text-muted font-mono">
          {page * pageSize + row.index + 1}
        </span>
      ),
    }

    const dataCols: ColumnDef<Record<string, unknown>>[] = dataset.columns
      .filter((col: Column) => visibleColumns.includes(col.name))
      .map((col: Column) => ({
        id: col.name,
        accessorKey: col.name,
        header: () => (
          <ColumnHeader
            column={col}
            sparkline={sparklineByColumn.get(col.name)}
            onProfileClick={(e) => handleProfileClick(col.name, e)}
          />
        ),
        size: getColumnWidth(col),
        minSize: 80,
        cell: ({ getValue }) => {
          const val = getValue()
          if (val === null || val === undefined) {
            return <span className="text-text-muted/40 italic">null</span>
          }
          return (
            <span className="font-mono text-xs truncate block">
              {formatCellValue(val, col.type)}
            </span>
          )
        },
      }))

    return [rowNumCol, ...dataCols]
  }, [dataset, visibleColumns, page, pageSize, sparklineByColumn, handleProfileClick])

  const rows = pageData?.rows ?? []

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: pageData?.totalPages ?? 0,
  })

  const tableRows = table.getRowModel().rows

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  const totalPages = pageData?.totalPages ?? 0
  const filteredRows = pageData?.filteredRows ?? dataset?.rowCount ?? 0
  const totalRows = pageData?.totalRows ?? dataset?.rowCount ?? 0
  const shownRows = filteredRows > 0 ? Math.min(page * pageSize + rows.length, filteredRows) : 0

  const fetchPageByCursor = useCallback(async (cursorToken: string | null): Promise<PageResponse> => {
    if (!dataset) throw new Error('No active dataset')
    const searchParams = new URLSearchParams()
    searchParams.set('page_size', String(pageSize))
    if (cursorToken) searchParams.set('cursor', cursorToken)
    if (sort) {
      searchParams.set('sort_column', sort.column)
      searchParams.set('sort_direction', sort.direction)
    }
    if (filters.length > 0) searchParams.set('filters', JSON.stringify(filters))

    const res = await fetch(`/api/datasets/${dataset.id}/page?${searchParams.toString()}`)
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }, [dataset, pageSize, sort, filters])

  const jumpToPage = useCallback(async () => {
    if (!dataset) return
    const parsed = Number.parseInt(jumpInput, 10)
    if (!Number.isFinite(parsed)) return
    const targetPage = Math.max(0, Math.min(Math.max(1, totalPages || 1) - 1, parsed - 1))
    if (targetPage === page) return

    if (targetPage < page) {
      const nextCursor = targetPage === 0 ? null : (cursorStack[targetPage] ?? null)
      const nextStack = cursorStack.slice(0, targetPage)
      setPaginationState(targetPage, nextCursor, nextStack)
      return
    }

    setIsJumping(true)
    try {
      let nextPage = page
      let nextCursor = cursor
      const nextStack = [...cursorStack]
      const remaining = targetPage - page
      const maxHop = Math.min(remaining, 25)

      for (let i = 0; i < maxHop; i += 1) {
        const data = await fetchPageByCursor(nextCursor)
        if (!data.nextCursor) break
        nextStack.push(nextCursor)
        nextCursor = data.nextCursor
        nextPage += 1
      }

      setPaginationState(nextPage, nextCursor, nextStack)
    } finally {
      setIsJumping(false)
    }
  }, [dataset, jumpInput, totalPages, page, cursorStack, setPaginationState, cursor, fetchPageByCursor])

  if (!dataset) return null

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Table container */}
      <div ref={parentRef} className="flex-1 overflow-auto relative">
        <table className="w-full border-collapse" style={{ minWidth: '100%' }}>
          {/* Header */}
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-bg border-b border-border">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    data-col={header.column.id}
                    className="relative px-3 py-2 text-left align-top"
                    style={{ width: header.getSize() }}
                    onContextMenu={(e) => {
                      const colId = header.column.id
                      if (colId === '_rownum') return
                      e.preventDefault()
                      setContextMenu({ column: colId, x: e.clientX, y: e.clientY })
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none touch-none hover:bg-accent/50"
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          {/* Body */}
          <tbody>
            {virtualizer.getVirtualItems().length > 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ height: virtualizer.getVirtualItems()[0]?.start ?? 0, padding: 0, border: 'none' }}
                />
              </tr>
            )}

            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = tableRows[virtualRow.index]
              if (!row) return null
              return (
                <tr
                  key={row.id}
                  className="border-b border-border hover:bg-surface-hover/40 transition-colors"
                  style={{ height: ROW_HEIGHT }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-0 overflow-hidden"
                      style={{ width: cell.column.getSize(), maxWidth: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}

            {virtualizer.getVirtualItems().length > 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    height:
                      virtualizer.getTotalSize() -
                      (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
                    padding: 0,
                    border: 'none',
                  }}
                />
              </tr>
            )}
          </tbody>
        </table>

        {isLoading && !pageData && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted bg-bg/60 pointer-events-none">
            Loading data...
          </div>
        )}

        {!isLoading && !isFetching && rows.length === 0 && (
          <div className="flex items-center justify-center py-20 text-sm text-text-muted">
            No data to display
          </div>
        )}
      </div>

      {/* Pagination bar */}
      <div className="h-9 flex items-center justify-between px-3 border-t border-border bg-surface shrink-0 text-xs">
        <div className="flex items-center gap-2 font-mono text-text-secondary">
          <button
            disabled={page === 0}
            onClick={goPrevPage}
            className="h-6 px-2 border border-border bg-bg hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed text-text-secondary hover:text-text transition-colors"
          >
            {'<'}
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={jumpInput}
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/\D/g, '')
              setJumpInput(digitsOnly)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void jumpToPage()
            }}
            onBlur={() => {
              void jumpToPage()
            }}
            disabled={isJumping}
            className="h-6 w-12 px-1 border border-border bg-bg text-[11px] text-text-secondary text-center disabled:opacity-40"
          />
          <button
            disabled={!pageData?.nextCursor || isJumping}
            onClick={() => goNextPage(pageData?.nextCursor ?? null)}
            className="h-6 px-2 border border-border bg-bg hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed text-text-secondary hover:text-text transition-colors"
          >
            {'>'}
          </button>
          <span className="text-text-muted">/ {totalPages || 1}</span>
        </div>

        <div className="text-text-muted font-mono">
          <span>{shownRows.toLocaleString()} / {filteredRows.toLocaleString()} rows</span>
          {filteredRows !== totalRows && <span> ({totalRows.toLocaleString()} total)</span>}
          <span className="inline-block min-w-[64px] ml-2 text-right text-accent">
            {isLoading ? 'loading' : isFetching ? 'updating' : ''}
          </span>
        </div>
      </div>

      {/* Profile popover */}
      <ProfilePopover anchorRect={profileAnchor} />

      {/* Column context menu */}
      {contextMenu && (
        <ColumnMenu
          column={contextMenu.column}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onSortAsc={() => setSortDirect(contextMenu.column, 'asc')}
          onSortDesc={() => setSortDirect(contextMenu.column, 'desc')}
          onFilter={() => {
            addFilter({ column: contextMenu.column, operator: 'is_null', value: '' })
          }}
          onHide={() => toggleColumn(contextMenu.column)}
          onProfile={() => {
            setProfileColumn(contextMenu.column)
            // Get the th element for anchor position
            const th = document.querySelector(`th[data-col="${contextMenu.column}"]`)
            if (th) setProfileAnchor(th.getBoundingClientRect())
          }}
        />
      )}
    </div>
  )
}

// ── Helpers ──

function getColumnWidth(col: Column): number {
  if (col.type === 'boolean') return 80
  if (col.type === 'integer' || col.type === 'float') return 120
  if (col.type === 'date') return 140
  return 160
}

function formatCellValue(val: unknown, type: string): string {
  if (typeof val === 'number') {
    if (type === 'float') return val.toLocaleString(undefined, { maximumFractionDigits: 4 })
    return val.toLocaleString()
  }
  return String(val)
}
