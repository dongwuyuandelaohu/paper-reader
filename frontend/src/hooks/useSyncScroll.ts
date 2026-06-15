import { useEffect, useRef, useCallback } from 'react'

interface UseSyncScrollOptions {
  enabled: boolean
  leftRef: React.RefObject<HTMLElement | null>
  rightRef: React.RefObject<HTMLElement | null>
  totalPages: number
  currentPage: number
  onPageChange: (page: number) => void
}

export function useSyncScroll({
  enabled,
  leftRef,
  rightRef,
  totalPages,
  currentPage,
  onPageChange,
}: UseSyncScrollOptions) {
  const isSyncingRef = useRef(false)
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedPageRef = useRef(0)

  const getPageScrollRatio = useCallback((container: HTMLElement) => {
    const { scrollTop, scrollHeight, clientHeight } = container
    const maxScroll = scrollHeight - clientHeight
    if (maxScroll <= 0) return 0
    return scrollTop / maxScroll
  }, [])

  const setScrollByRatio = useCallback((container: HTMLElement, ratio: number) => {
    const { scrollHeight, clientHeight } = container
    const maxScroll = scrollHeight - clientHeight
    if (maxScroll <= 0) return
    container.scrollTop = ratio * maxScroll
  }, [])

  // 同步模式：只监听 PDF（左）滚动，单向同步到翻译（右）
  useEffect(() => {
    if (!enabled) return

    const leftEl = leftRef.current
    const rightEl = rightRef.current
    if (!leftEl || !rightEl) return

    const handleLeftScroll = () => {
      if (isSyncingRef.current) return

      isSyncingRef.current = true
      const ratio = getPageScrollRatio(leftEl)
      setScrollByRatio(rightEl, ratio)

      const estimatedPage = Math.max(1, Math.ceil(ratio * totalPages))
      if (estimatedPage !== currentPage) {
        lastSyncedPageRef.current = estimatedPage
        onPageChange(estimatedPage)
      }

      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
      syncTimeoutRef.current = setTimeout(() => {
        isSyncingRef.current = false
      }, 80)
    }

    leftEl.addEventListener('scroll', handleLeftScroll, { passive: true })

    return () => {
      leftEl.removeEventListener('scroll', handleLeftScroll)
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
    }
  }, [enabled, leftRef, rightRef, totalPages, currentPage, onPageChange, getPageScrollRatio, setScrollByRatio])

  // 非同步模式：翻译面板滚动时更新页码
  useEffect(() => {
    if (enabled) return

    const rightEl = rightRef.current
    if (!rightEl) return

    let ticking = false
    const handleRightScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const pageElements = rightEl.querySelectorAll('[data-page-num]')
        const containerRect = rightEl.getBoundingClientRect()
        const containerCenter = containerRect.top + containerRect.height / 2

        let closestPage = 1
        let closestDistance = Infinity

        pageElements.forEach(el => {
          const rect = el.getBoundingClientRect()
          const elCenter = rect.top + rect.height / 2
          const distance = Math.abs(elCenter - containerCenter)
          if (distance < closestDistance) {
            closestDistance = distance
            closestPage = parseInt(el.getAttribute('data-page-num') || '1')
          }
        })

        if (closestPage !== currentPage) {
          onPageChange(closestPage)
        }
        ticking = false
      })
    }

    rightEl.addEventListener('scroll', handleRightScroll, { passive: true })
    return () => rightEl.removeEventListener('scroll', handleRightScroll)
  }, [enabled, rightRef, currentPage, onPageChange])

  // 页码变化时同步滚动（仅同步模式）
  useEffect(() => {
    if (!enabled) return
    if (currentPage === lastSyncedPageRef.current) return

    const leftEl = leftRef.current
    const rightEl = rightRef.current
    if (!leftEl || !rightEl) return

    isSyncingRef.current = true
    const ratio = (currentPage - 1) / Math.max(1, totalPages - 1)
    setScrollByRatio(leftEl, ratio)
    setScrollByRatio(rightEl, ratio)
    lastSyncedPageRef.current = currentPage

    setTimeout(() => {
      isSyncingRef.current = false
    }, 100)
  }, [enabled, currentPage, leftRef, rightRef, totalPages, setScrollByRatio])

  const scrollToPage = useCallback((page: number) => {
    const leftEl = leftRef.current
    const rightEl = rightRef.current
    if (!leftEl || !rightEl) return

    isSyncingRef.current = true
    const ratio = (page - 1) / Math.max(1, totalPages - 1)
    setScrollByRatio(leftEl, ratio)
    setScrollByRatio(rightEl, ratio)
    lastSyncedPageRef.current = page

    setTimeout(() => {
      isSyncingRef.current = false
    }, 100)
  }, [leftRef, rightRef, totalPages, setScrollByRatio])

  return { scrollToPage }
}
