import { useState, useRef, useCallback } from 'react'

interface UseResizableOptions {
  defaultWidth: number
  minWidth: number
  maxWidth: number
  onCollapse?: () => void
}

export function useResizable({ defaultWidth, minWidth, maxWidth, onCollapse }: UseResizableOptions) {
  const [width, setWidth] = useState(defaultWidth)
  const [isResizing, setIsResizing] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const lastClientXRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    startXRef.current = e.clientX
    lastClientXRef.current = e.clientX
    startWidthRef.current = width

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (ev: MouseEvent) => {
      lastClientXRef.current = ev.clientX
      const deltaX = ev.clientX - startXRef.current
      // Panels are on the right: dragging left increases width
      const newWidth = Math.min(Math.max(startWidthRef.current - deltaX, minWidth), maxWidth)
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setIsResizing(false)

      const finalWidth = startWidthRef.current - (lastClientXRef.current - startXRef.current)
      if (finalWidth < minWidth * 0.5 && onCollapse) {
        onCollapse()
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [width, minWidth, maxWidth, onCollapse])

  return { width, isResizing, handleMouseDown }
}
