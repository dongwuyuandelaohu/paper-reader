import { ReactNode, useEffect, useRef } from 'react'

interface ContextMenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  divider?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  open: boolean
  onClose: () => void
  items: ContextMenuItem[]
}

export function ContextMenu({ x, y, open, onClose, items }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        background: 'var(--surface)',
        borderRadius: '10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
        padding: '6px',
        minWidth: '180px',
        zIndex: 9999,
      }}
    >
      {items.map((item, index) => (
        <div key={index}>
          {item.divider && index > 0 && (
            <div style={{
              height: '1px',
              background: 'var(--border)',
              margin: '6px 0',
            }} />
          )}
          <button
            onClick={() => {
              item.onClick()
              onClose()
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              background: 'none',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              color: item.danger ? 'var(--error)' : 'var(--fg)',
              transition: 'background 0.15s',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              if (!item.danger) {
                e.currentTarget.style.background = 'var(--sand)'
              } else {
                e.currentTarget.style.background = 'var(--error-bg)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
            }}
          >
            {item.icon && (
              <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                {item.icon}
              </span>
            )}
            <span style={{ flex: 1 }}>{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  )
}
