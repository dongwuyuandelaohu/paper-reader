export interface Paper {
  id: string
  title: string
  authors: string[] | null
  year: number | null
  venue: string | null
  total_pages: number
  pages_parsed: number
  pages_translated: number
  parse_status: string
  reading_page: number
  is_favorite: boolean
  tags: Tag[]
  created_at: string
  last_read_at: string | null
}

export interface PaperListResponse {
  items: Paper[]
  total: number
  page: number
  page_size: number
}

export interface Tag {
  id: string
  name: string
  color: string
  paper_count?: number
}

export interface AIModel {
  id: string
  name: string
  api_base_url: string
  model_id: string
  is_verified: boolean
  is_default_translate: string | null
  is_default_chat: string | null
  supports_vision: boolean
  created_at: string
}

export interface ImageAttachment {
  id: string
  name: string
  data: string // base64
  mime_type: string
}

export interface Note {
  id: string
  page_number: number
  paragraph_index: number | null
  content: string
  cited_text: string | null
  color: string
  created_at: string
  updated_at: string
}

export interface GlossaryEntry {
  id: string
  term: string
  phonetic: string | null
  translation: string
  explanation: string | null
  lookup_count: number
  is_pinned: boolean
}

export interface Conversation {
  id: string
  title: string | null
  model_name: string
  message_count: number
  tokens_used: number
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[] | null
  tool_calls: unknown[] | null
  model_id: string | null
  tokens_input: number
  tokens_output: number
  duration_ms: number
  created_at: string
}

export interface Citation {
  page: number
  text: string
}

export interface ParsedPage {
  page_number: number
  markdown: string
  text_content: string
  headings: Heading[]
  images: ImageRef[]
  parse_status: string
  word_count: number
}

export interface Heading {
  level: number
  text: string
}

export interface ImageRef {
  filename: string
  bbox?: number[]
}

export interface ParseStatus {
  paper_id: string
  parse_status: string
  total_pages: number
  pages_parsed: number
  current_engine: string | null
  cached_engines: Record<string, number>
  job: ParseJob | null
  page_statuses: Record<string, string>
}

export interface ParseJob {
  id: string
  engine: string
  status: string
  progress: number
  pages_done: number
  pages_total: number
  error_message: string | null
}

export interface Translation {
  page_number: number
  content: string
  model_name: string
  tokens_used: number
  translated_at: string
  cached?: boolean
}

export interface Engine {
  name: string
  available: boolean
  version: string | null
  description: string
  install_size_mb: number
  built_in: boolean
}

export interface Settings {
  target_language: string
  translate_style: string
  auto_translate: boolean
  preload_next_page: boolean
  qa_temperature: number
  qa_max_tokens: number
  qa_system_prompt: string
  auto_expand_sidebar: boolean
  font_size: number
  line_height: number
  theme: string
  panel_ratio: string
  sync_scroll: boolean
  pdf_display_mode: string
  parse_engine: string
  parse_service_url: string
  vision_model_id: string | null
}

export interface SSEEvent {
  type: 'content' | 'done' | 'error'
  content?: string
  message_id?: string
  tokens_input?: number
  tokens_output?: number
  duration_ms?: number
  message?: string
}
