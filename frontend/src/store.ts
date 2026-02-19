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

function buildCompareState(datasetId: string | undefined, datasets: Dataset[]) {
  const left = datasetId ?? datasets[0]?.id ?? null
  const right = datasets.find((d) => d.id !== left)?.id ?? left
  return {
    leftDatasetId: left,
    rightDatasetId: right,
    leftSpec: defaultTableSpec(),
    rightSpec: defaultTableSpec(),
    leftResult: null,
    rightResult: null,
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
  setPaginationState: (page: number, cursor: string | null, cursorStack: (string | null)[]) => void
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

function latestCellIdForDataset(cells: InvestigationCell[], datasetId: string | undefined): string | null {
  if (!datasetId) return null
  const scoped = cells.filter((c) => c.datasetId === datasetId)
  return scoped.at(-1)?.id ?? null
}

export const useAppStore = create<AppState>((set) => ({
  datasets: [],
  activeDataset: null,
  setActiveDataset: (dataset) =>
    set((s) => {
      if (!dataset) {
        return {
          ...resetOverviewState(null),
          activeCellId: null,
        }
      }
      const existing = s.datasets.find((d) => d.id === dataset.id)
      const datasets = existing
        ? s.datasets.map((d) => (d.id === dataset.id ? dataset : d))
        : [...s.datasets, dataset]
      return {
        datasets,
        ...resetOverviewState(dataset),
        activeCellId: latestCellIdForDataset(s.cells, dataset.id),
      }
    }),
  switchDataset: (datasetId) =>
    set((s) => {
      const dataset = s.datasets.find((d) => d.id === datasetId) ?? null
      if (!dataset) return s
      return {
        ...resetOverviewState(dataset),
        activeCellId: latestCellIdForDataset(s.cells, dataset.id),
      }
    }),
  removeDataset: (datasetId) =>
    set((s) => {
      const datasets = s.datasets.filter((d) => d.id !== datasetId)
      const remainingCells = s.cells.filter((c) => c.datasetId !== datasetId)
      const sanitizedCells = remainingCells.map((c) => {
        if (c.type !== 'compare' || !c.compare) return c
        const leftDatasetId = c.compare.leftDatasetId === datasetId ? null : c.compare.leftDatasetId
        const rightDatasetId = c.compare.rightDatasetId === datasetId ? null : c.compare.rightDatasetId
        return {
          ...c,
          compare: {
            ...c.compare,
            leftDatasetId,
            rightDatasetId,
            leftResult: leftDatasetId ? c.compare.leftResult : null,
            rightResult: rightDatasetId ? c.compare.rightResult : null,
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
        activeCellId: latestCellIdForDataset(sanitizedCells, activeDataset?.id),
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
  setPaginationState: (page, cursor, cursorStack) =>
    set({ page: Math.max(0, page), cursor, cursorStack }),
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
            : type === 'code'
              ? `Code ${s.cells.length + 1}`
              : `Compare ${s.cells.length + 1}`,
        datasetId: activeDataset?.id,
        tableSpec: type === 'table' ? (firstTableCell ? baseSpec : defaultTableSpec()) : undefined,
        codeLanguage: type === 'code' ? 'sql' : undefined,
        code: type === 'code' ? 'SELECT * FROM data LIMIT 50' : undefined,
        codeSql: type === 'code' ? 'SELECT * FROM data LIMIT 50' : undefined,
        codePython: type === 'code' ? 'df.head(50)' : undefined,
        compare: type === 'compare' ? buildCompareState(activeDataset?.id, s.datasets) : undefined,
        autoRun: type === 'table' ? firstTableCell : false,
        result: null,
        textOutput: null,
        error: null,
        isRunning: false,
      }

      return {
        cells: [...s.cells, cell],
        activeCellId: id,
        workspaceTab: 'notebook',
      }
    }),
  updateCell: (id, updates) =>
    set((s) => ({
      cells: s.cells.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
  removeCell: (id) =>
    set((s) => {
      const next = s.cells.filter((c) => c.id !== id)
      const sanitized = next.map((c) => {
        return c
      })
      return {
        cells: sanitized,
        activeCellId: s.activeCellId === id ? sanitized.at(-1)?.id ?? null : s.activeCellId,
      }
    }),
}))
