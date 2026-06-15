import { useState } from 'react'
import { Modal } from './Modal'

interface TagCreateModalProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string, color: string) => void
}

const PRESET_COLORS = [
  '#c96442', // accent
  '#d97757', // coral
  '#2d7a4f', // success
  '#3898ec', // focus
  '#946b2d', // warn
  '#b53333', // error
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f59e0b', // amber
]

export function TagCreateModal({ open, onClose, onCreate }: TagCreateModalProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])

  const handleCreate = () => {
    if (name.trim()) {
      onCreate(name.trim(), color)
      setName('')
      setColor(PRESET_COLORS[0])
      onClose()
    }
  }

  const handleCancel = () => {
    setName('')
    setColor(PRESET_COLORS[0])
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      title="新建标签"
      footer={
        <>
          <button
            onClick={handleCancel}
            style={{
              padding: '8px 16px',
              background: 'var(--sand)',
              color: 'var(--fg)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border2)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--sand)'}
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            style={{
              padding: '8px 16px',
              background: name.trim() ? 'var(--accent)' : 'var(--border2)',
              color: 'var(--white)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: name.trim() ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => {
              if (name.trim()) {
                e.currentTarget.style.background = 'var(--coral)'
              }
            }}
            onMouseLeave={(e) => {
              if (name.trim()) {
                e.currentTarget.style.background = 'var(--accent)'
              }
            }}
          >
            创建
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Name Input */}
        <div>
          <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--fg)',
            marginBottom: '8px',
          }}>
            标签名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入标签名称"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--border2)',
              borderRadius: '8px',
              fontSize: '14px',
              color: 'var(--fg)',
              background: 'var(--surface)',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border2)'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                handleCreate()
              }
            }}
          />
        </div>

        {/* Color Picker */}
        <div>
          <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--fg)',
            marginBottom: '8px',
          }}>
            标签颜色
          </label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '8px',
          }}>
            {PRESET_COLORS.map((presetColor) => (
              <button
                key={presetColor}
                onClick={() => setColor(presetColor)}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  background: presetColor,
                  border: color === presetColor ? '3px solid var(--fg)' : '3px solid transparent',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  transform: color === presetColor ? 'scale(1.1)' : 'scale(1)',
                }}
                onMouseEnter={(e) => {
                  if (color !== presetColor) {
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (color !== presetColor) {
                    e.currentTarget.style.transform = 'scale(1)'
                  }
                }}
              />
            ))}
          </div>
        </div>

        {/* Preview */}
        {name.trim() && (
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--fg)',
              marginBottom: '8px',
            }}>
              预览
            </label>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: color,
              color: 'var(--white)',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
            }}>
              {name}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
