import { useAppStore } from './store.ts'
import { Landing } from './components/Landing.tsx'
import { Workspace } from './components/Workspace.tsx'
import { ToastContainer } from './components/Toast.tsx'

export function App() {
  const activeDataset = useAppStore((s) => s.activeDataset)

  return (
    <>
      {activeDataset ? <Workspace /> : <Landing />}
      <ToastContainer />
    </>
  )
}
