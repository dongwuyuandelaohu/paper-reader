import type {
  PaperListResponse, Paper, Tag, AIModel, Note, GlossaryEntry,
  Conversation, Message, ParsedPage, ParseStatus, Translation,
  Engine, Settings, SSEEvent
} from './types'

const BASE = '/api/v1'

// 开发环境使用相对路径（Vite 代理），生产环境使用绝对路径
const isDev = import.meta.env.DEV
const API_BASE = isDev ? '/api/v1' : 'http://localhost:8765/api/v1'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

function sseStream(url: string, options?: RequestInit): AsyncGenerator<SSEEvent> {
  const generator = async function* () {
    const res = await fetch(API_BASE + url, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    })
    if (!res.ok) throw new Error(res.statusText)
    const reader = res.body!.getReader()
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
            yield JSON.parse(line.slice(6)) as SSEEvent
          } catch { /* skip malformed */ }
        }
      }
    }
  }
  return generator()
}

// ===== Papers =====
export const papers = {
  list: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request<PaperListResponse>(`/papers${qs ? '?' + qs : ''}`)
  },
  get: (id: string) => request<Paper>(`/papers/${id}`),
  upload: (file: File, title?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (title) form.append('title', title)
    return request<Paper & { parse_job_id: string }>('/papers/upload', {
      headers: {},
      method: 'POST',
      body: form,
    })
  },
  update: (id: string, data: { title?: string; is_favorite?: boolean }) =>
    request<{ status: string }>(`/papers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ status: string }>(`/papers/${id}`, { method: 'DELETE' }),
  updateReadingPosition: (id: string, page: number, scroll = 0) =>
    request<{ status: string }>(`/papers/${id}/reading-position`, {
      method: 'PUT',
      body: JSON.stringify({ page, scroll }),
    }),
  getFileUrl: (id: string) => `${API_BASE}/papers/${id}/file`,
}

// ===== Parse =====
export const parse = {
  trigger: (paperId: string, engine?: string) =>
    request<{ status: string; job_id: string; engine?: string }>(`/parse/${paperId}/parse`, {
      method: 'POST',
      body: JSON.stringify({ engine }),
    }),
  status: (paperId: string, engine?: string) => {
    const params = engine ? `?engine=${encodeURIComponent(engine)}` : ''
    return request<ParseStatus>(`/parse/${paperId}/parse/status${params}`)
  },
  stream: (paperId: string): EventSource => {
    return new EventSource(`${API_BASE}/parse/${paperId}/parse/stream`)
  },
  getPages: (paperId: string, engine?: string) => {
    const params = engine ? `?engine=${encodeURIComponent(engine)}` : ''
    return request<{ paper_id: string; total_pages: number; engine?: string; pages: ParsedPage[] }>(`/parse/${paperId}/pages${params}`)
  },
  getPage: (paperId: string, pageNumber: number, engine?: string) => {
    const params = engine ? `?engine=${encodeURIComponent(engine)}` : ''
    return request<ParsedPage>(`/parse/${paperId}/pages/${pageNumber}${params}`)
  },
  getImageUrl: (paperId: string, filename: string) =>
    `${API_BASE}/parse/${paperId}/images/${filename}`,
}

// ===== Translate =====
export const translate = {
  translatePage: async (paperId: string, pageNumber: number, modelId?: string, engine?: string, force?: boolean): Promise<AsyncGenerator<SSEEvent>> => {
    // The backend may return cached JSON (not SSE), so we need to handle both
    const res = await fetch(`${API_BASE}/translate/${paperId}/pages/${pageNumber}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: modelId, engine, force: force || false }),
    })
    if (!res.ok) throw new Error(res.statusText)

    const contentType = res.headers.get('content-type') || ''

    // Cached response: plain JSON
    if (contentType.includes('application/json')) {
      const data = await res.json()
      if (data.cached && data.content) {
        // Return as a generator that yields the cached content
        return (async function* () {
          yield { type: 'content' as const, content: data.content }
          yield { type: 'done' as const, tokens_input: 0, tokens_output: data.tokens_used || 0 }
        })()
      }
    }

    // SSE streaming response
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    return (async function* () {
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try { yield JSON.parse(line.slice(6)) as SSEEvent } catch { /* skip */ }
          }
        }
      }
    })()
  },
  getTranslation: (paperId: string, pageNumber: number, engine = 'pymupdf', language = 'zh') =>
    request<Translation | null>(`/translate/${paperId}/translations/${pageNumber}?engine=${engine}&language=${language}`),
  getAllTranslations: (paperId: string, engine = 'pymupdf', language = 'zh') =>
    request<{ translations: Record<number, { content: string; model_name: string; tokens_used: number; translated_at: string }> }>(
      `/translate/${paperId}/translations?engine=${engine}&language=${language}`
    ),
}

// ===== Conversations =====
export const conversations = {
  list: (paperId: string) =>
    request<{ items: Conversation[] }>(`/conversations/${paperId}`),
  create: (paperId: string, modelId: string) =>
    request<Conversation & { system_prompt: string }>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ paper_id: paperId, model_id: modelId }),
    }),
  getMessages: (conversationId: string) =>
    request<{ items: Message[] }>(`/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, content: string, options?: { citations?: { page: number; text: string }[]; model_id?: string; images?: { data: string; mime_type: string }[] }) =>
    sseStream(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, ...options }),
    }),
  stop: (conversationId: string) =>
    request<{ status: string }>(`/conversations/${conversationId}/stop`, { method: 'POST' }),
  delete: (conversationId: string) =>
    request<{ status: string }>(`/conversations/${conversationId}`, { method: 'DELETE' }),
}

// ===== Notes =====
export const notes = {
  list: (paperId: string, page?: number) =>
    request<{ items: Note[] }>(`/notes/${paperId}${page != null ? `?page=${page}` : ''}`),
  create: (data: { paper_id: string; page_number: number; paragraph_index?: number; content: string; cited_text?: string; color?: string }) =>
    request<{ id: string; created_at: string }>('/notes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (noteId: string, data: { content?: string; color?: string }) =>
    request<{ status: string }>(`/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (noteId: string) =>
    request<{ status: string }>(`/notes/${noteId}`, { method: 'DELETE' }),
  export: (paperId: string, format: 'markdown' | 'json' = 'markdown') =>
    request<{ content?: string; paper_id?: string; notes?: Note[] }>(`/notes/${paperId}/export?format=${format}`),
}

// ===== Tags =====
export const tags = {
  list: () => request<{ items: Tag[] }>('/tags'),
  create: (data: { name: string; color?: string }) =>
    request<Tag>('/tags', { method: 'POST', body: JSON.stringify(data) }),
  update: (tagId: string, data: { name?: string; color?: string }) =>
    request<{ status: string }>(`/tags/${tagId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (tagId: string) =>
    request<{ status: string }>(`/tags/${tagId}`, { method: 'DELETE' }),
  assignToPaper: (tagId: string, paperId: string) =>
    request<{ status: string }>(`/tags/${tagId}/papers`, {
      method: 'POST',
      body: JSON.stringify({ paper_id: paperId }),
    }),
  removeFromPaper: (tagId: string, paperId: string) =>
    request<{ status: string }>(`/tags/${tagId}/papers/${paperId}`, { method: 'DELETE' }),
  getPapers: (tagId: string) =>
    request<{ items: Paper[] }>(`/tags/${tagId}/papers`),
}

// ===== Glossary =====
export const glossary = {
  lookup: (term: string, paperId?: string) =>
    request<{ term: string; phonetic: string | null; translation: string; explanation: string | null; source: string; found_in_cache: boolean }>(
      `/glossary/lookup?term=${encodeURIComponent(term)}${paperId ? '&paper_id=' + paperId : ''}`
    ),
  getPaperGlossary: (paperId: string) =>
    request<{ items: GlossaryEntry[] }>(`/glossary/${paperId}`),
  update: (entryId: string, data: { is_pinned?: boolean }) =>
    request<{ status: string }>(`/glossary/${entryId}`, { method: 'PATCH', body: JSON.stringify(data) }),
}

// ===== Models =====
export const models = {
  list: () => request<{ items: AIModel[] }>('/models'),
  create: (data: { name: string; api_base_url: string; api_key: string; model_id: string; supports_vision?: boolean }) =>
    request<{ id: string; name: string; created_at: string }>('/models', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  test: (modelId: string) =>
    request<{ success: boolean; message: string; latency_ms?: number }>(`/models/${modelId}/test`, { method: 'POST' }),
  update: (modelId: string, data: { name?: string; api_base_url?: string; api_key?: string; model_id?: string; supports_vision?: boolean }) =>
    request<{ status: string }>(`/models/${modelId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (modelId: string) =>
    request<{ status: string }>(`/models/${modelId}`, { method: 'DELETE' }),
  setDefault: (modelId: string, type: 'translate' | 'chat') =>
    request<{ status: string }>(`/models/${modelId}/default`, {
      method: 'PUT',
      body: JSON.stringify({ type }),
    }),
}

// ===== Settings =====
export const settings = {
  get: () => request<Settings>('/settings'),
  update: (data: Partial<Settings>) =>
    request<{ status: string }>('/settings', {
      method: 'PATCH',
      body: JSON.stringify({ settings: data }),
    }),
  reset: () => request<{ status: string }>('/settings/reset', { method: 'POST' }),
}

// ===== System =====
export const system = {
  health: () => request<{ status: string; version: string; paper_count: number; engines: Record<string, { available: boolean; version: string | null }> }>('/system/health'),
  engines: () => request<{ engines: Engine[]; default_engine: string }>('/system/engines'),
  recheckEngines: () => request<{ status: string; engines: Record<string, any>; message: string }>('/system/engines/recheck', { method: 'POST' }),
  installEngine: (engineName: string) => request<{ status: string; message: string }>(`/system/engines/${engineName}/install`, { method: 'POST' }),
  engineInstallStatus: (engineName: string) => request<{ status: string; progress: number; message?: string }>(`/system/engines/${engineName}/install/status`),
}
