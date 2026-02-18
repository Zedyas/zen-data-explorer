import { useAppStore } from '../store.ts'
import { TopBar } from './TopBar.tsx'
import { Sidebar } from './Sidebar.tsx'
import { FilterToolbar } from './FilterToolbar.tsx'
import { DataTable } from './DataTable.tsx'
import { CellCanvas } from './CellCanvas.tsx'
import { StatusBar } from './StatusBar.tsx'

export function Workspace() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const workspaceTab = useAppStore((s) => s.workspaceTab)

  return (
    <div className="h-screen flex flex-col bg-bg overflow-hidden">
      <TopBar />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          className={`h-full shrink-0 overflow-hidden will-change-[width,opacity] transition-[width,opacity] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            sidebarOpen ? 'w-64 opacity-100' : 'w-0 opacity-0'
          }`}
        >
          <Sidebar />
        </div>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
            {workspaceTab === 'overview' ? (
              <div id="overview-view" className="min-h-0 flex flex-col flex-1 animate-fade-in">
                <FilterToolbar />
                <DataTable />
              </div>
            ) : (
              <div className="min-h-0 flex flex-col flex-1 animate-fade-in">
                <CellCanvas />
              </div>
            )}
          </div>
        </div>
      </div>

      <StatusBar />
    </div>
  )
}
