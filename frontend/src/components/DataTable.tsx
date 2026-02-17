import { useMemo, useRef, useState, useCallback } from 'react'
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
import type { Column } from '../types.ts'

const ROW_HEIGHT = 28

export function DataTable() {
  const dataset = useAppStore((s) => s.activeDataset)
  const filters = useAppStore((s) => s.filters)
  const sort = useAppStore((s) => s.sort)
  const setSortDirect = useAppStore((s) => s.setSortDirect)
  const page = useAppStore((s) => s.page)
  const pageSize = useAppStore((s) => s.pageSize)
  const cursor = useAppStore((s) => s.cursor)
  const goNextPage = useAppStore((s) => s.goNextPage)
  const goPrevPage = useAppStore((s) => s.goPrevPage)
  const visibleColumns = useAppStore((s) => s.visibleColumns)
  const toggleColumn = useAppStore((s) => s.toggleColumn)
  const addFilter = useAppStore((s) => s.addFilter)
  const setProfileColumn = useAppStore((s) => s.setProfileColumn)

  const [profileAnchor, setProfileAnchor] = useState<DOMRect | null>(null)
  const [contextMenu, setContextMenu] = useState<{ column: string; x: number; y: number } | null>(null)

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
      header: '#',
      size: 56,
      minSize: 56,
      maxSize: 56,
      cell: ({ row }) => (
        <span className="text-[10px] text-text-secondary/90 font-mono">
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

  if (!dataset) return null

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Table container */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <table className="w-full border-collapse" style={{ minWidth: '100%' }}>
          {/* Header */}
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="panel-surface-elevated border-b border-border-strong">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    data-col={header.column.id}
                    className="relative px-3 py-2 text-left align-top table-col-sep last:border-r-0"
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
                  className="border-b border-border/70 hover:bg-surface-hover/60 transition-colors"
                  style={{ height: ROW_HEIGHT }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-0 table-col-sep last:border-r-0 overflow-hidden"
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

        {isLoading && (
          <div className="flex items-center justify-center py-20 text-sm text-text-muted">
            Loading data...
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="flex items-center justify-center py-20 text-sm text-text-muted">
            No data to display
          </div>
        )}
      </div>

      {/* Pagination bar */}
      <div className="h-8 flex items-center justify-between px-3 border-t border-border-strong panel-surface-elevated shrink-0 text-xs">
        <div className="text-text-muted">
          <span>
            Showing <span className="font-mono text-text-secondary">{rows.length.toLocaleString()}</span>
            {' / '}
            <span className="font-mono text-text-secondary">{filteredRows.toLocaleString()}</span> rows
          </span>
          {filteredRows !== totalRows && (
            <span>
              {' '}(<span className="font-mono text-text-secondary">{totalRows.toLocaleString()}</span> total)
            </span>
          )}
          {isFetching && !isLoading && (
            <span className="ml-2 text-accent">updating...</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={page === 0}
            onClick={goPrevPage}
            className="px-2 py-0.5 rounded border border-border-strong bg-surface hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed text-text-secondary hover:text-text transition-colors"
          >
            ←
          </button>
          <span className="font-mono text-text-secondary">
            {page + 1} / {totalPages || 1}
          </span>
          <button
            disabled={!pageData?.nextCursor}
            onClick={() => goNextPage(pageData?.nextCursor ?? null)}
            className="px-2 py-0.5 rounded border border-border-strong bg-surface hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed text-text-secondary hover:text-text transition-colors"
          >
            →
          </button>
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
