import { useState, useRef, useCallback, useEffect } from 'react'

interface ResizableHandleProps {
  /** Current width of the panel this handle controls */
  width: number
  /** Called continuously during drag with the new width */
  onWidthChange: (newWidth: number) => void
  /** Called when user drags past the collapse threshold */
  onCollapse: () => void
  visible: boolean
  minWidth: number
  maxWidth: number
}

export function ResizableHandle({
  width,
  onWidthChange,
  onCollapse,
  visible,
  minWidth,
  maxWidth,
}: ResizableHandleProps) {
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setDragging(true)
      startXRef.current = e.clientX
      startWidthRef.current = width

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [width]
  )

  useEffect(() => {
    if (!dragging) return

    const onMove = (ev: MouseEvent) => {
      const deltaX = ev.clientX - startXRef.current
      // Panels are on the RIGHT side of the handle.
      // Drag LEFT (deltaX < 0) → panel gets WIDER → width = startWidth - deltaX (adds |deltaX|)
      // Drag RIGHT (deltaX > 0) → panel gets NARROWER → width = startWidth - deltaX (subtracts)
      const newWidth = Math.min(Math.max(startWidthRef.current - deltaX, minWidth), maxWidth)
      onWidthChange(newWidth)
    }

    const onUp = () => {
      setDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [dragging, minWidth, maxWidth, onWidthChange])

  // Check collapse after width changes during drag
  useEffect(() => {
    if (dragging && width < minWidth * 0.5) {
      setDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onCollapse()
    }
  }, [dragging, width, minWidth, onCollapse])

  if (!visible) return null

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (!dragging) setHovered(false) }}
      style={{
        width: 12,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        cursor: 'col-resize',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: (hovered || dragging) ? 6 : 4,
          background: (hovered || dragging) ? 'var(--accent)' : 'var(--border)',
          transition: dragging ? 'none' : 'width 150ms, background 150ms',
          height: '100%',
          borderRadius: 2,
        }}
      />
    </div>
  )
}
