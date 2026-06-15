import { useState, useMemo, useCallback } from 'react'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { ParsedPage } from '@/api/types'

interface FullMarkdownModalProps {
  open: boolean
  onClose: () => void
  pages: ParsedPage[]
  paperId: string
  paperTitle: string
}

export function FullMarkdownModal({
  open,
  onClose,
  pages,
  paperId,
  paperTitle,
}: FullMarkdownModalProps) {
  const [viewMode, setViewMode] = useState<'rendered' | 'source'>('rendered')
  const [copied, setCopied] = useState(false)

  // Concatenate all pages' markdown with page separators
  const fullMarkdown = useMemo(() => {
    return pages
      .sort((a, b) => a.page_number - b.page_number)
      .map((page) => {
        return `<!-- Page ${page.page_number} -->\n\n${page.markdown}`
      })
      .join('\n\n---\n\n')
  }, [pages])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullMarkdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = fullMarkdown
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [fullMarkdown])

  const handleExport = useCallback(() => {
    const blob = new Blob([fullMarkdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${paperTitle || 'paper'}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [fullMarkdown, paperTitle])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: '16px',
          width: '90%',
          maxWidth: '960px',
          height: '85vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '17px',
              fontWeight: 600,
              color: 'var(--fg)',
              margin: 0,
            }}>
              完整解析文档
            </h2>
            <span style={{ fontSize: 12, color: 'var(--stone)' }}>
              共 {pages.length} 页
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* View mode toggle */}
            <div style={{
              display: 'flex',
              background: 'var(--surface2, #262624)',
              borderRadius: 6,
              padding: 2,
            }}>
              <button
                onClick={() => setViewMode('rendered')}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'rendered' ? 'var(--surface3, #30302e)' : 'transparent',
                  color: viewMode === 'rendered' ? 'var(--fg)' : 'var(--stone)',
                  transition: 'all 0.15s',
                }}
              >
                渲染
              </button>
              <button
                onClick={() => setViewMode('source')}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'source' ? 'var(--surface3, #30302e)' : 'transparent',
                  color: viewMode === 'source' ? 'var(--fg)' : 'var(--stone)',
                  transition: 'all 0.15s',
                }}
              >
                源码
              </button>
            </div>

            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

            {/* Copy button */}
            <button
              onClick={handleCopy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: copied ? 'var(--success)' : 'var(--fg2)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {copied ? (
                  <polyline points="20 6 9 17 4 12" />
                ) : (
                  <>
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </>
                )}
              </svg>
              {copied ? '已复制' : '复制全文'}
            </button>

            {/* Export button */}
            <button
              onClick={handleExport}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 6,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              导出 .md
            </button>

            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

            {/* Close button */}
            <button
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 6,
                border: 'none',
                background: 'transparent',
                color: 'var(--stone)',
                cursor: 'pointer',
                fontSize: 18,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface2, #262624)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: viewMode === 'rendered' ? '24px 32px' : '0',
        }}>
          {pages.length === 0 ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--stone)',
              fontSize: 14,
            }}>
              暂无解析内容
            </div>
          ) : viewMode === 'rendered' ? (
            <MarkdownRenderer content={fullMarkdown} paperId={paperId} />
          ) : (
            <pre style={{
              margin: 0,
              padding: '20px',
              fontSize: 13,
              lineHeight: 1.7,
              fontFamily: 'var(--font-mono)',
              color: 'var(--fg2)',
              background: 'var(--bg)',
              height: '100%',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {fullMarkdown}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
