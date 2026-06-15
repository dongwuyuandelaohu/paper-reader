import { create } from 'zustand'
import { tags } from '@/api/client'
import type { Tag } from '@/api/types'

interface TagStore {
  tags: Tag[]
  loading: boolean

  fetchTags: () => Promise<void>
  createTag: (data: { name: string; color?: string }) => Promise<void>
  deleteTag: (tagId: string) => Promise<void>
  assignToPaper: (tagId: string, paperId: string) => Promise<void>
  removeFromPaper: (tagId: string, paperId: string) => Promise<void>
}

// 请求去重：避免 StrictMode 等导致的重复请求
let pendingFetch: Promise<void> | null = null

export const useTagStore = create<TagStore>((set) => ({
  tags: [],
  loading: false,

  fetchTags: async () => {
    // 请求去重：如果已有请求在进行中，直接复用
    if (pendingFetch) {
      return pendingFetch
    }
    
    pendingFetch = (async () => {
      set({ loading: true })
      try {
        const res = await tags.list()
        set({ tags: res.items })
      } finally {
        set({ loading: false })
        pendingFetch = null
      }
    })()
    
    return pendingFetch
  },

  createTag: async (data) => {
    const tag = await tags.create(data)
    set((state) => ({ tags: [...state.tags, tag] }))
  },

  deleteTag: async (tagId) => {
    await tags.delete(tagId)
    set((state) => ({ tags: state.tags.filter((t) => t.id !== tagId) }))
  },

  assignToPaper: async (tagId, paperId) => {
    await tags.assignToPaper(tagId, paperId)
  },

  removeFromPaper: async (tagId, paperId) => {
    await tags.removeFromPaper(tagId, paperId)
  },
}))
