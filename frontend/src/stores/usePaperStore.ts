import { create } from 'zustand'
import { papers } from '@/api/client'
import type { Paper } from '@/api/types'

type Filter = 'all' | 'favorite' | 'recent' | 'translated' | 'translating' | 'untranslated'
type SortField = 'created_at' | 'last_read_at' | 'title'
type Order = 'asc' | 'desc'
type ViewMode = 'grid' | 'list'

// 请求去重：避免 StrictMode 等导致的重复请求
let pendingFetch: Promise<void> | null = null
let lastFetchParams = ''

interface PaperStore {
  papers: Paper[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  filter: Filter
  sort: SortField
  order: Order
  search: string
  tagId: string | null
  viewMode: ViewMode
  selectedIds: Set<string>

  fetchPapers: () => Promise<void>
  setFilter: (filter: Filter) => void
  setSort: (sort: SortField) => void
  setOrder: (order: Order) => void
  setSearch: (search: string) => void
  setTagId: (tagId: string | null) => void
  setViewMode: (mode: ViewMode) => void
  toggleSelect: (id: string) => void
  clearSelection: () => void
  toggleFavorite: (id: string) => Promise<void>
  deletePaper: (id: string) => Promise<void>
  uploadPaper: (file: File, title?: string) => Promise<void>
}

export const usePaperStore = create<PaperStore>((set, get) => ({
  papers: [],
  total: 0,
  page: 1,
  pageSize: 20,
  loading: false,
  filter: 'all',
  sort: 'created_at',
  order: 'desc',
  search: '',
  tagId: null,
  viewMode: 'grid',
  selectedIds: new Set(),

  fetchPapers: async () => {
    // 请求去重：如果已有相同参数的请求在进行中，直接复用
    const { page, pageSize, filter, sort, order, search, tagId } = get()
    const paramsKey = `${page}:${pageSize}:${filter}:${sort}:${order}:${search}:${tagId}`
    
    if (pendingFetch && lastFetchParams === paramsKey) {
      return pendingFetch
    }
    
    lastFetchParams = paramsKey
    pendingFetch = (async () => {
      set({ loading: true })
      try {
        const params: Record<string, string> = {
          page: String(page),
          page_size: String(pageSize),
          sort,
          order,
        }
        if (filter !== 'all') params.filter = filter
        if (search) params.search = search
        if (tagId) params.tag_id = tagId

        const res = await papers.list(params)
        set({ papers: res.items, total: res.total })
      } finally {
        set({ loading: false })
        pendingFetch = null
      }
    })()
    
    return pendingFetch
  },

  setFilter: (filter) => set({ filter, page: 1 }),
  setSort: (sort) => set({ sort, page: 1 }),
  setOrder: (order) => set({ order, page: 1 }),
  setSearch: (search) => set({ search, page: 1 }),
  setTagId: (tagId) => set({ tagId, page: 1 }),
  setViewMode: (viewMode) => set({ viewMode }),

  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedIds: next }
    }),

  clearSelection: () => set({ selectedIds: new Set() }),

  toggleFavorite: async (id) => {
    const paper = get().papers.find((p) => p.id === id)
    if (!paper) return
    await papers.update(id, { is_favorite: !paper.is_favorite })
    set((state) => ({
      papers: state.papers.map((p) =>
        p.id === id ? { ...p, is_favorite: !p.is_favorite } : p
      ),
    }))
  },

  deletePaper: async (id) => {
    await papers.delete(id)
    set((state) => ({
      papers: state.papers.filter((p) => p.id !== id),
      total: state.total - 1,
    }))
  },

  uploadPaper: async (file, title) => {
    await papers.upload(file, title)
    await get().fetchPapers()
  },
}))
