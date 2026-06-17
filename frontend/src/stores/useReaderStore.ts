import { create } from 'zustand'
import { papers, parse, translate } from '@/api/client'
import type { Paper, ParsedPage, ParseStatus } from '@/api/types'

// 请求去重变量
let _pendingLoadPaper: Promise<void> | null = null
let _pendingLoadPaperId: string | null = null
let _pendingParseData: Promise<void> | null = null
let _pendingParseDataId: string | null = null
let _parseEventSource: EventSource | null = null
let _currentPaperId: string | null = null
let _readingPositionTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 重连解析 SSE — 当返回页面时后端仍在解析，自动恢复实时进度推送
 */
function _reconnectParseSSE(paperId: string, engine: string) {
  if (_parseEventSource) {
    _parseEventSource.close()
    _parseEventSource = null
  }

  useReaderStore.setState({ parsing: true })
  _parseEventSource = parse.stream(paperId)

  _parseEventSource.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'progress') {
        useReaderStore.setState({ parseProgress: data.progress || 0 })
      } else if (data.type === 'completed') {
        useReaderStore.setState({ parsing: false, parseProgress: 1, currentEngine: engine })
        await useReaderStore.getState().loadPages(engine)
        const status = await parse.status(paperId, engine)
        useReaderStore.setState({ parseStatus: status })
        if (_parseEventSource) {
          _parseEventSource.close()
          _parseEventSource = null
        }
      } else if (data.type === 'error') {
        useReaderStore.setState({ parsing: false })
        const status = await parse.status(paperId, engine)
        useReaderStore.setState({ parseStatus: status })
        if (_parseEventSource) {
          _parseEventSource.close()
          _parseEventSource = null
        }
      }
    } catch (err) {
      console.error('Failed to parse SSE message:', err)
    }
  }

  _parseEventSource.onerror = () => {
    if (_parseEventSource) {
      _parseEventSource.close()
      _parseEventSource = null
    }
    parse.status(paperId, engine).then((status) => {
      useReaderStore.setState({ parseStatus: status })
      if (status.parse_status === 'parsed') {
        useReaderStore.setState({ parsing: false, parseProgress: 1, currentEngine: engine })
        useReaderStore.getState().loadPages(engine)
      } else if (status.parse_status === 'failed') {
        useReaderStore.setState({ parsing: false })
      }
    }).catch(() => {
      useReaderStore.setState({ parsing: false })
    })
  }
}

interface ReaderStore {
  paper: Paper | null
  pages: ParsedPage[]
  currentPage: number
  translations: Record<number, string>
  translatingPages: Set<string>  // 正在后台翻译的页面 key: `${paperId}:${pageNumber}:${engine}`
  tocOpen: boolean
  parsePanelOpen: boolean
  qaPanelOpen: boolean
  parsePanelWidth: number
  qaPanelWidth: number
  zoom: number
  parseStatus: ParseStatus | null
  loading: boolean
  parsing: boolean
  parseProgress: number
  selectedEngine: string
  currentEngine: string | null

  loadPaper: (id: string) => Promise<void>
  loadParseData: (id: string) => Promise<void>
  loadPages: (engine?: string) => Promise<void>
  setCurrentPage: (page: number) => void
  translateCurrentPage: (modelId?: string, pageNumber?: number, forceRetranslate?: boolean) => Promise<void>
  translateChunk: (paperId: string, pageNumber: number, _markdown: string, modelId?: string) => Promise<string>
  triggerParse: (paperId: string, engine: string) => Promise<void>
  switchEngine: (engine: string) => Promise<void>
  toggleToc: () => void
  toggleParsePanel: () => void
  toggleQaPanel: () => void
  setParsePanelWidth: (w: number) => void
  setQaPanelWidth: (w: number) => void
  setZoom: (zoom: number) => void
  setSelectedEngine: (engine: string) => void
}

export const useReaderStore = create<ReaderStore>((set, get) => ({
  paper: null,
  pages: [],
  currentPage: 1,
  translations: {},
  translatingPages: new Set(),
  tocOpen: false,
  parsePanelOpen: false,
  qaPanelOpen: false,
  parsePanelWidth: 0, // will be set by layout
  qaPanelWidth: 380,
  zoom: 1,
  parseStatus: null,
  loading: false,
  parsing: false,
  parseProgress: 0,
  selectedEngine: 'pymupdf',
  currentEngine: null,

  loadPaper: async (id) => {
    // 请求去重，防止 StrictMode 双重执行
    if (_pendingLoadPaper && _pendingLoadPaperId === id) {
      return _pendingLoadPaper
    }
    
    _pendingLoadPaperId = id
    _pendingLoadPaper = (async () => {
      const isSamePaper = _currentPaperId === id && get().paper !== null
      
      if (!isSamePaper) {
        // 切换到不同论文时才清空旧数据
        set({
          loading: true,
          paper: null,
          pages: [],
          translations: {},
          parseStatus: null,
          parseProgress: 0,
          parsing: false,
          currentEngine: null,
          currentPage: 1,
        })
        
        // Close any existing SSE connection (only when switching papers)
        if (_parseEventSource) {
          _parseEventSource.close()
          _parseEventSource = null
        }
      } else {
        set({ loading: true })
      }
      
      try {
        const paper = await papers.get(id)
        _currentPaperId = id
        
        if (isSamePaper) {
          // 同一篇论文：只更新 paper 元数据，保留解析/翻译状态
          set({ paper, loading: false })
        } else {
          // 新论文：恢复阅读位置
          const savedPage = paper.reading_page || 1
          set({ paper, currentPage: savedPage, loading: false })
        }
      } catch (error) {
        set({ loading: false })
        throw error
      } finally {
        _pendingLoadPaper = null
        _pendingLoadPaperId = null
      }
    })()
    
    return _pendingLoadPaper
  },
  
  // Load parse data separately - called when parse panel is opened or needed
  // 请求去重，防止 StrictMode 双重执行
  loadParseData: async (id) => {
    const { paper } = get()
    if (!paper || paper.id !== id) return
    
    // 请求去重
    if (_pendingParseData && _pendingParseDataId === id) {
      return _pendingParseData
    }
    
    _pendingParseDataId = id
    _pendingParseData = (async () => {
      // 始终从后端获取最新解析状态（不跳过）
      await Promise.all([
        get().loadPages().catch(() => {}),
        parse.status(id).then((status) => {
          set({ parseStatus: status, currentEngine: status.current_engine || null })
          
          // 如果后端仍在解析且当前没有 SSE 连接，自动重连
          if (status.thread_running && !_parseEventSource) {
            const engine = status.current_engine || 'pymupdf'
            _reconnectParseSSE(id, engine)
          }
        }).catch(() => {})
      ])
      _pendingParseData = null
      _pendingParseDataId = null
    })()
    
    return _pendingParseData
  },

  loadPages: async (engine) => {
    const { paper } = get()
    if (!paper) return
    const res = await parse.getPages(paper.id, engine)
    const actualEngine = res.engine || engine || 'pymupdf'
    set({ pages: res.pages, currentEngine: actualEngine })
    
    // 同时加载该引擎的翻译缓存（合并，不覆盖正在流式更新的翻译）
    try {
      const transRes = await translate.getAllTranslations(paper.id, actualEngine)
      const cachedTranslations: Record<number, string> = {}
      for (const [pageNum, data] of Object.entries(transRes.translations || {})) {
        cachedTranslations[Number(pageNum)] = data.content
      }
      // 合并：DB 缓存 + 已有的实时翻译数据（保留更完整的）
      set((state) => {
        const merged = { ...cachedTranslations }
        for (const [pageNum, content] of Object.entries(state.translations)) {
          const num = Number(pageNum)
          // 如果实时数据比缓存更长（流式进行中），保留实时数据
          if (content && (!merged[num] || content.length > merged[num].length)) {
            merged[num] = content
          }
        }
        return { translations: merged }
      })
    } catch (e) {
      // 没有翻译缓存也不影响
      console.debug('No cached translations:', e)
    }
  },

  setCurrentPage: (page) => {
    set({ currentPage: page })
    
    // Debounce: 保存阅读位置到后端
    if (_readingPositionTimer) clearTimeout(_readingPositionTimer)
    _readingPositionTimer = setTimeout(() => {
      const { paper } = get()
      if (paper) {
        papers.updateReadingPosition(paper.id, page).catch(() => {})
      }
    }, 1500)
  },

  translateCurrentPage: async (modelId, pageNumberOverride, forceRetranslate = false) => {
    const { paper, currentPage, currentEngine, translatingPages } = get()
    const targetPage = pageNumberOverride ?? currentPage
    if (!paper) return
    
    const engine = currentEngine || 'pymupdf'
    const pageKey = `${paper.id}:${targetPage}:${engine}`
    
    // 检查是否已经在翻译中
    if (translatingPages.has(pageKey) && !forceRetranslate) {
      return
    }

    // 标记为翻译中
    const newTranslatingPages = new Set(translatingPages)
    newTranslatingPages.add(pageKey)
    set({ translatingPages: newTranslatingPages })

    // 启动后台翻译（不阻塞 UI）
    fetch(`/api/v1/translate/${paper.id}/pages/${targetPage}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model_id: modelId, 
        engine, 
        force: forceRetranslate 
      }),
    }).then(async (res) => {
      if (!res.ok) {
        throw new Error(`Translation failed: ${res.status}`)
      }
      
      const contentType = res.headers.get('content-type') || ''
      
      // 如果是缓存的 JSON 响应，直接处理
      if (contentType.includes('application/json')) {
        const data = await res.json()
        if (data.cached && data.content) {
          set((state) => ({
            translations: { ...state.translations, [targetPage]: data.content },
          }))
        }
        return
      }
      
      // SSE 流式响应
      const reader = res.body?.getReader()
      if (!reader) return
      
      const decoder = new TextDecoder()
      let buffer = ''
      let content = ''
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'content' && event.content) {
                content += event.content
                set((state) => ({
                  translations: { ...state.translations, [targetPage]: content },
                }))
              } else if (event.type === 'done' || event.type === 'error') {
                break
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    }).catch((err) => {
      console.error('[Translate] Background translation error:', err)
    }).finally(() => {
      // 移除翻译中标记
      set((state) => {
        const updated = new Set(state.translatingPages)
        updated.delete(pageKey)
        return { translatingPages: updated }
      })
    })
  },

  translateChunk: async (paperId, pageNumber, _markdown, modelId) => {
    const { translations, currentEngine, translatingPages } = get()
    const engine = currentEngine || 'pymupdf'
    const pageKey = `${paperId}:${pageNumber}:${engine}`
    
    // 如果已有翻译结果，直接返回
    if (translations[pageNumber]) return translations[pageNumber]
    
    // 如果正在翻译中，返回空字符串（UI 会显示加载状态）
    if (translatingPages.has(pageKey)) return ''

    // 标记为翻译中
    const newTranslatingPages = new Set(translatingPages)
    newTranslatingPages.add(pageKey)
    set({ translatingPages: newTranslatingPages })

    let content = ''
    
    try {
      const res = await fetch(`/api/v1/translate/${paperId}/pages/${pageNumber}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId, engine }),
      })
      
      if (!res.ok) throw new Error(`Translation failed: ${res.status}`)
      
      const contentType = res.headers.get('content-type') || ''
      
      if (contentType.includes('application/json')) {
        const data = await res.json()
        if (data.cached && data.content) {
          content = data.content
        }
      } else {
        // SSE 流式响应
        const reader = res.body?.getReader()
        if (!reader) throw new Error('No reader')
        
        const decoder = new TextDecoder()
        let buffer = ''
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6))
                if (event.type === 'content' && event.content) {
                  content += event.content
                  set((state) => ({
                    translations: { ...state.translations, [pageNumber]: content },
                  }))
                } else if (event.type === 'error') {
                  throw new Error(event.message || 'Translation failed')
                } else if (event.type === 'done') {
                  break
                }
              } catch (e) {
                if (e instanceof Error && e.message.includes('Translation failed')) {
                  throw e
                }
                // 忽略 JSON 解析错误
              }
            }
          }
        }
      }
    } finally {
      // 移除翻译中标记
      set((state) => {
        const updated = new Set(state.translatingPages)
        updated.delete(pageKey)
        return { translatingPages: updated }
      })
    }
    
    set((state) => ({
      translations: { ...state.translations, [pageNumber]: content },
    }))
    return content
  },

  triggerParse: async (paperId, engine) => {
    set({ parsing: true, parseProgress: 0, parsePanelOpen: true, selectedEngine: engine })
    
    try {
      const result = await parse.trigger(paperId, engine)
      if (result.status === 'already_parsed') {
        // Already cached — load immediately
        set({ parsing: false, parseProgress: 1 })
        await get().loadPages(engine)
        const status = await parse.status(paperId, engine)
        set({ parseStatus: status, currentEngine: engine })
        return
      }
      
      // 使用统一的 SSE 连接管理（支持重连）
      _reconnectParseSSE(paperId, engine)
    } catch {
      set({ parsing: false })
    }
  },

  switchEngine: async (engine) => {
    const { paper } = get()
    if (!paper) return
    // 切换引擎时清空旧数据，避免显示上一个引擎的解析结果
    set({ selectedEngine: engine, loading: true, pages: [], translations: {} })
    try {
      const status = await parse.status(paper.id, engine)
      set({ parseStatus: status, currentEngine: engine })
      await get().loadPages(engine)
    } finally {
      set({ loading: false })
    }
  },

  toggleToc: () => set((s) => ({ tocOpen: !s.tocOpen })),
  toggleParsePanel: () => set((s) => ({ parsePanelOpen: !s.parsePanelOpen })),
  toggleQaPanel: () => set((s) => ({ qaPanelOpen: !s.qaPanelOpen })),
  setParsePanelWidth: (w) => set({ parsePanelWidth: w }),
  setQaPanelWidth: (w) => set({ qaPanelWidth: w }),
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(3, zoom)) }),
  setSelectedEngine: (engine) => set({ selectedEngine: engine }),
}))
