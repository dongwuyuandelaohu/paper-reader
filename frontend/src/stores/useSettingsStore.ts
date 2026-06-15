import { create } from 'zustand'
import { settings, models, system } from '@/api/client'
import type { Settings, AIModel, Engine } from '@/api/types'

interface SettingsStore {
  settings: Settings | null
  models: AIModel[]
  engines: Engine[]
  loading: boolean
  modelsLoaded: boolean
  enginesLoaded: boolean

  fetchSettings: () => Promise<void>
  updateSettings: (data: Partial<Settings>) => Promise<void>
  resetSettings: () => Promise<void>
  fetchModels: () => Promise<void>
  createModel: (data: { name: string; api_base_url: string; api_key: string; model_id: string; supports_vision?: boolean }) => Promise<void>
  deleteModel: (modelId: string) => Promise<void>
  testModel: (modelId: string) => Promise<{ success: boolean; message: string; latency_ms?: number }>
  setDefaultModel: (modelId: string, type: 'translate' | 'chat') => Promise<void>
  updateModel: (modelId: string, data: { name?: string; api_base_url?: string; api_key?: string; model_id?: string; supports_vision?: boolean }) => Promise<void>
  fetchEngines: () => Promise<void>
}

// 请求去重
let pendingModelsFetch: Promise<void> | null = null
let pendingEnginesFetch: Promise<void> | null = null

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,
  models: [],
  engines: [],
  loading: false,
  modelsLoaded: false,
  enginesLoaded: false,

  fetchSettings: async () => {
    set({ loading: true })
    try {
      const res = await settings.get()
      set({ settings: res })
    } finally {
      set({ loading: false })
    }
  },

  updateSettings: async (data) => {
    await settings.update(data)
    set((state) => ({
      settings: state.settings ? { ...state.settings, ...data } : null,
    }))
  },

  resetSettings: async () => {
    await settings.reset()
    await get().fetchSettings()
  },

  fetchModels: async () => {
    // 请求去重
    if (pendingModelsFetch) return pendingModelsFetch
    
    pendingModelsFetch = (async () => {
      set({ loading: true })
      try {
        const res = await models.list()
        set({ models: res.items, modelsLoaded: true })
      } finally {
        set({ loading: false })
        pendingModelsFetch = null
      }
    })()
    
    return pendingModelsFetch
  },

  createModel: async (data) => {
    await models.create(data)
    await get().fetchModels()
  },

  deleteModel: async (modelId) => {
    await models.delete(modelId)
    set((state) => ({
      models: state.models.filter((m) => m.id !== modelId),
    }))
  },

  testModel: async (modelId) => {
    return await models.test(modelId)
  },

  setDefaultModel: async (modelId, type) => {
    await models.setDefault(modelId, type)
    await get().fetchModels()
  },

  updateModel: async (modelId, data) => {
    await models.update(modelId, data)
    await get().fetchModels()
  },

  fetchEngines: async () => {
    // 请求去重
    if (pendingEnginesFetch) return pendingEnginesFetch
    
    pendingEnginesFetch = (async () => {
      const res = await system.engines()
      set({ engines: res.engines, enginesLoaded: true })
      pendingEnginesFetch = null
    })()
    
    return pendingEnginesFetch
  },
}))
