import { create } from 'zustand'
import type {
  CellType,
  Column,
  Dataset,
  Filter,
  InvestigationCell,
  TableQuerySpec,
  WorkspaceTab,
} from './types.ts'

let cellIdCounter = 0

function defaultTableSpec(): TableQuerySpec {
  return {
    filters: [],
    groupBy: [],
    aggregations: [],
    having: [],
    sort: [],
    limit: 200,
  }
}

function resetOverviewState(dataset: Dataset | null) {
  return {
    activeDataset: dataset,
    filters: [],
    sort: null,
    page: 0,
    cursor: null,
    cursorStack: [] as (string | null)[],
    visibleColumns: dataset?.columns.map((c: Column) => c.name) ?? [],
    profileColumn: null,
    workspaceTab: 'overview' as WorkspaceTab,
  }
}

interface AppState {
  datasets: Dataset[]
  activeDataset: Dataset | null
  setActiveDataset: (dataset: Dataset | null) => void
  switchDataset: (datasetId: string) => void
  removeDataset: (datasetId: string) => void

  filters: Filter[]
  addFilter: (filter: Filter) => void
  removeFilter: (index: number) => void
  clearFilters: () => void

  sort: { column: string; direction: 'asc' | 'desc' } | null
  setSort: (column: string) => void
  setSortDirect: (column: string, direction: 'asc' | 'desc') => void

  page: number
  pageSize: number
  cursor: string | null
  cursorStack: (string | null)[]
  goNextPage: (nextCursor: string | null) => void
  goPrevPage: () => void
  resetPagination: () => void

  visibleColumns: string[]
  setVisibleColumns: (columns: string[]) => void
  toggleColumn: (column: string) => void

  sidebarOpen: boolean
  toggleSidebar: () => void

  workspaceTab: WorkspaceTab
  setWorkspaceTab: (tab: WorkspaceTab) => void

  columnStats: Map<string, { nullPercent: number; sparkline: number[] }>
  setColumnStats: (stats: Map<string, { nullPercent: number; sparkline: number[] }>) => void

  profileColumn: string | null
  setProfileColumn: (column: string | null) => void

  cells: InvestigationCell[]
  activeCellId: string | null
  setActiveCell: (id: string | null) => void
  addCell: (type: CellType) => void
  updateCell: (id: string, updates: Partial<InvestigationCell>) => void
  removeCell: (id: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  datasets: [],
  activeDataset: null,
  setActiveDataset: (dataset) =>
    set((s) => {
      if (!dataset) return resetOverviewState(null)
      const existing = s.datasets.find((d) => d.id === dataset.id)
      const datasets = existing
        ? s.datasets.map((d) => (d.id === dataset.id ? dataset : d))
        : [...s.datasets, dataset]
      return {
        datasets,
        ...resetOverviewState(dataset),
      }
    }),
  switchDataset: (datasetId) =>
    set((s) => {
      const dataset = s.datasets.find((d) => d.id === datasetId) ?? null
      if (!dataset) return s
      return resetOverviewState(dataset)
    }),
  removeDataset: (datasetId) =>
    set((s) => {
      const datasets = s.datasets.filter((d) => d.id !== datasetId)
      const remainingCells = s.cells.filter((c) => c.datasetId !== datasetId)
      const validCellIds = new Set(remainingCells.map((c) => c.id))
      const sanitizedCells = remainingCells.map((c) => {
        if (c.type !== 'compare' || !c.compare) return c
        return {
          ...c,
          compare: {
            leftCellId: c.compare.leftCellId && validCellIds.has(c.compare.leftCellId) ? c.compare.leftCellId : null,
            rightCellId: c.compare.rightCellId && validCellIds.has(c.compare.rightCellId) ? c.compare.rightCellId : null,
          },
        }
      })

      const activeDataset = s.activeDataset?.id === datasetId
        ? (datasets[0] ?? null)
        : s.activeDataset

      const base = resetOverviewState(activeDataset)
      return {
        datasets,
        ...base,
        cells: sanitizedCells,
        activeCellId: sanitizedCells.some((c) => c.id === s.activeCellId)
          ? s.activeCellId
          : sanitizedCells.at(-1)?.id ?? null,
      }
    }),

  filters: [],
  addFilter: (filter) =>
    set((s) => ({
      filters: [...s.filters, filter],
      page: 0,
      cursor: null,
      cursorStack: [],
    })),
  removeFilter: (index) =>
    set((s) => ({
      filters: s.filters.filter((_, i) => i !== index),
      page: 0,
      cursor: null,
      cursorStack: [],
    })),
  clearFilters: () => set({ filters: [], page: 0, cursor: null, cursorStack: [] }),

  sort: null,
  setSort: (column) =>
    set((s) => {
      if (s.sort?.column === column) {
        if (s.sort.direction === 'asc') {
          return { sort: { column, direction: 'desc' }, page: 0, cursor: null, cursorStack: [] }
        }
        return { sort: null, page: 0, cursor: null, cursorStack: [] }
      }
      return { sort: { column, direction: 'asc' }, page: 0, cursor: null, cursorStack: [] }
    }),
  setSortDirect: (column, direction) =>
    set({ sort: { column, direction }, page: 0, cursor: null, cursorStack: [] }),

  page: 0,
  pageSize: 200,
  cursor: null,
  cursorStack: [],
  goNextPage: (nextCursor) =>
    set((s) => {
      if (!nextCursor) return s
      return {
        page: s.page + 1,
        cursor: nextCursor,
        cursorStack: [...s.cursorStack, s.cursor],
      }
    }),
  goPrevPage: () =>
    set((s) => {
      if (s.page === 0 || s.cursorStack.length === 0) return s
      const nextStack = s.cursorStack.slice(0, -1)
      const prevCursor = s.cursorStack[s.cursorStack.length - 1] ?? null
      return {
        page: Math.max(0, s.page - 1),
        cursor: prevCursor,
        cursorStack: nextStack,
      }
    }),
  resetPagination: () => set({ page: 0, cursor: null, cursorStack: [] }),

  visibleColumns: [],
  setVisibleColumns: (columns) => set({ visibleColumns: columns }),
  toggleColumn: (column) =>
    set((s) => ({
      visibleColumns: s.visibleColumns.includes(column)
        ? s.visibleColumns.filter((c) => c !== column)
        : [...s.visibleColumns, column],
    })),

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  workspaceTab: 'overview',
  setWorkspaceTab: (tab) => set({ workspaceTab: tab }),

  columnStats: new Map(),
  setColumnStats: (stats) => set({ columnStats: stats }),

  profileColumn: null,
  setProfileColumn: (column) => set((s) => ({ profileColumn: s.profileColumn === column ? null : column })),

  cells: [],
  activeCellId: null,
  setActiveCell: (id) => set({ activeCellId: id }),
  addCell: (type) =>
    set((s) => {
      const activeDataset = s.activeDataset
      const baseSpec: TableQuerySpec = {
        filters: s.filters,
        groupBy: [],
        aggregations: [],
        having: [],
        sort: s.sort ? [s.sort] : [],
        limit: s.pageSize,
      }

      const firstTableCell =
        type === 'table' &&
        !!activeDataset &&
        s.cells.filter((c) => c.type === 'table' && c.datasetId === activeDataset.id).length === 0
      const id = `${type}_${++cellIdCounter}_${Date.now()}`
      const cell: InvestigationCell = {
        id,
        type,
        title:
          type === 'table'
            ? `Table ${s.cells.length + 1}`
            : type === 'sql'
              ? `SQL ${s.cells.length + 1}`
              : type === 'python'
                ? `Python ${s.cells.length + 1}`
                : `Compare ${s.cells.length + 1}`,
        datasetId: type === 'table' || type === 'sql' || type === 'python' ? activeDataset?.id : undefined,
        tableSpec: type === 'table' ? (firstTableCell ? baseSpec : defaultTableSpec()) : undefined,
        sql: type === 'sql' ? 'SELECT * FROM data LIMIT 50' : undefined,
        python: type === 'python' ? 'df.head(50)' : undefined,
        compare: type === 'compare' ? { leftCellId: null, rightCellId: null } : undefined,
        autoRun: type === 'table' ? firstTableCell : false,
        result: null,
        error: null,
        isRunning: false,
      }

      return {
        cells: [...s.cells, cell],
        activeCellId: id,
        workspaceTab: 'dynamic',
      }
    }),
  updateCell: (id, updates) =>
    set((s) => ({
      cells: s.cells.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
  removeCell: (id) =>
    set((s) => {
      const next = s.cells.filter((c) => c.id !== id)
      const valid = new Set(next.map((c) => c.id))
      const sanitized = next.map((c) => {
        if (c.type !== 'compare' || !c.compare) return c
        return {
          ...c,
          compare: {
            leftCellId: c.compare.leftCellId && valid.has(c.compare.leftCellId) ? c.compare.leftCellId : null,
            rightCellId: c.compare.rightCellId && valid.has(c.compare.rightCellId) ? c.compare.rightCellId : null,
          },
        }
      })
      return {
        cells: sanitized,
        activeCellId: s.activeCellId === id ? sanitized.at(-1)?.id ?? null : s.activeCellId,
      }
    }),
}))
