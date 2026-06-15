import { useState, useRef, useEffect } from 'react'
import type { AIModel } from '@/api/types'

interface ModelSelectorProps {
  models: AIModel[]
  activeModelId: string | null
  onSelect: (modelId: string) => void
}

export function ModelSelector({ models, activeModelId, onSelect }: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const activeModel = models.find((m) => m.id === activeModelId)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          fontSize: '11px',
          padding: '3px 10px',
          color: 'var(--fg)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <span>{activeModel?.name ?? '选择模型'}</span>
        <span style={{ fontSize: '10px', color: 'var(--muted)' }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            minWidth: '180px',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          {models.map((model) => {
            const isActive = model.id === activeModelId
            return (
              <button
                key={model.id}
                onClick={() => {
                  onSelect(model.id)
                  setOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  background: isActive ? 'var(--surface3)' : 'transparent',
                  color: isActive ? 'var(--fg)' : 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--surface3)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {model.name}
                </span>
                {model.is_verified && (
                  <span style={{ fontSize: '11px', color: 'var(--success)' }} title="已验证">✓</span>
                )}
                {model.supports_vision && (
                  <span style={{ fontSize: '11px' }} title="支持图片理解">👁</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
