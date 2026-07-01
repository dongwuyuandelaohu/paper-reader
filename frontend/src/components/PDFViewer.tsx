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
  const estimatedPageHeight = useRef(0)

  const isProgrammaticScroll = useRef(false)
  const lastScrolledPage = useRef(currentPage)
  const [, setRenderTick] = useState(0) // 触发重渲染

  if (pageRefs.current.length !== totalPages) {
    pageRefs.current = Array(totalPages).fill(null)
    canvasRefs.current = Array(totalPages).fill(null)
  }

  // 渲染单页到 canvas
  const renderPage = useCallback(async (pageNum: number) => {
    const doc = docRef.current
    const canvas = canvasRefs.current[pageNum - 1]
    if (!doc || !canvas || renderedPagesRef.current.has(pageNum)) return

    try {
      const page = await doc.getPage(pageNum)
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
      // 触发 UI 更新（隐藏占位高度）
      setRenderTick(t => t + 1)
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error(`Failed to render page ${pageNum}:`, err)
      }
      renderTasksRef.current.delete(pageNum)
    }
  }, [zoom])

  // 加载 PDF 文档后，渐进式渲染所有页面
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

      // 先渲染当前页（立即可见）
      await renderPage(currentPage)

      // 然后从第1页开始渐进式渲染所有页面
      for (let i = 1; i <= totalPages; i++) {
        if (cancelled) break
        if (i === currentPage) continue // 已渲染
        await renderPage(i)
      }
    }).catch((err: Error) => {
      console.error('Failed to load PDF:', err)
    })

    return () => {
      cancelled = true
      loadingTask.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl])

  // zoom 变化时：重置已渲染标记，重新渲染所有页面
  useEffect(() => {
    if (!docRef.current) return
    renderedPagesRef.current = new Set()
    renderTasksRef.current.forEach((task) => task.cancel())
    renderTasksRef.current.clear()

    docRef.current.getPage(1).then((page) => {
      const viewport = page.getViewport({ scale: zoom })
      estimatedPageHeight.current = viewport.height / (window.devicePixelRatio || 1)

      // 重新渲染所有页面
      const renderAll = async () => {
        for (let i = 1; i <= totalPages; i++) {
          if (i !== currentPage) await renderPage(i)
        }
        await renderPage(currentPage)
      }
      renderAll()
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, totalPages])

  // IntersectionObserver：仅跟踪当前页码（不用于渲染控制）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      () => {
        // IntersectionObserver 仅用于触发滚动检测，实际页码由 onScroll 处理
      },
      { root: container, rootMargin: '0px 0px -50% 0px' }
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

  // 程序化滚动：外部改变 currentPage 时
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
              // 已渲染的页面用 auto 高度，未渲染的用估算高度撑开
              height: renderedPagesRef.current.has(pageNum) ? 'auto' : estHeight,
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
