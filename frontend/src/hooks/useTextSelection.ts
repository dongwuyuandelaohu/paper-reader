import { useEffect, useState, useCallback } from 'react'

interface SelectionRect {
  top: number
  left: number
  width: number
  height: number
}

interface TextSelection {
  text: string
  rect: SelectionRect | null
  pageNum: number | null
}

export function useTextSelection(
  containerRef: React.RefObject<HTMLElement | null>,
  onSelectionChange?: (selection: TextSelection | null) => void
) {
  const [selection, setSelection] = useState<TextSelection | null>(null)

  const clearSelection = useCallback(() => {
    setSelection(null)
    window.getSelection()?.removeAllRanges()
    onSelectionChange?.(null)
  }, [onSelectionChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseUp = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        return
      }

      const text = sel.toString().trim()
      if (!text) return

      const range = sel.getRangeAt(0)
      const rects = range.getClientRects()
      if (rects.length === 0) return

      const containerRect = container.getBoundingClientRect()

      let top = Infinity
      let left = Infinity
      let right = -Infinity
      let bottom = -Infinity

      for (let i = 0; i < rects.length; i++) {
        const r = rects[i]
        top = Math.min(top, r.top)
        left = Math.min(left, r.left)
        right = Math.max(right, r.right)
        bottom = Math.max(bottom, r.bottom)
      }

      const rect: SelectionRect = {
        top: top - containerRect.top + container.scrollTop,
        left: left - containerRect.left + container.scrollLeft,
        width: right - left,
        height: bottom - top,
      }

      let pageNum: number | null = null
      const node = range.startContainer
      const el = node.nodeType === Node.TEXT_NODE
        ? node.parentElement?.closest('[data-page-num]')
        : (node as Element).closest?.('[data-page-num]')
      if (el) {
        pageNum = parseInt(el.getAttribute('data-page-num') || '0') || null
      }

      const newSelection: TextSelection = { text, rect, pageNum }
      setSelection(newSelection)
      onSelectionChange?.(newSelection)
    }

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // 点击弹窗内部或 data-no-clear 元素时，阻止默认行为（防止选区折叠导致弹窗消失）
      if (target.closest('.selection-popup') || target.closest('.term-popup') || target.closest('[data-no-clear]')) {
        e.preventDefault()
        return
      }
    }

    const handleSelectionChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) {
        setSelection(null)
        onSelectionChange?.(null)
      }
    }

    container.addEventListener('mouseup', handleMouseUp)
    container.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('selectionchange', handleSelectionChange)

    return () => {
      container.removeEventListener('mouseup', handleMouseUp)
      container.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [containerRef, clearSelection, onSelectionChange])

  return { selection, clearSelection }
}
