import { useAppStore } from '../store.ts'
import { TopBar } from './TopBar.tsx'
import { Sidebar } from './Sidebar.tsx'
import { FilterToolbar } from './FilterToolbar.tsx'
import { DataTable } from './DataTable.tsx'
import { CellCanvas } from './CellCanvas.tsx'
import { StatusBar } from './StatusBar.tsx'
import { MetricsBar } from './MetricsBar.tsx'

export function Workspace() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const workspaceTab = useAppStore((s) => s.workspaceTab)

  return (
    <div className="h-screen flex flex-col bg-bg overflow-hidden">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        {sidebarOpen && <Sidebar />}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <MetricsBar />
          {workspaceTab === 'overview' ? (
            <div id="overview-view" className="min-h-0 flex flex-col flex-1">
              <FilterToolbar />
              <DataTable />
            </div>
          ) : (
            <CellCanvas />
          )}
        </div>
      </div>
      <StatusBar />
    </div>
  )
}
