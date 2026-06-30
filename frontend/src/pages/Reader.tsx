import { useState, useEffect, useCallback, useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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
import { Modal } from '@/components/Modal'
import { useTextSelection } from '@/hooks/useTextSelection'
import { useDoubleClick } from '@/hooks/useDoubleClick'
import { papers, system, highlights as highlightsApi, glossary as glossaryApi, notes as notesApi, bookmarks as bookmarksApi } from '@/api/client'
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

/* ─────────── Highlight rendering ─────────── */

/**
 * 在 markdown 原文中标记高亮文本（用 <mark> 包裹）。
 * 只处理非 HTML 标签的文本段，避免破坏 markdown 结构。
 * 译文不受影响（调用方仅在显示原文时使用）。
 */
function applyHighlights(markdown: string, highlights: Array<{ text: string; color: string }>): string {
  if (!highlights.length) return markdown
  // 按长度降序，避免短文本替换破坏长文本
  const sorted = [...highlights].sort((a, b) => b.text.length - a.text.length)
  // 按 HTML 标签拆分，只处理文本段
  const segments = markdown.split(/(<[^>]+>)/)

  for (const hl of sorted) {
    if (!hl.text || hl.text.length < 3) continue
    if (hl.text.includes('<') || hl.text.includes('>')) continue
    const markTag = `<mark style="background-color:${hl.color};padding:1px 2px;border-radius:2px;color:inherit;">${hl.text}</mark>`
    for (let i = 0; i < segments.length; i++) {
      // 跳过 HTML 标签段
      if (segments[i].startsWith('<') && segments[i].endsWith('>')) continue
      if (segments[i].includes(hl.text)) {
        segments[i] = segments[i].split(hl.text).join(markTag)
      }
    }
  }
  return segments.join('')
}

/* ─────────── Parse Page Chunk Component ─────────── */

function ParsePageChunk({
  page,
  paperId,
  translation,
  onTranslate,
  onRetranslate,
  translating,
  highlights,
}: {
  page: ParsedPage
  paperId: string
  translation: string | undefined
  onTranslate: () => void
  onRetranslate: () => void
  translating: boolean
  highlights: Array<{ text: string; color: string }>
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
    <div data-page-num={page.page_number} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
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
        <MarkdownRenderer content={applyHighlights(page.markdown, highlights)} paperId={paperId} />
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
  const [bookmarks, setBookmarks] = useState<Array<{ id: string; page_number: number; title: string | null; note: string | null; created_at: string }>>([])
  const [tocTab, setTocTab] = useState<'outline' | 'bookmarks'>('outline')
  // Notes sidebar
  const [notesPanelOpen, setNotesPanelOpen] = useState(() => { try { return localStorage.getItem('paperlens:notesPanelOpen') === '1' } catch { return false } })
  const [notesPanelW, setNotesPanelW] = useState(() => { try { const v = localStorage.getItem('paperlens:notesPanelW'); return v ? Number(v) : 320 } catch { return 320 } })
  const [notesTab, setNotesTab] = useState<'notes' | 'glossary'>('notes')
  const [notesList, setNotesList] = useState<Array<{ id: string; page_number: number; content: string; cited_text: string | null; color: string; created_at: string }>>([])
  const [glossaryList, setGlossaryList] = useState<Array<{ id: string; term: string; phonetic: string | null; translation: string; explanation: string | null; is_pinned: boolean; lookup_count: number }>>([])
  // Highlights
  const [highlightsList, setHighlightsList] = useState<Array<{ id: string; page_number: number; text: string; color: string; note: string | null }>>([])
  // Custom modals (replace native prompt)
  const [noteModal, setNoteModal] = useState<{ text: string; pageNum: number } | null>(null)
  const [noteInput, setNoteInput] = useState('')
  const [bookmarkModalOpen, setBookmarkModalOpen] = useState(false)
  const [bookmarkInput, setBookmarkInput] = useState('')
  // Export modal
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<'markdown' | 'pdf'>('markdown')
  const [exportIncludeTranslation, setExportIncludeTranslation] = useState(false)

  // Selection interaction (parse panel)
  const parseScrollRef = useRef<HTMLDivElement>(null)
  const [termPopup, setTermPopup] = useState<{ word: string; rect: { top: number; left: number }; data: any | null; loading: boolean } | null>(null)

  // 依赖 reader.parsePanelOpen：面板打开时回调身份变化，触发 hook 重新绑定事件
  const handleSelection = useCallback((_sel: { text: string; rect: any; pageNum: number | null } | null) => {
    // selection state is tracked by the hook's returned `selection` value
  }, [reader.parsePanelOpen])

  const { selection, clearSelection } = useTextSelection(parseScrollRef, handleSelection)

  const handleDoubleClickWord = useCallback(async (result: { word: string; rect: { top: number; left: number } }) => {
    if (!reader.paper) return
    setTermPopup({ word: result.word, rect: result.rect, data: null, loading: true })
    try {
      const data = await glossaryApi.lookup(result.word, reader.paper.id)
      setTermPopup({ word: result.word, rect: result.rect, data, loading: false })
      // 刷新术语表面板（如果已打开）
      if (notesPanelOpen) {
        glossaryApi.getPaperGlossary(reader.paper.id).then((res) => setGlossaryList(res.items as any)).catch(() => {})
      }
    } catch {
      setTermPopup({ word: result.word, rect: result.rect, data: null, loading: false })
    }
  }, [reader.paper, reader.parsePanelOpen, notesPanelOpen])

  const { result: doubleClickResult, clearResult: clearDoubleClick } = useDoubleClick(parseScrollRef, handleDoubleClickWord)

  // Trigger double-click lookup
  useEffect(() => {
    if (doubleClickResult) {
      handleDoubleClickWord(doubleClickResult)
    }
  }, [doubleClickResult, handleDoubleClickWord])

  // Highlight actions
  const handleCreateHighlight = useCallback(async (text: string, pageNum: number | null, color: string) => {
    if (!reader.paper || !pageNum) return
    const engine = reader.currentEngine || reader.selectedEngine
    try {
      await highlightsApi.create({
        paper_id: reader.paper.id,
        page_number: pageNum,
        text,
        color,
        engine,
      })
      // 刷新高亮列表以在正文中显示标记
      const res = await highlightsApi.list(reader.paper.id, undefined, engine)
      setHighlightsList(res.items)
      showToast('已添加高亮')
    } catch {
      showToast('添加高亮失败')
    }
    clearSelection()
  }, [reader.paper, reader.currentEngine, reader.selectedEngine, showToast, clearSelection])

  // Note action from selection — 打开自定义弹窗而非原生 prompt
  const handleCreateNoteFromSelection = useCallback((text: string, pageNum: number | null) => {
    if (!reader.paper || !pageNum) return
    setNoteInput('')
    setNoteModal({ text, pageNum })
    // 不在这里 clearSelection，等弹窗确认/取消后再清
  }, [reader.paper])

  // 确认添加笔记
  const handleConfirmNote = useCallback(async () => {
    if (!noteModal || !reader.paper) return
    const { text, pageNum } = noteModal
    const content = noteInput.trim()
    const engine = reader.currentEngine || reader.selectedEngine
    if (!content) { showToast('请输入笔记内容'); return }
    try {
      await notesApi.create({
        paper_id: reader.paper.id,
        page_number: pageNum,
        content,
        cited_text: text,
        engine,
      })
      showToast('已添加笔记')
      if (notesPanelOpen) {
        const res = await notesApi.list(reader.paper.id, undefined, engine)
        setNotesList(res.items as any)
      }
    } catch {
      showToast('添加笔记失败')
    }
    setNoteModal(null)
    setNoteInput('')
    clearSelection()
  }, [noteModal, reader.paper, reader.currentEngine, reader.selectedEngine, noteInput, showToast, notesPanelOpen, clearSelection])

  // Term lookup from selection
  const handleLookupTerm = useCallback(async (text: string) => {
    if (!reader.paper) return
    const rect = selection?.rect
    if (!rect) return
    setTermPopup({ word: text, rect: { top: rect.top, left: rect.left }, data: null, loading: true })
    try {
      const data = await glossaryApi.lookup(text, reader.paper.id)
      setTermPopup({ word: text, rect: { top: rect.top, left: rect.left }, data, loading: false })
      // 刷新术语表面板（如果已打开）
      if (notesPanelOpen) {
        glossaryApi.getPaperGlossary(reader.paper.id).then((res) => setGlossaryList(res.items as any)).catch(() => {})
      }
    } catch {
      setTermPopup({ word: text, rect: { top: rect.top, left: rect.left }, data: null, loading: false })
    }
    clearSelection()
  }, [reader.paper, selection, clearSelection, notesPanelOpen])

  // ── 加载策略：PDF 优先，同时检测后台解析状态 ──
  useEffect(() => {
    if (!id) return
    reader.loadPaper(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // 进入 Reader 后始终检查解析状态（检测后台解析/翻译进度，自动恢复面板）
  useEffect(() => {
    if (reader.paper) {
      reader.loadParseData(reader.paper.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader.paper?.id])

  // Sync page input
  useEffect(() => { setPageInputValue(String(reader.currentPage)) }, [reader.currentPage])

  // Determine layout (must be before effects that use these variables)
  const isParsed = reader.parseStatus?.parse_status === 'parsed' || reader.pages.length > 0
  const showParsePanel = reader.parsePanelOpen || reader.parsing
  const showQAPanel = reader.qaPanelOpen

  // 当打开解析面板时，加载完整解析数据
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

  // Resizable panel widths (persisted to localStorage)
  const [parsePanelW, setParsePanelW] = useState(() => {
    const saved = localStorage.getItem('paperlens:parsePanelW')
    return saved ? Number(saved) : 420
  })
  const [qaPanelW, setQaPanelW] = useState(() => {
    const saved = localStorage.getItem('paperlens:qaPanelW')
    return saved ? Number(saved) : 380
  })
  const containerRef = useRef<HTMLDivElement>(null)

  // Persist panel widths
  useEffect(() => { localStorage.setItem('paperlens:parsePanelW', String(parsePanelW)) }, [parsePanelW])
  useEffect(() => { localStorage.setItem('paperlens:qaPanelW', String(qaPanelW)) }, [qaPanelW])

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

  // 翻译操作 — 翻译状态从 store 的 translatingPages 派生（不依赖局部 state）
  const handleTranslatePage = useCallback(async (pageNumber: number, force = false) => {
    if (!reader.paper) return
    
    const engine = reader.currentEngine || 'pymupdf'
    const pageKey = `${reader.paper.id}:${pageNumber}:${engine}`
    
    // 检查是否已经在后台翻译中
    if (reader.translatingPages.has(pageKey) && !force) {
      showToast(`第 ${pageNumber} 页正在后台翻译中...`)
      return
    }
    
    showToast(`开始翻译第 ${pageNumber} 页，可在后台继续浏览`)
    
    // 启动后台翻译（不阻塞）
    reader.translateCurrentPage(undefined, pageNumber, force)
  }, [reader, showToast])

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

  // Load bookmarks when paper changes
  useEffect(() => {
    if (!reader.paper) { setBookmarks([]); return }
    bookmarksApi.list(reader.paper.id).then((res) => setBookmarks(res.items)).catch(() => {})
  }, [reader.paper?.id])

  // Load highlights when paper changes or engine switches
  useEffect(() => {
    if (!reader.paper) { setHighlightsList([]); return }
    const engine = reader.currentEngine || reader.selectedEngine
    highlightsApi.list(reader.paper.id, undefined, engine).then((res) => setHighlightsList(res.items)).catch(() => {})
  }, [reader.paper?.id, reader.currentEngine, reader.selectedEngine])

  // Add bookmark — 打开自定义弹窗
  const handleAddBookmark = useCallback(() => {
    if (!reader.paper) return
    setBookmarkInput('')
    setBookmarkModalOpen(true)
  }, [reader.paper])

  // 确认添加书签
  const handleConfirmBookmark = useCallback(async () => {
    if (!reader.paper) return
    const title = bookmarkInput.trim() || `第 ${reader.currentPage} 页`
    try {
      await bookmarksApi.create({
        paper_id: reader.paper.id,
        page_number: reader.currentPage,
        title,
      })
      const res = await bookmarksApi.list(reader.paper.id)
      setBookmarks(res.items)
      showToast('已添加书签')
    } catch {
      showToast('添加书签失败')
    }
    setBookmarkModalOpen(false)
    setBookmarkInput('')
  }, [reader.paper, reader.currentPage, bookmarkInput, showToast])

  // Delete bookmark
  const handleDeleteBookmark = useCallback(async (bookmarkId: string) => {
    try {
      await bookmarksApi.delete(bookmarkId)
      if (reader.paper) {
        const res = await bookmarksApi.list(reader.paper.id)
        setBookmarks(res.items)
      }
    } catch {
      showToast('删除书签失败')
    }
  }, [reader.paper, showToast])

  // ── 导出功能 ──
  // 在 markdown 原文中标记高亮（导出用，用 <mark> 标签）
  const applyHighlightsForExport = useCallback((markdown: string, pageHighlights: Array<{ text: string; color: string }>): string => {
    if (!pageHighlights.length) return markdown
    const sorted = [...pageHighlights].sort((a, b) => b.text.length - a.text.length)
    const segments = markdown.split(/(<[^>]+>)/)
    for (const hl of sorted) {
      if (!hl.text || hl.text.length < 3) continue
      if (hl.text.includes('<') || hl.text.includes('>')) continue
      const markTag = `<mark style="background-color:${hl.color}">${hl.text}</mark>`
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].startsWith('<') && segments[i].endsWith('>')) continue
        if (segments[i].includes(hl.text)) {
          segments[i] = segments[i].split(hl.text).join(markTag)
        }
      }
    }
    return segments.join('')
  }, [])

  const handleExport = useCallback(async () => {
    if (!reader.paper || reader.pages.length === 0) {
      showToast('没有可导出的内容')
      return
    }

    const paper = reader.paper
    const pages = reader.pages
    const highlights = highlightsList
    const notes = notesList
    const translations = exportIncludeTranslation ? reader.translations : {}
    const safeTitle = paper.title.replace(/[<>:"/\\|?*]/g, '_')

    // ===== 构建导出 markdown（用于 .md 导出）=====
    const lines: string[] = []
    lines.push(`# ${paper.title}`)
    lines.push('')
    if (paper.authors && paper.authors.length > 0) {
      lines.push(`> **作者**: ${paper.authors.join(', ')}`)
    }
    if (paper.year) lines.push(`> **年份**: ${paper.year}`)
    if (paper.venue) lines.push(`> **会议**: ${paper.venue}`)
    lines.push(`> **导出时间**: ${new Date().toLocaleString('zh-CN')}`)
    if (highlights.length > 0) lines.push(`> **高亮数**: ${highlights.length}`)
    if (notes.length > 0) lines.push(`> **笔记数**: ${notes.length}`)
    lines.push('')
    lines.push('---')
    lines.push('')

    for (const page of pages) {
      lines.push(`## 第 ${page.page_number} 页`)
      lines.push('')
      const pageHighlights = highlights.filter((h) => h.page_number === page.page_number)
      const contentWithHighlights = applyHighlightsForExport(page.markdown, pageHighlights)
      lines.push(contentWithHighlights)
      lines.push('')
      const pageNotes = notes.filter((n) => n.page_number === page.page_number)
      for (const note of pageNotes) {
        lines.push('> 📝 **笔记**')
        lines.push('>')
        if (note.cited_text) { lines.push(`> > 引文: ${note.cited_text}`); lines.push('>') }
        lines.push(`> ${note.content}`)
        lines.push('')
      }
      lines.push('---')
      lines.push('')
    }

    if (exportIncludeTranslation && Object.keys(translations).length > 0) {
      lines.push('# 附：中文翻译')
      lines.push('')
      for (const page of pages) {
        const translation = translations[page.page_number]
        if (translation) {
          lines.push(`## 第 ${page.page_number} 页译文`)
          lines.push('')
          lines.push(translation)
          lines.push('')
          lines.push('---')
          lines.push('')
        }
      }
    }

    const markdownContent = lines.join('\n')

    if (exportFormat === 'markdown') {
      // ===== Markdown 导出 =====
      const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeTitle}_批注.md`
      a.click()
      URL.revokeObjectURL(url)
      showToast(`已导出到下载文件夹：${safeTitle}_批注.md`)
    } else {
      // ===== HTML 导出（始终导出英文原文，保留完整格式，支持中英切换）=====
      // 用 renderToStaticMarkup 渲染 MarkdownRenderer，始终用 page.markdown（英文原文）
      // MarkdownRenderer 已在文件顶部导入

      // 渲染每页原文 HTML（应用高亮标记）
      const originalPagesHtml: string[] = []
      const translationPagesHtml: string[] = []
      let hasTranslations = false

      for (const page of pages) {
        const pageHighlights = highlights.filter((h) => h.page_number === page.page_number)
        const contentWithHighlights = applyHighlightsForExport(page.markdown, pageHighlights)
        const pageHtml = renderToStaticMarkup(
          <MarkdownRenderer content={contentWithHighlights} paperId={paper.id} />
        )
        originalPagesHtml.push(`<div class="page-section" data-page="${page.page_number}"><h2>第 ${page.page_number} 页</h2><div class="content">${pageHtml}</div></div>`)

        // 译文（如果有）
        const translation = translations[page.page_number]
        if (translation) {
          hasTranslations = true
          const transHtml = renderToStaticMarkup(
            <MarkdownRenderer content={translation} paperId={paper.id} />
          )
          translationPagesHtml.push(`<div class="page-section" data-page="${page.page_number}"><h2>第 ${page.page_number} 页译文</h2><div class="content">${transHtml}</div></div>`)
        }
      }

      // 构建笔记数据（按页分组）
      const notesByPage: Record<number, Array<{ content: string; cited_text: string | null; color: string }>> = {}
      for (const note of notes) {
        if (!notesByPage[note.page_number]) notesByPage[note.page_number] = []
        notesByPage[note.page_number].push({ content: note.content, cited_text: note.cited_text, color: note.color })
      }

      const showTranslationSection = exportIncludeTranslation && hasTranslations

      const fullHtml = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${paper.title} - 批注导出</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; background: #f5f4ed; color: #333; line-height: 1.8; }
  .container { display: flex; max-width: 1200px; margin: 0 auto; min-height: 100vh; }
  .main { flex: 1; padding: 40px; background: #fff; box-shadow: 0 0 8px rgba(0,0,0,0.06); }
  .sidebar { width: 280px; flex-shrink: 0; padding: 40px 24px; background: #faf9f5; border-left: 1px solid #e8e6dc; }
  .paper-header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #c96442; }
  .paper-header h1 { font-size: 22px; color: #141413; margin-bottom: 8px; }
  .paper-header .meta { font-size: 13px; color: #87867f; line-height: 1.6; }
  /* 切换按钮 */
  .lang-switch { display: flex; gap: 8px; margin-bottom: 24px; }
  .lang-switch button { padding: 6px 16px; font-size: 13px; font-weight: 500; border: 1px solid #ddd; border-radius: 20px; background: #fff; color: #87867f; cursor: pointer; transition: all 0.2s; }
  .lang-switch button.active { background: #c96442; color: #fff; border-color: #c96442; }
  /* 内容区 */
  .content-original { display: block; }
  .content-translation { display: none; }
  .page-section { margin-bottom: 32px; }
  .page-section h2 { font-size: 14px; color: #c96442; margin-bottom: 12px; padding-bottom: 4px; border-bottom: 1px solid #f0eee6; }
  .page-section .content { font-size: 14px; color: #333; }
  .page-section .content p { margin: 8px 0; }
  .page-section .content h1, .page-section .content h2, .page-section .content h3 { margin: 16px 0 8px; }
  .page-section .content h1 { font-size: 18px; }
  .page-section .content h2 { font-size: 16px; }
  .page-section .content h3 { font-size: 14px; }
  .page-section .content table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  .page-section .content th, .page-section .content td { border: 1px solid #ddd; padding: 6px 10px; font-size: 13px; }
  .page-section .content img { max-width: 100%; border-radius: 4px; margin: 8px 0; }
  .page-section .content pre { background: #f5f4ed; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
  .page-section .content code { background: #f5f4ed; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
  .page-section .content blockquote { border-left: 3px solid #c96442; margin: 12px 0; padding: 8px 16px; background: #faf9f5; color: #555; }
  mark { padding: 1px 2px; border-radius: 2px; }
  /* 侧边批注 */
  .sidebar h3 { font-size: 14px; color: #c96442; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e8e6dc; }
  .note-item { margin-bottom: 16px; padding: 10px 12px; background: #fff; border-radius: 8px; border-left: 3px solid #fbbf24; font-size: 12px; }
  .note-item .note-page { font-size: 10px; color: #87867f; margin-bottom: 4px; font-weight: 600; }
  .note-item .note-cited { font-size: 11px; color: #87867f; font-style: italic; margin-bottom: 4px; padding: 4px 8px; background: #f5f4ed; border-radius: 4px; }
  .note-item .note-content { color: #4d4c48; line-height: 1.5; }
  @media print { .sidebar { display: none; } .main { box-shadow: none; } body { background: #fff; } .lang-switch { display: none; } }
</style>
</head>
<body>
<div class="container">
  <div class="main">
    <div class="paper-header">
      <h1>${paper.title}</h1>
      <div class="meta">
        ${paper.authors ? `作者: ${paper.authors.join(', ')}<br>` : ''}
        ${paper.year ? `年份: ${paper.year}<br>` : ''}
        ${paper.venue ? `会议: ${paper.venue}<br>` : ''}
        导出时间: ${new Date().toLocaleString('zh-CN')}<br>
        高亮: ${highlights.length} 处 | 笔记: ${notes.length} 条
      </div>
    </div>
    ${showTranslationSection ? `
    <div class="lang-switch">
      <button id="btn-original" class="active" onclick="switchLang('original')">英文原文</button>
      <button id="btn-translation" onclick="switchLang('translation')">中文翻译</button>
    </div>` : ''}
    <div class="content-original" id="content-original">
      ${originalPagesHtml.join('')}
    </div>
    ${showTranslationSection ? `
    <div class="content-translation" id="content-translation">
      ${translationPagesHtml.join('')}
    </div>` : ''}
  </div>
  <div class="sidebar">
    <h3>📝 批注 (${notes.length})</h3>
    <div id="notes-list"></div>
  </div>
</div>
<script>
  function switchLang(lang) {
    var orig = document.getElementById('content-original');
    var trans = document.getElementById('content-translation');
    var btnO = document.getElementById('btn-original');
    var btnT = document.getElementById('btn-translation');
    if (lang === 'original') {
      orig.style.display = 'block';
      trans.style.display = 'none';
      btnO.classList.add('active');
      btnT.classList.remove('active');
    } else {
      orig.style.display = 'none';
      trans.style.display = 'block';
      btnO.classList.remove('active');
      btnT.classList.add('active');
    }
  }
  // 笔记数据
  var notesByPage = ${JSON.stringify(notesByPage)};
  var notesListEl = document.getElementById('notes-list');
  if (notesListEl) {
    var sortedPages = Object.keys(notesByPage).map(Number).sort(function(a,b){return a-b});
    for (var pi = 0; pi < sortedPages.length; pi++) {
      var pageNum = sortedPages[pi];
      for (var ni = 0; ni < notesByPage[pageNum].length; ni++) {
        var note = notesByPage[pageNum][ni];
        var div = document.createElement('div');
        div.className = 'note-item';
        div.style.borderLeftColor = note.color || '#fbbf24';
        var html = '<div class="note-page">第 ' + pageNum + ' 页</div>';
        if (note.cited_text) {
          html += '<div class="note-cited">' + note.cited_text.replace(/</g, '&lt;') + '</div>';
        }
        html += '<div class="note-content">' + note.content.replace(/</g, '&lt;') + '</div>';
        div.innerHTML = html;
        notesListEl.appendChild(div);
      }
    }
    if (sortedPages.length === 0) {
      notesListEl.innerHTML = '<div style="font-size:12px;color:#87867f;text-align:center;padding:20px;">暂无笔记</div>';
    }
  }
</script>
</body>
</html>`

      // 下载 HTML 文件到下载文件夹
      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeTitle}_批注.html`
      a.click()
      URL.revokeObjectURL(url)
      showToast(`已导出到下载文件夹：${safeTitle}_批注.html`)
    }

    setExportModalOpen(false)
  }, [reader.paper, reader.pages, reader.translations, highlightsList, notesList, exportFormat, exportIncludeTranslation, applyHighlightsForExport, showToast])

  // Persist notes panel state
  const toggleNotesPanel = useCallback(() => {
    setNotesPanelOpen((prev) => {
      const next = !prev
      try { localStorage.setItem('paperlens:notesPanelOpen', next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }, [])
  useEffect(() => { try { localStorage.setItem('paperlens:notesPanelW', String(notesPanelW)) } catch { /* ignore */ } }, [notesPanelW])

  // Load notes and glossary when panel opens, paper changes, or engine switches
  useEffect(() => {
    if (!notesPanelOpen || !reader.paper) return
    const engine = reader.currentEngine || reader.selectedEngine
    notesApi.list(reader.paper.id, undefined, engine).then((res) => setNotesList(res.items as any)).catch(() => {})
    glossaryApi.getPaperGlossary(reader.paper.id).then((res) => setGlossaryList(res.items as any)).catch(() => {})
  }, [notesPanelOpen, reader.paper?.id, reader.currentEngine, reader.selectedEngine])

  // Delete note
  const handleDeleteNote = useCallback(async (noteId: string) => {
    try {
      await notesApi.delete(noteId)
      if (reader.paper) {
        const engine = reader.currentEngine || reader.selectedEngine
        const res = await notesApi.list(reader.paper.id, undefined, engine)
        setNotesList(res.items as any)
      }
    } catch { /* ignore */ }
  }, [reader.paper, reader.currentEngine, reader.selectedEngine])

  /* ─── Loading states ─── */

  if (reader.loading && !reader.paper) {
    return (
      <div style={S.root}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>加载中...</div>
      </div>
    )
  }
  if (!reader.paper) {
    return (
      <div style={S.root}>
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
    <div style={S.root}>
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
        <ToolBtn onClick={handleAddBookmark} title="添加书签" style={{ padding: '5px 10px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
          书签
        </ToolBtn>
        <ToolBtn onClick={toggleNotesPanel} active={notesPanelOpen} style={{ border: '1px solid var(--accent)', padding: '5px 12px' }}>
          笔记
        </ToolBtn>
        <ToolBtn onClick={reader.toggleParsePanel} active={showParsePanel} style={{ border: '1px solid var(--accent)', padding: '5px 12px' }}>
          解析面板
        </ToolBtn>
        <ToolBtn onClick={reader.toggleQaPanel} active={showQAPanel} style={{ background: showQAPanel ? 'var(--accent)' : 'transparent', color: showQAPanel ? '#fff' : 'var(--accent)', border: showQAPanel ? '1px solid var(--accent)' : '1px solid var(--accent)', padding: '5px 12px' }}>
          问答
        </ToolBtn>
      </header>

      {/* ═══════ Main Content ═══════ */}
      <div ref={containerRef} style={S.main}>
        {/* ─── PDF Panel (with TOC overlay) ─── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0, position: 'relative' }}>
          {/* ─── TOC Toggle Button (hidden when TOC is open to avoid overlap) ─── */}
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
              display: reader.tocOpen ? 'none' : 'flex',
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
              <div style={{ ...S.tocHeader, justifyContent: 'space-between' }}>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => setTocTab('outline')}
                    style={{
                      padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 4, border: 'none',
                      background: tocTab === 'outline' ? 'var(--surface3, #30302e)' : 'transparent',
                      color: tocTab === 'outline' ? 'var(--fg)' : 'var(--stone)', cursor: 'pointer',
                    }}
                  >
                    目录
                  </button>
                  <button
                    onClick={() => setTocTab('bookmarks')}
                    style={{
                      padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 4, border: 'none',
                      background: tocTab === 'bookmarks' ? 'var(--surface3, #30302e)' : 'transparent',
                      color: tocTab === 'bookmarks' ? 'var(--coral)' : 'var(--stone)', cursor: 'pointer',
                    }}
                  >
                    书签{bookmarks.length > 0 ? ` (${bookmarks.length})` : ''}
                  </button>
                </div>
                <button style={S.iconBtn} onClick={reader.toggleToc}><IconClose /></button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
                {tocTab === 'bookmarks' ? (
                  /* ─── Bookmarks tab ─── */
                  bookmarks.length > 0 ? (
                    bookmarks.map((bm) => (
                      <div
                        key={bm.id}
                        style={{
                          ...S.tocItem,
                          justifyContent: 'space-between',
                        }}
                        onClick={() => handlePageChange(bm.page_number)}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2, #262624)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bm.title || `第 ${bm.page_number} 页`}</span>
                          {bm.note && <span style={{ fontSize: 10, color: 'var(--stone)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bm.note}</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 10, color: 'var(--stone)', padding: '1px 6px', borderRadius: 3, background: 'var(--surface3, #30302e)' }}>P{bm.page_number}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteBookmark(bm.id) }}
                            style={{ background: 'none', border: 'none', color: 'var(--stone)', cursor: 'pointer', padding: '2px', fontSize: 12, lineHeight: 1 }}
                            title="删除书签"
                          >×</button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--stone)', textAlign: 'center' }}>
                      <div style={{ marginBottom: 8 }}>🔖</div>
                      暂无书签<br /><span style={{ fontSize: 11 }}>点击工具栏"书签"按钮添加</span>
                    </div>
                  )
                ) : reader.parseStatus?.parse_status === 'parsing' ? (
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
                {/* Export button */}
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
                    onClick={() => setExportModalOpen(true)}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--fg)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted)'}
                    title="导出批注"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    导出
                  </button>
                )}
                <button style={S.iconBtn} onClick={reader.toggleParsePanel}><IconClose /></button>
              </div>
            </div>

            {/* Parse body — scrollable, all pages */}
            <div ref={parseScrollRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
              {reader.parsing ? (
                <ParseLoading
                  engineName={reader.selectedEngine}
                  progress={reader.parseProgress}
                  pagesDone={reader.parsePagesDone}
                  totalPages={reader.parseTotalPages || totalPages}
                />
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
                  const pageKey = `${reader.paper!.id}:${page.page_number}:${reader.currentEngine || 'pymupdf'}`
                  const isTranslating = reader.translatingPages.has(pageKey)
                  return (
                    <ParsePageChunk
                      key={page.page_number}
                      page={page}
                      paperId={reader.paper!.id}
                      translation={pageTranslation}
                      onTranslate={() => handleTranslatePage(page.page_number)}
                      onRetranslate={() => handleTranslatePage(page.page_number, true)}
                      translating={isTranslating}
                      highlights={highlightsList.filter((h) => h.page_number === page.page_number)}
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

              {/* ─── Selection Popup (highlight / note / term) ─── */}
              {selection && selection.text && selection.rect && (
                <div
                  className="selection-popup"
                  data-no-clear
                  style={{
                    position: 'absolute',
                    top: selection.rect.top - 44,
                    left: selection.rect.left,
                    display: 'flex',
                    gap: 2,
                    background: 'var(--surface3, #30302e)',
                    borderRadius: 8,
                    padding: 4,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    zIndex: 20,
                  }}
                >
                  {/* Highlight colors */}
                  {['#fef08a', '#fca5a5', '#a5f3a5', '#a5c8ff', '#f5a5e8'].map((color) => (
                    <button
                      key={color}
                      data-no-clear
                      onClick={() => handleCreateHighlight(selection.text, selection.pageNum, color)}
                      style={{
                        width: 20, height: 20, borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)',
                        background: color, cursor: 'pointer', padding: 0,
                      }}
                      title="高亮"
                    />
                  ))}
                  {/* Note button */}
                  <button
                    data-no-clear
                    onClick={() => handleCreateNoteFromSelection(selection.text, selection.pageNum)}
                    style={{
                      padding: '2px 8px', fontSize: 11, borderRadius: 4, border: 'none',
                      background: 'transparent', color: 'var(--fg)', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                    title="添加笔记"
                  >
                    笔记
                  </button>
                  {/* Term lookup button */}
                  <button
                    data-no-clear
                    onClick={() => handleLookupTerm(selection.text)}
                    style={{
                      padding: '2px 8px', fontSize: 11, borderRadius: 4, border: 'none',
                      background: 'transparent', color: 'var(--coral)', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                    title="查术语"
                  >
                    查词
                  </button>
                  {/* Quote to QA button */}
                  <button
                    data-no-clear
                    onClick={() => {
                      qa.setPendingQuote(selection.text)
                      if (!reader.qaPanelOpen) reader.toggleQaPanel()
                      clearSelection()
                    }}
                    style={{
                      padding: '2px 8px', fontSize: 11, borderRadius: 4, border: 'none',
                      background: 'transparent', color: 'var(--focus)', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                    title="引用到问答"
                  >
                    引用
                  </button>
                </div>
              )}

              {/* ─── Term Popup (double-click / lookup result) ─── */}
              {termPopup && (
                <div
                  className="term-popup"
                  data-no-clear
                  style={{
                    position: 'absolute',
                    top: termPopup.rect.top + 20,
                    left: termPopup.rect.left,
                    background: 'var(--surface3, #30302e)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    maxWidth: 300,
                    minWidth: 200,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    zIndex: 21,
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--coral)' }}>{termPopup.word}</span>
                    <button
                      data-no-clear
                      onClick={() => { setTermPopup(null); clearDoubleClick() }}
                      style={{ background: 'none', border: 'none', color: 'var(--stone)', cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>
                  {termPopup.loading ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>查询中...</div>
                  ) : termPopup.data ? (
                    <div>
                      {termPopup.data.phonetic && (
                        <div style={{ fontSize: 11, color: 'var(--stone)', marginBottom: 4, fontFamily: 'monospace' }}>/{termPopup.data.phonetic}/</div>
                      )}
                      <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, marginBottom: 4 }}>{termPopup.data.translation}</div>
                      {termPopup.data.explanation && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{termPopup.data.explanation}</div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>未找到释义</div>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* ─── Notes Resize Handle ─── */}
        {notesPanelOpen && (
          <ResizableHandle
            visible={true}
            width={notesPanelW}
            onWidthChange={(w) => setNotesPanelW(Math.min(Math.max(w, 240), 500))}
            onCollapse={toggleNotesPanel}
            minWidth={240}
            maxWidth={500}
          />
        )}

        {/* ─── Notes Panel ─── */}
        {notesPanelOpen && (
          <aside
            style={{
              width: notesPanelW,
              minWidth: notesPanelW,
              background: 'var(--surface)',
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {/* Notes header with tabs */}
            <div style={{ ...S.parseHeader, gap: 4 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setNotesTab('notes')}
                  style={{
                    padding: '3px 10px', fontSize: 12, fontWeight: 500, borderRadius: 4, border: 'none',
                    background: notesTab === 'notes' ? 'var(--surface3, #30302e)' : 'transparent',
                    color: notesTab === 'notes' ? 'var(--fg)' : 'var(--stone)', cursor: 'pointer',
                  }}
                >
                  笔记{notesList.length > 0 ? ` (${notesList.length})` : ''}
                </button>
                <button
                  onClick={() => setNotesTab('glossary')}
                  style={{
                    padding: '3px 10px', fontSize: 12, fontWeight: 500, borderRadius: 4, border: 'none',
                    background: notesTab === 'glossary' ? 'var(--surface3, #30302e)' : 'transparent',
                    color: notesTab === 'glossary' ? 'var(--coral)' : 'var(--stone)', cursor: 'pointer',
                  }}
                >
                  术语表{glossaryList.length > 0 ? ` (${glossaryList.length})` : ''}
                </button>
              </div>
              <button style={S.iconBtn} onClick={toggleNotesPanel}><IconClose /></button>
            </div>

            {/* Notes/glossary body */}
            <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
              {notesTab === 'notes' ? (
                notesList.length > 0 ? (
                  notesList.map((note) => (
                    <div
                      key={note.id}
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        borderLeft: `3px solid ${note.color}`,
                      }}
                      onClick={() => handlePageChange(note.page_number)}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2, #262624)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--stone)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                        <span>第 {note.page_number} 页</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id) }}
                          style={{ background: 'none', border: 'none', color: 'var(--stone)', cursor: 'pointer', padding: 0, fontSize: 12 }}
                          title="删除笔记"
                        >×</button>
                      </div>
                      {note.cited_text && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 4, padding: '4px 8px', background: 'var(--surface2, #262624)', borderRadius: 4, borderLeft: `2px solid ${note.color}` }}>
                          {note.cited_text.length > 80 ? note.cited_text.slice(0, 80) + '...' : note.cited_text}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.5 }}>{note.content}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--stone)', textAlign: 'center' }}>
                    <div style={{ marginBottom: 8 }}>📝</div>
                    暂无笔记<br /><span style={{ fontSize: 11 }}>在解析面板选中文本添加笔记</span>
                  </div>
                )
              ) : (
                /* Glossary tab */
                glossaryList.length > 0 ? (
                  glossaryList.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--coral)' }}>{entry.term}</span>
                        {entry.is_pinned && <span style={{ fontSize: 10, color: 'var(--accent)' }}>★置顶</span>}
                      </div>
                      {entry.phonetic && <div style={{ fontSize: 11, color: 'var(--stone)', fontFamily: 'monospace', marginBottom: 2 }}>/{entry.phonetic}/</div>}
                      <div style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 500 }}>{entry.translation}</div>
                      {entry.explanation && <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, marginTop: 2 }}>{entry.explanation}</div>}
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--stone)', textAlign: 'center' }}>
                    <div style={{ marginBottom: 8 }}>📖</div>
                    暂无术语<br /><span style={{ fontSize: 11 }}>双击单词或选中文本查术语</span>
                  </div>
                )
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
            streamingThinking={qa.streamingThinking}
            pendingQuote={qa.pendingQuote}
            enableThinking={qa.enableThinking}
            onToggleThinking={qa.toggleThinking}
            onClearQuote={() => qa.setPendingQuote(null)}
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

      {/* ═══════ Note Modal (替代原生 prompt) ═══════ */}
      <Modal
        open={noteModal !== null}
        onClose={() => { setNoteModal(null); setNoteInput(''); clearSelection() }}
        title="添加笔记"
        footer={
          <>
            <button
              onClick={() => { setNoteModal(null); setNoteInput(''); clearSelection() }}
              style={{ padding: '8px 16px', background: 'var(--sand)', color: 'var(--fg)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              取消
            </button>
            <button
              onClick={handleConfirmNote}
              style={{ padding: '8px 16px', background: 'var(--accent)', color: 'var(--white)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              添加
            </button>
          </>
        }
      >
        {noteModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 引文预览 */}
            {noteModal.text && (
              <div style={{
                padding: '12px 14px',
                background: 'var(--surface2)',
                borderRadius: 8,
                borderLeft: '3px solid var(--accent)',
                fontSize: 13,
                color: 'var(--muted)',
                fontStyle: 'italic',
                lineHeight: 1.6,
                maxHeight: 120,
                overflow: 'auto',
              }}>
                {noteModal.text.length > 150 ? noteModal.text.slice(0, 150) + '...' : noteModal.text}
              </div>
            )}
            {/* 笔记输入 */}
            <textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              autoFocus
              placeholder="输入笔记内容..."
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleConfirmNote() }}
              style={{
                width: '100%',
                minHeight: 100,
                padding: '12px 14px',
                border: '1px solid var(--border2)',
                borderRadius: 8,
                fontSize: 14,
                color: 'var(--fg)',
                background: 'var(--surface)',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'var(--font-sans)',
                lineHeight: 1.6,
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border2)'}
            />
            <div style={{ fontSize: 11, color: 'var(--silver)' }}>Ctrl+Enter 快速添加</div>
          </div>
        )}
      </Modal>

      {/* ═══════ Bookmark Modal (替代原生 prompt) ═══════ */}
      <Modal
        open={bookmarkModalOpen}
        onClose={() => { setBookmarkModalOpen(false); setBookmarkInput('') }}
        title={`添加书签 · 第 ${reader.currentPage} 页`}
        footer={
          <>
            <button
              onClick={() => { setBookmarkModalOpen(false); setBookmarkInput('') }}
              style={{ padding: '8px 16px', background: 'var(--sand)', color: 'var(--fg)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              取消
            </button>
            <button
              onClick={handleConfirmBookmark}
              style={{ padding: '8px 16px', background: 'var(--accent)', color: 'var(--white)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              添加
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="text"
            value={bookmarkInput}
            onChange={(e) => setBookmarkInput(e.target.value)}
            autoFocus
            placeholder={`书签标题（可选，默认"第 ${reader.currentPage} 页"）`}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmBookmark() }}
            style={{
              width: '100%',
              padding: '10px 14px',
              border: '1px solid var(--border2)',
              borderRadius: 8,
              fontSize: 14,
              color: 'var(--fg)',
              background: 'var(--surface)',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border2)'}
          />
        </div>
      </Modal>

      {/* ═══════ Export Modal ═══════ */}
      <Modal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="导出批注"
        footer={
          <>
            <button
              onClick={() => setExportModalOpen(false)}
              style={{ padding: '8px 16px', background: 'var(--sand)', color: 'var(--fg)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              取消
            </button>
            <button
              onClick={handleExport}
              style={{ padding: '8px 16px', background: 'var(--accent)', color: 'var(--white)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              导出
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 格式选择 */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg2)', marginBottom: 10 }}>导出格式</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setExportFormat('markdown')}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                  border: exportFormat === 'markdown' ? '2px solid var(--accent)' : '1px solid var(--border2)',
                  background: exportFormat === 'markdown' ? 'rgba(201,100,66,0.05)' : 'var(--surface)',
                  display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={exportFormat === 'markdown' ? 'var(--accent)' : 'var(--muted)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span style={{ fontSize: 12, fontWeight: 500, color: exportFormat === 'markdown' ? 'var(--accent)' : 'var(--muted)' }}>Markdown</span>
              </button>
              <button
                onClick={() => setExportFormat('pdf')}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                  border: exportFormat === 'pdf' ? '2px solid var(--accent)' : '1px solid var(--border2)',
                  background: exportFormat === 'pdf' ? 'rgba(201,100,66,0.05)' : 'var(--surface)',
                  display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={exportFormat === 'pdf' ? 'var(--accent)' : 'var(--muted)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2H14l4 4v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" />
                  <path d="M14 2v4h4" />
                </svg>
                <span style={{ fontSize: 12, fontWeight: 500, color: exportFormat === 'pdf' ? 'var(--accent)' : 'var(--muted)' }}>HTML（网页）</span>
              </button>
            </div>
          </div>

          {/* 携带翻译 */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg2)', marginBottom: 8 }}>携带中文翻译</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => setExportIncludeTranslation(!exportIncludeTranslation)}
                style={{
                  width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                  background: exportIncludeTranslation ? 'var(--accent)' : 'var(--border2)',
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <div style={{
                  position: 'absolute', top: 2, left: exportIncludeTranslation ? 20 : 2,
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s',
                }} />
              </button>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                {exportIncludeTranslation ? '包含已翻译页面的中文译文' : '仅导出英文原文'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--silver)', marginTop: 6, lineHeight: 1.5 }}>
              开启后，已翻译的页面会在原文后附加中文译文。未翻译的页面不添加译文。
            </div>
          </div>

          {/* 导出内容预览 */}
          <div style={{
            padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8,
            fontSize: 12, color: 'var(--muted)', lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 500, color: 'var(--fg2)', marginBottom: 6 }}>导出内容包含：</div>
            <div>• 论文原文（按页排列，高亮文本用颜色标记）</div>
            {notesList.length > 0 && <div>• {notesList.length} 条笔记（作为批注附在对应页下方）</div>}
            {highlightsList.length > 0 && <div>• {highlightsList.length} 处高亮（用彩色背景标记）</div>}
            {exportIncludeTranslation && <div>• 已翻译页面的中文译文</div>}
          </div>
        </div>
      </Modal>

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
