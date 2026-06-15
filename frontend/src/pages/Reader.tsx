import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useReaderStore } from '@/stores/useReaderStore'
import { useQAStore } from '@/stores/useQAStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useToastStore } from '@/components/Toast'
import { PDFViewer } from '@/components/PDFViewer'
import { ResizableHandle } from '@/components/ResizableHandle'
import { ParseLoading } from '@/components/ParseLoading'
import { EngineModal } from '@/components/EngineModal'
import { QAPanel } from '@/components/QAPanel'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { FullMarkdownModal } from '@/components/FullMarkdownModal'
import { papers, system } from '@/api/client'
import type { ParsedPage } from '@/api/types'

/* ─────────── Inline SVG Icons ─────────── */

function IconBack() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
}
function IconMinus() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14" /></svg>
}
function IconPlus() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
}
function IconFit() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" /></svg>
}
function IconChevronLeft() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
}
function IconChevronRight() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
}
function IconClose() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
}

/* ─────────── Toolbar Button ─────────── */

function ToolBtn({
  children, onClick, active, style, title, disabled,
}: {
  children: React.ReactNode; onClick?: () => void; active?: boolean; style?: React.CSSProperties; title?: string; disabled?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
        borderRadius: 6, border: 'none', fontSize: 13, whiteSpace: 'nowrap',
        fontFamily: 'var(--font-sans)', transition: 'background 0.15s, color 0.15s',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        background: active ? 'var(--surface3, #30302e)' : hovered ? 'var(--surface2, #262624)' : 'transparent',
        color: active ? 'var(--coral)' : hovered ? 'var(--fg)' : 'var(--muted)',
        ...style,
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

/* ─────────── Parse Page Chunk Component ─────────── */

function ParsePageChunk({
  page,
  paperId,
  translation,
  onTranslate,
  onRetranslate,
  translating,
}: {
  page: ParsedPage
  paperId: string
  translation: string | undefined
  onTranslate: () => void
  onRetranslate: () => void
  translating: boolean
}) {
  const [showTranslation, setShowTranslation] = useState(false)
  const prevTranslationRef = useRef<string | undefined>(undefined)

  // Auto-switch to translation when it first appears (not on every render)
  useEffect(() => {
    if (translation && prevTranslationRef.current === undefined && !translating) {
      setShowTranslation(true)
    }
    prevTranslationRef.current = translation
  }, [translation, translating])

  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
      {/* Header: page number + controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', padding: '1px 6px', borderRadius: 3, background: 'var(--surface3, #30302e)' }}>
          第 {page.page_number} 页
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Toggle: original / translated */}
          {translation ? (
            <div style={{
              display: 'flex',
              background: 'var(--surface2, #262624)',
              borderRadius: 4,
              padding: 1,
            }}>
              <button
                onClick={() => setShowTranslation(false)}
                style={{
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 500,
                  borderRadius: 3,
                  border: 'none',
                  cursor: 'pointer',
                  background: !showTranslation ? 'var(--surface3, #30302e)' : 'transparent',
                  color: !showTranslation ? 'var(--fg)' : 'var(--stone)',
                  transition: 'all 0.15s',
                }}
              >
                原文
              </button>
              <button
                onClick={() => setShowTranslation(true)}
                style={{
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 500,
                  borderRadius: 3,
                  border: 'none',
                  cursor: 'pointer',
                  background: showTranslation ? 'var(--surface3, #30302e)' : 'transparent',
                  color: showTranslation ? 'var(--coral)' : 'var(--stone)',
                  transition: 'all 0.15s',
                }}
              >
                译文
              </button>
            </div>
          ) : null}

          {/* Translate / Retranslate button */}
          {!translation && !translating && (
            <button
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px',
                fontSize: 10, borderRadius: 4, border: '1px solid var(--coral)',
                background: 'transparent', color: 'var(--coral)', cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onClick={onTranslate}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" />
                <path d="m22 22-5-10-5 10" /><path d="M14 18h6" />
              </svg>
              翻译
            </button>
          )}

          {translating && (
            <span style={{ fontSize: 10, color: 'var(--coral)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              翻译中
            </span>
          )}

          {translation && !translating && (
            <button
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px',
                fontSize: 10, borderRadius: 3, border: 'none',
                background: 'transparent', color: 'var(--stone)', cursor: 'pointer',
                transition: 'color 0.15s',
              }}
              onClick={onRetranslate}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--coral)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--stone)'}
              title="重新翻译"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {showTranslation && translation ? (
        <div style={{ background: 'rgba(201,100,66,0.04)', borderRadius: 6, padding: '10px 12px' }}>
          <MarkdownRenderer content={translation} paperId={paperId} />
        </div>
      ) : (
        <MarkdownRenderer content={page.markdown} paperId={paperId} />
      )}
    </div>
  )
}

/* ─────────── Main Component ─────────── */

export default function Reader() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const showToast = useToastStore((s) => s.showToast)

  // Stores
  const reader = useReaderStore()
  const qa = useQAStore()
  const { models, engines, fetchModels, fetchEngines } = useSettingsStore()

  // Local state
  const [showEngineModal, setShowEngineModal] = useState(false)
  const [showFullMarkdown, setShowFullMarkdown] = useState(false)
  const [pageInputValue, setPageInputValue] = useState('')

  // ── 加载策略：最小化初始请求，PDF 优先 ──
  // Mount 时只发 1 个请求：papers.get(id) → PDF 立即渲染
  // 其他请求按需加载：打开解析面板时才加载解析数据，打开引擎弹窗时才加载模型/引擎列表
  useEffect(() => {
    if (!id) return
    reader.loadPaper(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Sync page input
  useEffect(() => { setPageInputValue(String(reader.currentPage)) }, [reader.currentPage])

  // Determine layout (must be before effects that use these variables)
  const isParsed = reader.parseStatus?.parse_status === 'parsed' || reader.pages.length > 0
  const showParsePanel = reader.parsePanelOpen || reader.parsing
  const showQAPanel = reader.qaPanelOpen

  // 当打开解析面板时，才加载解析数据
  useEffect(() => {
    if (showParsePanel && reader.paper) {
      reader.loadParseData(reader.paper.id)
    }
  }, [showParsePanel, reader.paper?.id])

  // 当打开引擎弹窗时，才加载模型和引擎列表
  useEffect(() => {
    if (showEngineModal) {
      fetchModels()
      fetchEngines()
    }
  }, [showEngineModal])

  // 当打开 QA 面板时，才加载对话列表和模型
  useEffect(() => {
    if (showQAPanel && reader.paper) {
      fetchModels()
      if (id) qa.fetchConversations(id)
    }
  }, [showQAPanel, reader.paper?.id])

  // Set default QA model once models are loaded
  useEffect(() => {
    if (!qa.activeModelId && models.length > 0) {
      const defaultModel = models.find((m) => m.is_default_chat) || models[0]
      if (defaultModel) qa.switchModel(defaultModel.id)
    }
  }, [models, qa.activeModelId])

  // Resizable panel widths
  const [parsePanelW, setParsePanelW] = useState(420)
  const [qaPanelW, setQaPanelW] = useState(380)
  const [pdfPanelW, setPdfPanelW] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Calculate PDF panel width - TOC is now an overlay, doesn't affect layout
  useEffect(() => {
    const updateWidth = () => {
      if (!containerRef.current) return
      const containerWidth = containerRef.current.offsetWidth
      const handleWidth = showParsePanel ? 12 : 0
      const parseWidth = showParsePanel ? parsePanelW : 0
      const qaHandleWidth = showQAPanel ? 12 : 0
      const qaWidth = showQAPanel ? qaPanelW : 0
      
      // PDF fills remaining space
      const available = containerWidth - handleWidth - parseWidth - qaHandleWidth - qaWidth
      setPdfPanelW(Math.max(available, 0))
    }
    
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [showParsePanel, parsePanelW, showQAPanel, qaPanelW])

  // Handle parse panel width change
  const handleParseWidthChange = useCallback((newParseWidth: number) => {
    if (!containerRef.current) return
    const containerWidth = containerRef.current.offsetWidth
    const handleWidth = 12
    const qaHandleWidth = showQAPanel ? 12 : 0
    const qaWidth = showQAPanel ? qaPanelW : 0
    
    // PDF must be at least 35% (or 30% if QA is open)
    const minPdfRatio = showQAPanel ? 0.30 : 0.35
    const minPdfWidth = containerWidth * minPdfRatio
    
    // Parse max = total - handles - minPdf - QA
    const maxParseWidth = containerWidth - handleWidth - minPdfWidth - qaHandleWidth - qaWidth
    
    // Parse min is 280px
    const clampedWidth = Math.min(Math.max(newParseWidth, 280), maxParseWidth)
    setParsePanelW(clampedWidth)
  }, [showQAPanel, qaPanelW])

  // Handle QA panel width change
  const handleQAWidthChange = useCallback((newQAWidth: number) => {
    if (!containerRef.current) return
    const containerWidth = containerRef.current.offsetWidth
    const handleWidth = 12
    
    // PDF must be at least 30%
    const minPdfWidth = containerWidth * 0.30
    // Parse must be at least 280px
    const minParseWidth = 280
    
    // QA max = total - handles - minPdf - minParse
    const maxQAWidth = containerWidth - handleWidth - minPdfWidth - handleWidth - minParseWidth
    
    // QA min is 280px
    const clampedWidth = Math.min(Math.max(newQAWidth, 280), maxQAWidth)
    setQaPanelW(clampedWidth)
  }, [])

  // Page navigation
  const totalPages = reader.paper?.total_pages || 1

  const handlePageChange = useCallback((page: number) => {
    const p = Math.max(1, Math.min(totalPages, page))
    reader.setCurrentPage(p)
  }, [totalPages, reader.setCurrentPage])

  const handlePageInputSubmit = () => {
    const val = parseInt(pageInputValue)
    if (!isNaN(val)) handlePageChange(val)
    else setPageInputValue(String(reader.currentPage))
  }

  // Per-page translation state
  const [translatingPage, setTranslatingPage] = useState<number | null>(null)
  const handleTranslatePage = useCallback(async (pageNumber: number, force = false) => {
    if (!reader.paper || translatingPage !== null) return
    
    const engine = reader.currentEngine || 'pymupdf'
    const pageKey = `${reader.paper.id}:${pageNumber}:${engine}`
    
    // 检查是否已经在后台翻译中
    if (reader.translatingPages.has(pageKey) && !force) {
      showToast(`第 ${pageNumber} 页正在后台翻译中...`)
      return
    }
    
    setTranslatingPage(pageNumber)
    showToast(`开始翻译第 ${pageNumber} 页，可在后台继续浏览`)
    
    // 启动后台翻译（不阻塞）
    reader.translateCurrentPage(undefined, pageNumber, force).finally(() => {
      setTranslatingPage(null)
    })
  }, [reader, translatingPage, showToast])

  // Parse trigger
  const handleStartParse = useCallback(() => {
    if (!reader.paper) return
    setShowEngineModal(false)
    reader.triggerParse(reader.paper.id, reader.selectedEngine)
    showToast(`正在使用 ${reader.selectedEngine} 解析...`)
  }, [reader, showToast])

  // Recheck engines (after install/uninstall)
  const handleRecheckEngines = useCallback(async () => {
    await system.recheckEngines()
    await fetchEngines()
    showToast('引擎检测完成')
  }, [fetchEngines, showToast])

  // Q&A actions
  const handleSendMessage = useCallback((content: string) => {
    if (!reader.paper || !qa.activeConversationId) {
      // Create conversation first
      const defaultModel = models.find((m) => m.id === qa.activeModelId) || models[0]
      if (!defaultModel || !reader.paper) {
        showToast('请先配置 AI 模型')
        return
      }
      qa.createConversation(reader.paper.id, defaultModel.id).then(() => {
        const convId = useQAStore.getState().activeConversationId
        if (convId) qa.sendMessage(convId, content, qa.activeModelId || undefined)
      })
    } else {
      qa.sendMessage(qa.activeConversationId, content, qa.activeModelId || undefined)
    }
  }, [reader.paper, qa, models, showToast])

  const handleNewConversation = useCallback(async () => {
    if (!reader.paper) return
    const defaultModel = models.find((m) => m.id === qa.activeModelId) || models[0]
    if (!defaultModel) { showToast('请先配置 AI 模型'); return }
    await qa.createConversation(reader.paper.id, defaultModel.id)
    showToast('新对话已创建')
  }, [reader.paper, qa, models, showToast])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '+' || e.key === '=') { e.preventDefault(); reader.setZoom(reader.zoom + 0.1) }
      else if (e.key === '-') { e.preventDefault(); reader.setZoom(reader.zoom - 0.1) }
      else if (e.key === '0') { e.preventDefault(); reader.setZoom(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); handlePageChange(reader.currentPage - 1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); handlePageChange(reader.currentPage + 1) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [reader.zoom, reader.currentPage, handlePageChange])

  // Parse complete → reload pages
  useEffect(() => {
    if (reader.parseStatus?.parse_status === 'parsed' && !reader.parsing && reader.pages.length === 0) {
      reader.loadPages(reader.currentEngine || undefined)
    }
  }, [reader.parseStatus?.parse_status, reader.parsing])

  /* ─── Loading states ─── */

  if (reader.loading && !reader.paper) {
    return (
      <div className="theme-dark" style={S.root}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>加载中...</div>
      </div>
    )
  }
  if (!reader.paper) {
    return (
      <div className="theme-dark" style={S.root}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ color: 'var(--muted)' }}>论文不存在</div>
          <button style={S.accentBtn} onClick={() => navigate('/')}>返回文库</button>
        </div>
      </div>
    )
  }

  const pdfUrl = papers.getFileUrl(reader.paper.id)

  /* ─── Render ─── */

  return (
    <div className="theme-dark" style={S.root}>
      {/* ═══════ Toolbar ═══════ */}
      <header style={S.toolbar}>
        {/* Left */}
        <ToolBtn onClick={() => navigate('/')} title="返回文库">
          <IconBack />
        </ToolBtn>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={reader.paper.title}>
          {reader.paper.title}
        </div>

        <div style={{ flex: 1 }} />

        {/* Center: zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ToolBtn onClick={() => reader.setZoom(reader.zoom - 0.1)} title="缩小"><IconMinus /></ToolBtn>
          <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 40, textAlign: 'center' }}>{Math.round(reader.zoom * 100)}%</span>
          <ToolBtn onClick={() => reader.setZoom(reader.zoom + 0.1)} title="放大"><IconPlus /></ToolBtn>
          <ToolBtn onClick={() => reader.setZoom(1)} title="适合页面"><IconFit /></ToolBtn>
        </div>

        <div style={S.divider} />

        {/* Center: page nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <ToolBtn onClick={() => handlePageChange(reader.currentPage - 1)} disabled={reader.currentPage <= 1}><IconChevronLeft /></ToolBtn>
          <input
            type="text"
            value={pageInputValue}
            onChange={(e) => setPageInputValue(e.target.value)}
            onBlur={handlePageInputSubmit}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePageInputSubmit() }}
            style={{ width: 40, textAlign: 'center', fontSize: 12, background: 'var(--surface2, #262624)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--fg)', outline: 'none', padding: '2px 0' }}
          />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>/ {totalPages}</span>
          <ToolBtn onClick={() => handlePageChange(reader.currentPage + 1)} disabled={reader.currentPage >= totalPages}><IconChevronRight /></ToolBtn>
        </div>

        <div style={{ flex: 1 }} />

        {/* Right */}
        <div style={S.divider} />
        <ToolBtn onClick={reader.toggleParsePanel} active={showParsePanel} style={{ border: '1px solid var(--accent)', padding: '5px 12px' }}>
          解析面板
        </ToolBtn>
        <ToolBtn onClick={reader.toggleQaPanel} active={showQAPanel} style={{ background: showQAPanel ? 'var(--accent)' : 'var(--accent)', color: '#fff', padding: '5px 12px' }}>
          问答
        </ToolBtn>
      </header>

      {/* ═══════ Main Content ═══════ */}
      <div ref={containerRef} style={S.main}>
        {/* ─── PDF Panel (with TOC overlay) ─── */}
        <div style={{ width: pdfPanelW, minWidth: pdfPanelW, display: 'flex', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
          {/* ─── TOC Toggle Button (always visible) ─── */}
          <button
            onClick={reader.toggleToc}
            style={{
              position: 'absolute',
              left: 12,
              top: 12,
              width: 36,
              height: 36,
              borderRadius: 8,
              border: 'none',
              background: reader.tocOpen ? 'var(--accent)' : 'rgba(0,0,0,0.5)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 11,
              transition: 'all 0.2s',
              backdropFilter: 'blur(4px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
            onMouseEnter={(e) => {
              if (!reader.tocOpen) {
                e.currentTarget.style.background = 'rgba(0,0,0,0.7)'
              }
            }}
            onMouseLeave={(e) => {
              if (!reader.tocOpen) {
                e.currentTarget.style.background = 'rgba(0,0,0,0.5)'
              }
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="15" y2="6" />
              <line x1="3" y1="12" x2="15" y2="12" />
              <line x1="3" y1="18" x2="15" y2="18" />
              <line x1="19" y1="6" x2="19.01" y2="6" />
              <line x1="19" y1="12" x2="19.01" y2="12" />
              <line x1="19" y1="18" x2="19.01" y2="18" />
            </svg>
          </button>

          {/* ─── TOC Sidebar (overlay) ─── */}
          {reader.tocOpen && (
            <aside style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 260,
              background: 'var(--surface)',
              borderRight: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 10,
              boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
            }}>
              <div style={{ ...S.tocHeader, justifyContent: 'flex-end' }}>
                <button style={S.iconBtn} onClick={reader.toggleToc}><IconClose /></button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
                {reader.parseStatus?.parse_status === 'parsing' ? (
                  <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--stone)', textAlign: 'center' }}>
                    <div style={{ marginBottom: 8 }}>📄</div>
                    解析中...<br /><span style={{ fontSize: 11 }}>请稍后再试</span>
                  </div>
                ) : reader.pages.length > 0 ? (
                  (() => {
                    const allHeadings = reader.pages.flatMap((page) =>
                      (page.headings || []).map((h, i) => ({ ...h, page_number: page.page_number, index: i }))
                    )
                    if (allHeadings.length === 0) {
                      return (
                        <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--stone)', textAlign: 'center' }}>
                          <div style={{ marginBottom: 8 }}>📋</div>
                          暂无标题<br /><span style={{ fontSize: 11 }}>该论文未检测到章节标题</span>
                        </div>
                      )
                    }
                    return allHeadings.map((h) => (
                      <div
                        key={`${h.page_number}-${h.index}`}
                        style={{
                          ...S.tocItem,
                          paddingLeft: h.level === 1 ? 14 : h.level === 2 ? 28 : 42,
                        }}
                        onClick={() => handlePageChange(h.page_number)}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2, #262624)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.text}</span>
                        <span style={{ fontSize: 10, color: 'var(--stone)', padding: '1px 6px', borderRadius: 3, background: 'var(--surface3, #30302e)', marginLeft: 6 }}>{h.page_number}</span>
                      </div>
                    ))
                  })()
                ) : (
                  <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--stone)', textAlign: 'center' }}>
                    <div style={{ marginBottom: 8 }}>📄</div>
                    暂无目录<br /><span style={{ fontSize: 11 }}>请先解析论文</span>
                  </div>
                )}
              </div>
            </aside>
          )}

          <PDFViewer
            pdfUrl={pdfUrl}
            currentPage={reader.currentPage}
            zoom={reader.zoom}
            onPageChange={handlePageChange}
            onZoomChange={reader.setZoom}
            totalPages={totalPages}
          />
        </div>

        {/* ─── Parse Resize Handle ─── */}
        {showParsePanel && (
          <ResizableHandle
            visible={true}
            width={parsePanelW}
            onWidthChange={handleParseWidthChange}
            onCollapse={reader.toggleParsePanel}
            minWidth={280}
            maxWidth={typeof window !== 'undefined' ? window.innerWidth * 0.65 : 900}
          />
        )}

        {/* ─── Parse Panel ─── */}
        {showParsePanel && (
          <aside
            style={{
              width: parsePanelW,
              minWidth: parsePanelW,
              background: 'var(--surface)',
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {/* Parse header */}
            <div style={S.parseHeader}>
              <span>解析内容</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {/* Engine switcher */}
                <button
                  style={{
                    ...S.iconBtn,
                    color: reader.parsing ? 'var(--coral)' : 'var(--accent)',
                    fontSize: 12,
                    width: 'auto',
                    padding: '4px 8px',
                    gap: 4,
                    display: 'flex',
                    alignItems: 'center',
                    border: `1px solid ${reader.parsing ? 'var(--coral)' : 'var(--accent)'}`,
                    borderRadius: 6,
                  }}
                  onClick={() => setShowEngineModal(true)}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(201,100,66,0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  title="切换解析引擎"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  {reader.parsing ? '解析中' : reader.selectedEngine}
                </button>

                {isParsed && reader.pages.length > 0 && (
                  <button
                    style={{
                      ...S.iconBtn,
                      color: 'var(--muted)',
                      fontSize: 12,
                      width: 'auto',
                      padding: '4px 8px',
                      gap: 4,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    onClick={() => setShowFullMarkdown(true)}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--fg)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted)'}
                    title="查看完整文档"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    全文
                  </button>
                )}
                <button style={S.iconBtn} onClick={reader.toggleParsePanel}><IconClose /></button>
              </div>
            </div>

            {/* Parse body — scrollable, all pages */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {reader.parsing ? (
                <ParseLoading engineName={reader.selectedEngine} />
              ) : reader.parseStatus?.parse_status === 'failed' ? (
                /* 解析失败状态 */
                <div style={{
                  padding: '24px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--error, #ef4444)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--error, #ef4444)' }}>
                      解析失败
                    </span>
                  </div>
                  {reader.parseStatus?.job?.error_message && (
                    <div style={{
                      padding: '10px 12px',
                      background: 'var(--surface2, #262624)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: 'var(--muted)',
                      lineHeight: 1.6,
                      maxHeight: '200px',
                      overflow: 'auto',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {reader.parseStatus.job.error_message}
                    </div>
                  )}
                  <button
                    onClick={() => setShowEngineModal(true)}
                    style={{
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: 500,
                      borderRadius: '6px',
                      border: 'none',
                      background: 'var(--accent)',
                      color: '#fff',
                      cursor: 'pointer',
                      alignSelf: 'flex-start',
                    }}
                  >
                    重新选择引擎
                  </button>
                </div>
              ) : isParsed && reader.pages.length > 0 ? (
                reader.pages.map((page) => {
                  const pageTranslation = reader.translations[page.page_number]
                  return (
                    <ParsePageChunk
                      key={page.page_number}
                      page={page}
                      paperId={reader.paper!.id}
                      translation={pageTranslation}
                      onTranslate={() => handleTranslatePage(page.page_number)}
                      onRetranslate={() => handleTranslatePage(page.page_number, true)}
                      translating={translatingPage === page.page_number}
                    />
                  )
                })
              ) : (
                <div style={{
                  padding: '32px 14px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--stone)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                    尚未解析<br />
                    <span style={{ fontSize: 11, color: 'var(--stone)' }}>选择解析引擎以提取 Markdown 内容</span>
                  </div>
                  <button
                    onClick={() => setShowEngineModal(true)}
                    style={{
                      padding: '6px 16px',
                      fontSize: 12,
                      fontWeight: 500,
                      borderRadius: 6,
                      border: '1px solid var(--accent)',
                      background: 'transparent',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                    }}
                  >
                    选择引擎
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* ─── QA Resize Handle ─── */}
        {showQAPanel && (
          <ResizableHandle
            visible={true}
            width={qaPanelW}
            onWidthChange={handleQAWidthChange}
            onCollapse={reader.toggleQaPanel}
            minWidth={280}
            maxWidth={typeof window !== 'undefined' ? window.innerWidth * 0.8 : 1000}
          />
        )}

        {/* ─── Q&A Panel ─── */}
        {showQAPanel && (
          <QAPanel
            open={true}
            width={qaPanelW}
            onClose={reader.toggleQaPanel}
            paperId={reader.paper.id}
            models={models}
            activeModelId={qa.activeModelId}
            onSwitchModel={(modelId) => { qa.switchModel(modelId); showToast(`已切换到 ${models.find(m => m.id === modelId)?.name || modelId}`) }}
            messages={qa.messages}
            streaming={qa.streaming}
            streamingContent={qa.streamingContent}
            attachedImages={qa.attachedImages}
            onSendMessage={handleSendMessage}
            onStopGeneration={qa.stopGeneration}
            onNewConversation={handleNewConversation}
            onAddImage={qa.addImage}
            onRemoveImage={qa.removeImage}
            onClearImages={qa.clearImages}
          />
        )}
      </div>

      {/* ═══════ Engine Modal ═══════ */}
      <EngineModal
        open={showEngineModal}
        onClose={() => setShowEngineModal(false)}
        engines={engines.length > 0 ? engines : [
          { name: 'pymupdf', available: true, version: '1.24.0', description: '轻量级文本提取，无需 ML 模型', install_size_mb: 15, built_in: true },
          { name: 'marker', available: false, version: null, description: '高质量 PDF→Markdown，支持表格/公式/图片', install_size_mb: 1500, built_in: false },
          { name: 'mineru', available: false, version: null, description: '高质量 PDF 解析，支持复杂版面/公式/表格', install_size_mb: 2000, built_in: false },
        ]}
        selectedEngine={reader.selectedEngine}
        onSelect={reader.setSelectedEngine}
        onStartParse={handleStartParse}
        parsing={reader.parsing}
        cachedEngines={reader.parseStatus?.cached_engines}
        totalPages={reader.paper?.total_pages}
        onRecheck={handleRecheckEngines}
      />

      {/* Full Markdown Document Modal */}
      <FullMarkdownModal
        open={showFullMarkdown}
        onClose={() => setShowFullMarkdown(false)}
        pages={reader.pages}
        paperId={reader.paper?.id || ''}
        paperTitle={reader.paper?.title || ''}
      />

      {/* Animations */}
      <style>{`
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      `}</style>
    </div>
  )
}

/* ─────────── Styles ─────────── */

const S = {
  root: {
    display: 'flex', flexDirection: 'column' as const, height: '100vh',
    background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--font-sans)',
  },
  toolbar: {
    height: 44, minHeight: 44, display: 'flex', alignItems: 'center',
    padding: '0 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
    gap: 8, flexShrink: 0,
  },
  main: {
    flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' as const,
  },
  divider: {
    width: 1, height: 20, background: 'var(--border)', margin: '0 4px', flexShrink: 0,
  },
  tocHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--fg2)',
  },
  tocItem: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--muted)',
    transition: 'background 0.15s, color 0.15s', lineHeight: 1.4,
  },
  parseHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--fg2)',
  },
  iconBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, borderRadius: 4, border: 'none',
    background: 'transparent', color: 'var(--stone)', cursor: 'pointer', fontSize: 14,
  },
  accentBtn: {
    padding: '6px 16px', borderRadius: 6, border: '1px solid var(--accent)',
    background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 13,
  },
} as const
