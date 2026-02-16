import { useEffect, useState, useCallback } from 'react'

interface ToastMessage {
  id: number
  text: string
  type: 'error' | 'success' | 'info'
}

let toastId = 0
let addToastFn: ((text: string, type: ToastMessage['type']) => void) | null = null

export function showToast(text: string, type: ToastMessage['type'] = 'error') {
  addToastFn?.(text, type)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((text: string, type: ToastMessage['type']) => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, text, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  useEffect(() => {
    addToastFn = addToast
    return () => { addToastFn = null }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-12 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-3 py-2 rounded-lg border text-xs font-mono animate-[fadeIn_0.2s_ease-out] ${
            toast.type === 'error'
              ? 'bg-error/10 border-error/30 text-error'
              : toast.type === 'success'
              ? 'bg-success/10 border-success/30 text-success'
              : 'bg-accent/10 border-accent/30 text-accent'
          }`}
        >
          {toast.text}
        </div>
      ))}
    </div>
  )
}
