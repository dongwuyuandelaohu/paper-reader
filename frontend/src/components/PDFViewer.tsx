import { useEffect, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

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
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const renderedPagesRef = useRef<Set<number>>(new Set())

  // Track if we should skip scroll detection (during programmatic scroll)
  const isProgrammaticScroll = useRef(false)
  const lastScrolledPage = useRef(currentPage)

  if (canvasRefs.current.length !== totalPages) {
    canvasRefs.current = Array(totalPages).fill(null)
    pageRefs.current = Array(totalPages).fill(null)
  }

  // Load PDF document once
  useEffect(() => {
    let cancelled = false
    renderedPagesRef.current = new Set()
    const loadingTask = pdfjsLib.getDocument(pdfUrl)
    loadingTask.promise.then((doc) => {
      if (!cancelled) {
        docRef.current = doc
        for (let i = 1; i <= doc.numPages; i++) renderPage(i)
      } else {
        doc.destroy()
      }
    }).catch((err: Error) => {
      console.error('Failed to load PDF:', err)
    })
    return () => { cancelled = true; loadingTask.destroy() }
  }, [pdfUrl])

  const renderPage = useCallback(async (pageNum: number) => {
    const doc = docRef.current
    const canvas = canvasRefs.current[pageNum - 1]
    if (!doc || !canvas || renderedPagesRef.current.has(pageNum)) return
    try {
      const page = await doc.getPage(pageNum)
      const dpr = window.devicePixelRatio || 1
      const scale = zoom * dpr
      const viewport = page.getViewport({ scale })
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${viewport.width / dpr}px`
      canvas.style.height = `${viewport.height / dpr}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      await page.render({ canvasContext: ctx, viewport }).promise
      renderedPagesRef.current.add(pageNum)
    } catch (err) {
      console.error(`Failed to render page ${pageNum}:`, err)
    }
  }, [zoom])

  // Re-render all pages when zoom changes
  useEffect(() => {
    if (!docRef.current) return
    renderedPagesRef.current = new Set()
    for (let i = 1; i <= totalPages; i++) renderPage(i)
  }, [zoom, totalPages, renderPage])

  // Scroll detection: finds page closest to viewport top
  // Only updates local display state, NO API calls
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let rafId: number | null = null

    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId)
      // Skip if this scroll was triggered programmatically
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

  // Programmatic scroll: when currentPage changes from outside (TOC click, toolbar buttons)
  // Only scroll if the page actually changed (not from our own scroll detection)
  useEffect(() => {
    if (currentPage === lastScrolledPage.current) return

    const el = pageRefs.current[currentPage - 1]
    if (!el) return

    lastScrolledPage.current = currentPage
    isProgrammaticScroll.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })

    // Reset flag after scroll animation completes
    setTimeout(() => {
      isProgrammaticScroll.current = false
    }, 400)
  }, [currentPage])

  // Ctrl/Cmd + wheel for zoom
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
        scrollSnapType: 'none', // No snap
      }}
    >
      {Array.from({ length: totalPages }, (_, i) => {
        const pageNum = i + 1
        return (
          <div
            key={pageNum}
            ref={(el) => { pageRefs.current[i] = el }}
            style={{
              boxShadow: '0 2px 24px rgba(0,0,0,0.35)',
              lineHeight: 0,
              flexShrink: 0,
              borderRadius: 2,
              position: 'relative',
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
