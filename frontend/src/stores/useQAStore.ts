import { create } from 'zustand'
import { conversations, settings as settingsApi } from '@/api/client'
import type { Conversation, Message, ImageAttachment } from '@/api/types'

// 请求去重
let _pendingConvFetch: Promise<void> | null = null
let _pendingConvPaperId: string | null = null

interface QAStore {
  conversations: Conversation[]
  activeConversationId: string | null
  activeModelId: string | null
  messages: Message[]
  streaming: boolean
  streamingContent: string
  streamingThinking: string
  attachedImages: ImageAttachment[]
  pendingQuote: string | null
  enableThinking: boolean

  fetchConversations: (paperId: string) => Promise<void>
  createConversation: (paperId: string, modelId: string) => Promise<void>
  loadMessages: (convId: string) => Promise<void>
  sendMessage: (convId: string, content: string, modelId?: string) => Promise<void>
  switchModel: (modelId: string) => void
  addImage: (file: File) => Promise<void>
  removeImage: (id: string) => void
  clearImages: () => void
  stopGeneration: () => Promise<void>
  archiveConversation: (convId: string, archived: boolean) => Promise<void>
  deleteConversation: (convId: string) => Promise<void>
  setPendingQuote: (quote: string | null) => void
  toggleThinking: () => void
  setEnableThinking: (v: boolean) => void
}

export const useQAStore = create<QAStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  activeModelId: null,
  messages: [],
  streaming: false,
  streamingContent: '',
  streamingThinking: '',
  attachedImages: [],
  pendingQuote: null,
  enableThinking: false,

  fetchConversations: async (paperId) => {
    if (_pendingConvFetch && _pendingConvPaperId === paperId) {
      return _pendingConvFetch
    }
    _pendingConvPaperId = paperId
    _pendingConvFetch = (async () => {
      const res = await conversations.list(paperId)
      set({ conversations: res.items })
      _pendingConvFetch = null
      _pendingConvPaperId = null
    })()
    return _pendingConvFetch
  },

  createConversation: async (paperId, modelId) => {
    const conv = await conversations.create(paperId, modelId)
    set((state) => ({
      conversations: [conv, ...state.conversations],
      activeConversationId: conv.id,
      activeModelId: modelId,
      messages: [],
    }))
  },

  loadMessages: async (convId) => {
    set({ activeConversationId: convId })
    const res = await conversations.getMessages(convId)
    set({ messages: res.items })
  },

  switchModel: (modelId) => {
    set({ activeModelId: modelId })
  },

  addImage: async (file) => {
    const data = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1])
      }
      reader.readAsDataURL(file)
    })
    const attachment: ImageAttachment = {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      data,
      mime_type: file.type,
    }
    set((state) => ({ attachedImages: [...state.attachedImages, attachment] }))
  },

  removeImage: (id) => {
    set((state) => ({ attachedImages: state.attachedImages.filter((img) => img.id !== id) }))
  },

  clearImages: () => set({ attachedImages: [] }),

  sendMessage: async (convId, content, modelId) => {
    const { attachedImages, activeModelId, enableThinking } = get()
    const useModel = modelId || activeModelId

    // 确保后端思考模式设置与前端一致
    try {
      await settingsApi.update({ enable_thinking: enableThinking })
    } catch { /* ignore */ }

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      thinking: null,
      citations: null,
      tool_calls: null,
      model_id: null,
      tokens_input: 0,
      tokens_output: 0,
      duration_ms: 0,
      created_at: new Date().toISOString(),
    }

    set((state) => ({
      messages: [...state.messages, userMessage],
      streaming: true,
      streamingContent: '',
      streamingThinking: '',
      attachedImages: [],
      pendingQuote: null,
    }))

    const imagesPayload = attachedImages.length > 0
      ? attachedImages.map((img) => ({ data: img.data, mime_type: img.mime_type }))
      : undefined

    try {
      const stream = conversations.sendMessage(convId, content, {
        model_id: useModel || undefined,
        images: imagesPayload,
      })
      let fullContent = ''
      let fullThinking = ''

      for await (const event of stream) {
        if (event.type === 'thinking' && event.content) {
          fullThinking += event.content
          set({ streamingThinking: fullThinking })
        } else if (event.type === 'content' && event.content) {
          fullContent += event.content
          set({ streamingContent: fullContent })
        } else if (event.type === 'done') {
          const assistantMessage: Message = {
            id: event.message_id || `msg-${Date.now()}`,
            role: 'assistant',
            content: fullContent,
            thinking: event.thinking || fullThinking || null,
            citations: null,
            tool_calls: null,
            model_id: useModel || null,
            tokens_input: event.tokens_input || 0,
            tokens_output: event.tokens_output || 0,
            duration_ms: event.duration_ms || 0,
            created_at: new Date().toISOString(),
          }
          set((state) => ({
            messages: [...state.messages, assistantMessage],
            streaming: false,
            streamingContent: '',
            streamingThinking: '',
          }))
        } else if (event.type === 'stopped') {
          const assistantMessage: Message = {
            id: event.message_id || `msg-${Date.now()}`,
            role: 'assistant',
            content: event.content || fullContent,
            thinking: event.thinking || fullThinking || null,
            citations: null,
            tool_calls: null,
            model_id: useModel || null,
            tokens_input: 0,
            tokens_output: 0,
            duration_ms: 0,
            created_at: new Date().toISOString(),
          }
          set((state) => ({
            messages: [...state.messages, assistantMessage],
            streaming: false,
            streamingContent: '',
            streamingThinking: '',
          }))
        } else if (event.type === 'error') {
          throw new Error(event.message || 'Generation failed')
        }
      }
    } catch {
      set({ streaming: false, streamingContent: '', streamingThinking: '' })
    }
  },

  stopGeneration: async () => {
    const { activeConversationId } = get()
    if (!activeConversationId) return
    await conversations.stop(activeConversationId)
    set({ streaming: false, streamingContent: '', streamingThinking: '' })
  },

  archiveConversation: async (convId, archived) => {
    await conversations.archive(convId, archived)
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== convId),
      ...(state.activeConversationId === convId ? { activeConversationId: null, messages: [] } : {}),
    }))
  },

  deleteConversation: async (convId) => {
    await conversations.delete(convId)
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== convId),
      ...(state.activeConversationId === convId ? { activeConversationId: null, messages: [] } : {}),
    }))
  },

  setPendingQuote: (quote) => set({ pendingQuote: quote }),

  toggleThinking: () => {
    const next = !get().enableThinking
    set({ enableThinking: next })
    // 同步到后端设置
    settingsApi.update({ enable_thinking: next }).catch(() => {})
  },

  setEnableThinking: (v) => {
    set({ enableThinking: v })
  },
}))
