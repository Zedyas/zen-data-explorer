import { useEffect, useRef } from 'react'

interface ColumnMenuProps {
  column: string
  position: { x: number; y: number }
  onClose: () => void
  onSortAsc: () => void
  onSortDesc: () => void
  onFilter: () => void
  onHide: () => void
  onProfile: () => void
}

export function ColumnMenu({
  column,
  position,
  onClose,
  onSortAsc,
  onSortDesc,
  onFilter,
  onHide,
  onProfile,
}: ColumnMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [onClose])

  // Clamp to viewport
  const left = Math.min(position.x, window.innerWidth - 180)
  const top = Math.min(position.y, window.innerHeight - 220)

  const items = [
    { label: 'Sort ascending', icon: '↑', action: onSortAsc },
    { label: 'Sort descending', icon: '↓', action: onSortDesc },
    { label: 'Filter by column', icon: '⊞', action: onFilter },
    { label: 'Profile column', icon: '◧', action: onProfile },
    { label: 'Hide column', icon: '⊘', action: onHide },
  ]

  return (
    <div
      ref={ref}
      className="fixed z-50 w-44 gradient-border-subtle rounded-lg py-1"
      style={{ left, top }}
    >
      <div className="px-2.5 py-1 text-[10px] text-text-muted font-mono truncate border-b border-border-strong mb-1 bg-surface">
        {column}
      </div>
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            item.action()
            onClose()
          }}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text hover:bg-surface-hover/60 transition-colors text-left"
        >
          <span className="w-4 text-center text-text-muted">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  )
}
