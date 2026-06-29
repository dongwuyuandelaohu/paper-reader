import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface PDFViewerProps {
  pdfUrl: string
  currentPage: number
  zoom: number
  onPageChange: (page: number) => void
  onZoomChange: (zoom: number) => void
  totalPages: number
}

// 缓冲页数：可视区前后各渲染几页
const BUFFER = 1

export function PDFViewer({
  pdfUrl,
  currentPage,
  zoom,
  onPageChange,
  onZoomChange,
  totalPages,
}: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const renderedPagesRef = useRef<Set<number>>(new Set())
  const renderTasksRef = useRef<Map<number, RenderTask>>(new Map())
  // 估计的页面高度（基于首页尺寸）
  const estimatedPageHeight = useRef(0)

  // 可视页面集合（含缓冲）
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]))

  // 是否跳过滚动检测（程序化滚动时）
  const isProgrammaticScroll = useRef(false)
  const lastScrolledPage = useRef(currentPage)

  if (pageRefs.current.length !== totalPages) {
    pageRefs.current = Array(totalPages).fill(null)
    canvasRefs.current = Array(totalPages).fill(null)
  }

  // 加载 PDF 文档
  useEffect(() => {
    let cancelled = false
    renderedPagesRef.current = new Set()
    renderTasksRef.current.clear()
    const loadingTask = pdfjsLib.getDocument(pdfUrl)
    loadingTask.promise.then(async (doc) => {
      if (cancelled) { doc.destroy(); return }
      docRef.current = doc
      // 用首页尺寸估算页面高度
      try {
        const firstPage = await doc.getPage(1)
        const viewport = firstPage.getViewport({ scale: zoom })
        estimatedPageHeight.current = viewport.height / (window.devicePixelRatio || 1)
      } catch { /* ignore */ }
      // 渲染初始可视页
      renderVisiblePages()
    }).catch((err: Error) => {
      console.error('Failed to load PDF:', err)
    })
    return () => { cancelled = true; loadingTask.destroy() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl])

  // 渲染单页到 canvas
  const renderPage = useCallback(async (pageNum: number) => {
    const doc = docRef.current
    const canvas = canvasRefs.current[pageNum - 1]
    if (!doc || !canvas || renderedPagesRef.current.has(pageNum)) return

    try {
      const page = await doc.getPage(pageNum)
      // 如果已被取消，跳过
      if (renderTasksRef.current.has(pageNum)) return

      const dpr = window.devicePixelRatio || 1
      const scale = zoom * dpr
      const viewport = page.getViewport({ scale })
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${viewport.width / dpr}px`
      canvas.style.height = `${viewport.height / dpr}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const renderTask = page.render({ canvasContext: ctx, viewport })
      renderTasksRef.current.set(pageNum, renderTask)
      await renderTask.promise
      renderedPagesRef.current.add(pageNum)
      renderTasksRef.current.delete(pageNum)
    } catch (err: any) {
      // RenderingCancelledException 是正常的，不算错误
      if (err?.name !== 'RenderingCancelledException') {
        console.error(`Failed to render page ${pageNum}:`, err)
      }
      renderTasksRef.current.delete(pageNum)
    }
  }, [zoom])

  // 渲染所有可视页 + 清理远处的页
  const renderVisiblePages = useCallback(() => {
    const visible = visiblePages
    // 渲染可视页
    for (const pageNum of visible) {
      renderPage(pageNum)
    }
    // 清理不在可视区+缓冲的页（释放内存）
    const toCleanup: number[] = []
    for (const pageNum of renderedPagesRef.current) {
      if (!visible.has(pageNum)) {
        toCleanup.push(pageNum)
      }
    }
    for (const pageNum of toCleanup) {
      // 取消进行中的渲染
      const task = renderTasksRef.current.get(pageNum)
      if (task) { task.cancel(); renderTasksRef.current.delete(pageNum) }
      // 清空 canvas
      const canvas = canvasRefs.current[pageNum - 1]
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx?.clearRect(0, 0, canvas.width, canvas.height)
        canvas.width = 0
        canvas.height = 0
      }
      renderedPagesRef.current.delete(pageNum)
    }
  }, [visiblePages, renderPage])

  // 当 visiblePages 变化时，渲染/清理
  useEffect(() => {
    renderVisiblePages()
  }, [renderVisiblePages])

  // zoom 变化时：重置已渲染标记，重新估算高度，重渲染可视页
  useEffect(() => {
    if (!docRef.current) return
    renderedPagesRef.current = new Set()
    // 取消所有进行中的渲染
    renderTasksRef.current.forEach((task) => task.cancel())
    renderTasksRef.current.clear()
    // 重新估算高度
    docRef.current.getPage(1).then((page) => {
      const viewport = page.getViewport({ scale: zoom })
      estimatedPageHeight.current = viewport.height / (window.devicePixelRatio || 1)
      renderVisiblePages()
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, totalPages])

  // IntersectionObserver：跟踪可视页（含缓冲）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev)
          let changed = false
          for (const entry of entries) {
            const pageNum = Number((entry.target as HTMLElement).dataset.pageNum)
            if (entry.isIntersecting) {
              if (!next.has(pageNum)) { next.add(pageNum); changed = true }
              // 加入缓冲页
              for (let b = 1; b <= BUFFER; b++) {
                if (pageNum - b >= 1 && !next.has(pageNum - b)) { next.add(pageNum - b); changed = true }
                if (pageNum + b <= totalPages && !next.has(pageNum + b)) { next.add(pageNum + b); changed = true }
              }
            }
            // 不在 isIntersecting 时移除（由 renderVisiblePages 的清理逻辑处理高度）
          }
          return changed ? next : prev
        })
      },
      { root: container, rootMargin: '200px 0px' }
    )

    const els = pageRefs.current.filter(Boolean) as HTMLDivElement[]
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [totalPages])

  // 滚动检测：找最接近视口顶部的页
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let rafId: number | null = null

    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId)
      if (isProgrammaticScroll.current) return

      rafId = requestAnimationFrame(() => {
        const scrollTop = container.scrollTop
        let bestPage = 1
        let bestDist = Infinity
        for (let i = 0; i < totalPages; i++) {
          const el = pageRefs.current[i]
          if (!el) continue
          const dist = Math.abs(el.offsetTop - scrollTop)
          if (dist < bestDist) { bestDist = dist; bestPage = i + 1 }
        }
        if (bestPage !== lastScrolledPage.current) {
          lastScrolledPage.current = bestPage
          onPageChange(bestPage)
        }
      })
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [totalPages, onPageChange])

  // 程序化滚动：外部改变 currentPage 时（TOC 点击、工具栏按钮）
  useEffect(() => {
    if (currentPage === lastScrolledPage.current) return

    const el = pageRefs.current[currentPage - 1]
    if (!el) return

    lastScrolledPage.current = currentPage
    isProgrammaticScroll.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => { isProgrammaticScroll.current = false }, 400)
  }, [currentPage])

  // Ctrl/Cmd + 滚轮缩放
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        onZoomChange(Math.round(Math.max(0.25, Math.min(3, zoom + delta)) * 100) / 100)
      }
    },
    [zoom, onZoomChange]
  )

  const estHeight = estimatedPageHeight.current || (800 * zoom)

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      style={{
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'auto',
        flex: 1,
        gap: 16,
        padding: '24px 0',
      }}
    >
      {Array.from({ length: totalPages }, (_, i) => {
        const pageNum = i + 1
        return (
          <div
            key={pageNum}
            ref={(el) => { pageRefs.current[i] = el }}
            data-page-num={pageNum}
            style={{
              boxShadow: '0 2px 24px rgba(0,0,0,0.35)',
              lineHeight: 0,
              flexShrink: 0,
              borderRadius: 2,
              position: 'relative',
              // 占位高度：未渲染时用估算高度撑开，避免滚动条跳变
              height: visiblePages.has(pageNum) ? 'auto' : estHeight,
              background: 'var(--surface2, #1a1a18)',
            }}
          >
            <canvas ref={(el) => { canvasRefs.current[i] = el }} />
            <div style={{
              position: 'absolute', bottom: -20, left: 0, right: 0,
              textAlign: 'center', fontSize: 10, color: 'var(--stone)', lineHeight: 1,
            }}>
              {pageNum}
            </div>
          </div>
        )
      })}
      <div style={{ height: 12, flexShrink: 0 }} />
    </div>
  )
}
