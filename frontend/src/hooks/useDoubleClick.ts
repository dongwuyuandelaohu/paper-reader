import { useEffect, useState, useCallback } from 'react'

interface DoubleClickResult {
  word: string
  rect: { top: number; left: number }
}

export function useDoubleClick(
  containerRef: React.RefObject<HTMLElement | null>,
  onDoubleClick?: (result: DoubleClickResult) => void
) {
  const [result, setResult] = useState<DoubleClickResult | null>(null)

  const clearResult = useCallback(() => {
    setResult(null)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleDoubleClick = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return

      const text = selection.toString().trim()
      if (!text) return

      // 只处理单个单词（不包含空格）
      if (text.includes(' ') || text.length > 50) return

      const range = selection.getRangeAt(0)
      const rects = range.getClientRects()
      if (rects.length === 0) return

      const containerRect = container.getBoundingClientRect()
      const firstRect = rects[0]

      const clickResult: DoubleClickResult = {
        word: text,
        rect: {
          top: firstRect.top - containerRect.top + container.scrollTop,
          left: firstRect.left - containerRect.left + container.scrollLeft,
        },
      }

      setResult(clickResult)
      onDoubleClick?.(clickResult)
    }

    const handleClick = (e: MouseEvent) => {
      // 点击非弹窗区域时清除
      const target = e.target as HTMLElement
      if (!target.closest('.term-popup')) {
        clearResult()
      }
    }

    container.addEventListener('dblclick', handleDoubleClick)
    container.addEventListener('click', handleClick)

    return () => {
      container.removeEventListener('dblclick', handleDoubleClick)
      container.removeEventListener('click', handleClick)
    }
  }, [containerRef, clearResult, onDoubleClick])

  return { result, clearResult }
}
