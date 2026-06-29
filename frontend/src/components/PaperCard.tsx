import { useEffect, useRef, useState } from 'react'
import { Heart, Clock, FileText } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import { papers as papersApi } from '@/api/client'
import type { Paper } from '../api/types'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

// 缩略图缓存：paperId -> dataURL
const _thumbnailCache = new Map<string, string>()
// 正在加载的缩略图：paperId -> Promise
const _loadingThumbnails = new Map<string, Promise<string>>()

/**
 * 渲染 PDF 首页为缩略图 dataURL（带缓存，避免重复渲染）
 */
async function renderThumbnail(paperId: string, targetWidth = 240): Promise<string> {
  if (_thumbnailCache.has(paperId)) return _thumbnailCache.get(paperId)!
  if (_loadingThumbnails.has(paperId)) return _loadingThumbnails.get(paperId)!

  const promise = (async () => {
    const url = papersApi.getFileUrl(paperId)
    const loadingTask = pdfjsLib.getDocument(url)
    const doc = await loadingTask.promise
    try {
      const page = await doc.getPage(1)
      // 按目标宽度计算缩放
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(targetWidth / baseViewport.width, 2)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport }).promise
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
      _thumbnailCache.set(paperId, dataUrl)
      return dataUrl
    } finally {
      doc.destroy()
    }
  })()

  _loadingThumbnails.set(paperId, promise)
  try {
    return await promise
  } finally {
    _loadingThumbnails.delete(paperId)
  }
}

/**
 * 论文缩略图组件：懒加载渲染 PDF 首页
 */
function PaperThumbnail({ paperId }: { paperId: string }) {
  const [src, setSrc] = useState<string | null>(_thumbnailCache.get(paperId) || null)
  const [failed, setFailed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (src || loadedRef.current) return
    const el = containerRef.current
    if (!el) return

    let cancelled = false
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadedRef.current) {
          loadedRef.current = true
          observer.disconnect()
          renderThumbnail(paperId)
            .then((url) => { if (!cancelled) setSrc(url) })
            .catch(() => { if (!cancelled) setFailed(true) })
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => { cancelled = true; observer.disconnect() }
  }, [paperId, src])

  if (src) {
    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
    )
  }

  if (failed) {
    return (
      <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '20px', width: '100%' }}>
        <div style={{ height: '8px', background: 'var(--border2)', borderRadius: '4px', width: '80%' }} />
        <div style={{ height: '8px', background: 'var(--border2)', borderRadius: '4px', width: '95%' }} />
        <div style={{ height: '8px', background: 'var(--border2)', borderRadius: '4px', width: '70%' }} />
        <div style={{ height: '8px', background: 'var(--border2)', borderRadius: '4px', width: '85%' }} />
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '20px', width: '100%' }}>
      <div style={{ height: '8px', background: 'var(--border2)', borderRadius: '4px', width: '80%', animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ height: '8px', background: 'var(--border2)', borderRadius: '4px', width: '95%', animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ height: '8px', background: 'var(--border2)', borderRadius: '4px', width: '70%', animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ height: '8px', background: 'var(--border2)', borderRadius: '4px', width: '85%', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
  )
}

interface PaperCardProps {
  paper: Paper
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  selected: boolean
  onToggleSelect: () => void
  onToggleFavorite: () => void
}

export function PaperCard({
  paper,
  onClick,
  onContextMenu,
  selected,
  onToggleSelect,
  onToggleFavorite,
}: PaperCardProps) {
  const progress = paper.total_pages > 0
    ? (paper.pages_parsed / paper.total_pages) * 100
    : 0

  const translationProgress = paper.total_pages > 0
    ? (paper.pages_translated / paper.total_pages) * 100
    : 0

  const getStatusBadge = () => {
    switch (paper.parse_status) {
      case 'completed':
        return { label: '已解析', color: 'var(--success)', bg: 'var(--success-bg)' }
      case 'processing':
        return { label: '解析中', color: 'var(--focus)', bg: 'rgba(56, 152, 236, 0.1)' }
      case 'pending':
        return { label: '待解析', color: 'var(--warn)', bg: 'var(--warn-bg)' }
      case 'failed':
        return { label: '失败', color: 'var(--error)', bg: 'var(--error-bg)' }
      default:
        return { label: '未知', color: 'var(--stone)', bg: 'var(--sand)' }
    }
  }

  const status = getStatusBadge()

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins}分钟前`
    if (diffHours < 24) return `${diffHours}小时前`
    if (diffDays < 7) return `${diffDays}天前`
    return date.toLocaleDateString('zh-CN')
  }

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        background: 'var(--surface)',
        borderRadius: '10px',
        border: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        overflow: 'hidden',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px var(--ring)'
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.boxShadow = 'none'
        }
      }}
    >
      {/* Checkbox for selection */}
      <div
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect()
        }}
        style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          width: '20px',
          height: '20px',
          borderRadius: '6px',
          background: selected ? 'var(--accent)' : 'var(--white)',
          border: selected ? '2px solid var(--accent)' : '2px solid var(--border2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          transition: 'all 0.2s',
        }}
      >
        {selected && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>

      {/* Thumbnail Area */}
      <div style={{
        height: '120px',
        background: 'var(--sand)',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <PaperThumbnail paperId={paper.id} />

        {/* Favorite Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite()
          }}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'var(--surface)',
            border: 'none',
            borderRadius: '6px',
            padding: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.2s',
            opacity: 0.8,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.transform = 'scale(1.1)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.8'
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >
          <Heart
            size={16}
            strokeWidth={2}
            fill={paper.is_favorite ? 'var(--accent)' : 'none'}
            color={paper.is_favorite ? 'var(--accent)' : 'var(--stone)'}
          />
        </button>

        {/* Status Badge */}
        <div style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          padding: '4px 8px',
          background: status.bg,
          color: status.color,
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 500,
        }}>
          {status.label}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '14px' }}>
        {/* Title */}
        <h3 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--fg)',
          margin: 0,
          marginBottom: '8px',
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {paper.title}
        </h3>

        {/* Meta */}
        <div style={{
          fontSize: '12px',
          color: 'var(--muted)',
          marginBottom: '8px',
          lineHeight: 1.5,
        }}>
          {paper.authors && paper.authors.length > 0 && (
            <div>{paper.authors.slice(0, 2).join(', ')}{paper.authors.length > 2 ? ' 等' : ''}</div>
          )}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {paper.year && <span>{paper.year}</span>}
            {paper.venue && <span>· {paper.venue}</span>}
          </div>
        </div>

        {/* Tags */}
        {paper.tags && paper.tags.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '4px',
            flexWrap: 'wrap',
            marginBottom: '10px',
          }}>
            {paper.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                style={{
                  padding: '3px 8px',
                  background: tag.color,
                  color: 'var(--white)',
                  borderRadius: '5px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {tag.name}
              </span>
            ))}
            {paper.tags.length > 3 && (
              <span style={{
                padding: '3px 8px',
                background: 'var(--sand)',
                color: 'var(--muted)',
                borderRadius: '5px',
                fontSize: '11px',
                fontWeight: 500,
              }}>
                +{paper.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Progress Bars */}
        <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {/* Parse progress */}
          <div style={{
            height: '3px',
            background: 'var(--border)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: progress === 100 ? 'var(--success)' : 'var(--accent)',
              borderRadius: '2px',
              transition: 'width 0.3s',
            }} />
          </div>
          {/* Translation progress */}
          {paper.pages_translated > 0 && (
            <div style={{
              height: '3px',
              background: 'var(--border)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${translationProgress}%`,
                background: translationProgress === 100 ? '#6366f1' : 'var(--coral)',
                borderRadius: '2px',
                transition: 'width 0.3s',
              }} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'var(--stone)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <FileText size={12} strokeWidth={1.8} />
              <span>{paper.pages_parsed}/{paper.total_pages}</span>
            </div>
            {paper.pages_translated > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--coral)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" />
                  <path d="m22 22-5-10-5 10" /><path d="M14 18h6" />
                </svg>
                <span>{paper.pages_translated}/{paper.total_pages}</span>
              </div>
            )}
          </div>
          {paper.last_read_at && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} strokeWidth={1.8} />
              <span>{formatTime(paper.last_read_at)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
