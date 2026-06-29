import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { X, Send, Square, Plus, Paperclip, Copy, ExternalLink, Brain } from 'lucide-react'
import type { AIModel, ImageAttachment, Message, Citation } from '@/api/types'
import { ModelSelector } from './ModelSelector'
import { MarkdownRenderer } from './MarkdownRenderer'

const BLINK_STYLE =
  '@keyframes qa-blink{0%,50%{opacity:1}51%,100%{opacity:0}}'

interface QAPanelProps {
  open: boolean
  width: number
  onClose: () => void
  paperId: string
  models: AIModel[]
  activeModelId: string | null
  onSwitchModel: (modelId: string) => void
  messages: Message[]
  streaming: boolean
  streamingContent: string
  streamingThinking: string
  pendingQuote: string | null
  enableThinking: boolean
  onToggleThinking: () => void
  onClearQuote: () => void
  attachedImages: ImageAttachment[]
  onSendMessage: (content: string) => void
  onStopGeneration: () => void
  onNewConversation: () => void
  onAddImage: (file: File) => void
  onRemoveImage: (id: string) => void
  onClearImages: () => void
}

const QUICK_ACTIONS = ['总结核心贡献', '解释方法论', '实验结果']

export function QAPanel({
  open,
  width,
  onClose,
  paperId,
  models,
  activeModelId,
  onSwitchModel,
  messages,
  streaming,
  streamingContent,
  streamingThinking,
  pendingQuote,
  enableThinking,
  onToggleThinking,
  onClearQuote,
  attachedImages,
  onSendMessage,
  onStopGeneration,
  onNewConversation,
  onAddImage,
  onRemoveImage,
  onClearImages,
}: QAPanelProps) {
  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const currentModel = useMemo(
    () => models.find((m) => m.id === activeModelId),
    [models, activeModelId],
  )
  const visionSupported = currentModel?.supports_vision !== false

  const totalTokens = useMemo(
    () => messages.reduce((sum, m) => sum + m.tokens_input + m.tokens_output, 0),
    [messages],
  )

  // Auto-scroll to bottom on new messages or streaming
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(Math.max(el.scrollHeight, 38), 120) + 'px'
    }
  }, [input])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || streaming) return
    // 如果有引用，拼接引用到消息中
    const quote = pendingQuote ? `> ${pendingQuote.replace(/\n/g, '\n> ')}\n\n` : ''
    onSendMessage(quote + text)
    setInput('')
    onClearQuote()  // 清除引用
    if (textareaRef.current) {
      textareaRef.current.style.height = '38px'
    }
  }, [input, streaming, onSendMessage, pendingQuote, onClearQuote])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!visionSupported) return
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            onAddImage(file)
            e.preventDefault()
          }
          break
        }
      }
    },
    [visionSupported, onAddImage],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) {
          onAddImage(files[i])
        }
      }
      e.target.value = ''
    },
    [onAddImage],
  )

  const handleCopy = useCallback(async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = content
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const fillQuickAction = useCallback(
    (text: string) => {
      setInput(text)
      textareaRef.current?.focus()
    },
    [],
  )

  if (!open) return null

  return (
    <div
      data-paper-id={paperId}
      style={{
        width,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <style>{BLINK_STYLE}</style>

      {/* ── Header ── */}
      <div
        style={{
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--fg)',
            whiteSpace: 'nowrap',
          }}
        >
          论文问答
        </span>

        <ModelSelector
          models={models}
          activeModelId={activeModelId}
          onSelect={onSwitchModel}
        />

        <button
          onClick={onNewConversation}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '11px',
            color: 'var(--muted)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--fg)'
            e.currentTarget.style.borderColor = 'var(--border2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--muted)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        >
          <Plus size={12} strokeWidth={2} />
          新对话
        </button>

        <div style={{ flex: 1 }} />

        <button
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: 'var(--stone)',
            borderRadius: '6px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none'
          }}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      {/* ── Quick Actions ── */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          padding: '8px 12px',
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        {QUICK_ACTIONS.map((text) => (
          <button
            key={text}
            onClick={() => fillQuickAction(text)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '3px 10px',
              fontSize: '11px',
              color: 'var(--muted)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--border2)'
              e.currentTarget.style.color = 'var(--fg)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--muted)'
            }}
          >
            {text}
          </button>
        ))}
      </div>

      {/* ── Messages ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {messages.length === 0 && !streaming && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--stone)',
              fontSize: '13px',
            }}
          >
            开始与论文对话
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            copied={copiedId === msg.id}
            onCopy={() => handleCopy(msg.id, msg.content)}
          />
        ))}

        {/* Streaming thinking content */}
        {streaming && streamingThinking && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              maxWidth: '85%', padding: '8px 12px',
              background: 'var(--surface3)', borderRadius: '8px',
              fontSize: 12, lineHeight: 1.6, color: 'var(--muted)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              borderLeft: '2px solid var(--focus)',
              fontStyle: 'italic',
            }}>
              <div style={{ fontSize: 10, color: 'var(--focus)', marginBottom: 4, fontWeight: 600 }}>思考中...</div>
              {streamingThinking}
            </div>
          </div>
        )}

        {/* Streaming indicator */}
        {streaming && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '85%',
                padding: '10px 14px',
                background: 'var(--surface2)',
                borderRadius: '12px 12px 12px 2px',
                fontSize: '13px',
                lineHeight: '1.6',
                color: 'var(--fg)',
                wordBreak: 'break-word',
              }}
            >
              <MarkdownRenderer content={streamingContent} paperId="" />
              <span
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '14px',
                  background: 'var(--accent)',
                  marginLeft: '2px',
                  verticalAlign: 'text-bottom',
                  animation: 'qa-blink 1s step-end infinite',
                }}
              />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Pending Quote ── */}
      {pendingQuote && (
        <div style={{
          padding: '8px 12px', flexShrink: 0,
          borderTop: '1px solid var(--border)',
        }}>
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            background: 'var(--surface3)', borderRadius: 8,
            padding: '8px 10px', borderLeft: '3px solid var(--focus)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--focus)', fontWeight: 600, marginBottom: 4 }}>引用原文</div>
              <div style={{
                fontSize: 12, color: 'var(--muted)', lineHeight: 1.5,
                fontStyle: 'italic',
                maxHeight: 80, overflowY: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {pendingQuote.length > 200 ? pendingQuote.slice(0, 200) + '...' : pendingQuote}
              </div>
            </div>
            <button
              onClick={onClearQuote}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '2px', color: 'var(--stone)', flexShrink: 0,
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Image Preview ── */}
      {attachedImages.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '6px',
            padding: '6px 12px',
            flexWrap: 'wrap',
            flexShrink: 0,
            borderTop: '1px solid var(--border)',
          }}
        >
          {attachedImages.map((img) => (
            <div
              key={img.id}
              style={{
                position: 'relative',
                width: '60px',
                height: '60px',
                borderRadius: '6px',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <img
                src={`data:${img.mime_type};base64,${img.data}`}
                alt={img.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
              <button
                onClick={() => onRemoveImage(img.id)}
                style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  width: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0,0,0,0.6)',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  color: '#fff',
                  padding: 0,
                }}
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            </div>
          ))}
          {attachedImages.length > 1 && (
            <button
              onClick={onClearImages}
              style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: '11px',
                color: 'var(--stone)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              清除全部
            </button>
          )}
        </div>
      )}

      {/* ── Input Area ── */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '6px',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '6px 8px',
          }}
        >
          {/* Paperclip */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!visionSupported}
            title={!visionSupported ? '当前模型不支持图片理解' : '添加图片'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: visionSupported ? 'pointer' : 'not-allowed',
              padding: '4px',
              color: visionSupported ? 'var(--muted)' : 'var(--dark)',
              opacity: visionSupported ? 1 : 0.4,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (visionSupported) e.currentTarget.style.color = 'var(--fg)'
            }}
            onMouseLeave={(e) => {
              if (visionSupported) e.currentTarget.style.color = 'var(--muted)'
            }}
          >
            <Paperclip size={16} strokeWidth={2} />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="输入问题..."
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--fg)',
              fontSize: '13px',
              lineHeight: '1.5',
              resize: 'none',
              minHeight: '38px',
              maxHeight: '120px',
              fontFamily: 'var(--font-sans)',
              padding: '6px 0',
            }}
          />

          {/* Deep thinking toggle */}
          <button
            onClick={onToggleThinking}
            title="深度思考模式"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: enableThinking ? 'var(--surface3)' : 'none',
              border: enableThinking ? 'none' : '1px solid var(--border)',
              borderRadius: '6px',
              padding: '4px',
              cursor: 'pointer',
              color: enableThinking ? 'var(--coral)' : 'var(--muted)',
              flexShrink: 0,
              width: '30px',
              height: '30px',
            }}
          >
            <Brain size={14} strokeWidth={2} />
          </button>

          {/* Send / Stop */}
          {streaming ? (
            <button
              onClick={onStopGeneration}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                background: 'var(--error)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                color: '#fff',
                flexShrink: 0,
              }}
            >
              <Square size={14} strokeWidth={2} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                background: input.trim() ? 'var(--accent)' : 'var(--surface3)',
                border: 'none',
                borderRadius: '6px',
                cursor: input.trim() ? 'pointer' : 'default',
                color: input.trim() ? '#fff' : 'var(--stone)',
                flexShrink: 0,
                transition: 'background 0.2s',
              }}
            >
              <Send size={14} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Vision warning */}
        {!visionSupported && (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--warn)',
              marginTop: '4px',
              paddingLeft: '2px',
            }}
          >
            当前模型不支持图片理解
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 12px 6px',
          fontSize: '10px',
          color: 'var(--stone)',
          flexShrink: 0,
        }}
      >
        <span>基于论文全文回答 · 当前模型: {currentModel?.name ?? '未选择'}</span>
        {totalTokens > 0 && <span>{totalTokens.toLocaleString()} tokens</span>}
      </div>
    </div>
  )
}

/* ──────────────────────────── Message Bubble ──────────────────────────── */

function MessageBubble({
  message,
  copied,
  onCopy,
}: {
  message: Message
  copied: boolean
  onCopy: () => void
}) {
  const isUser = message.role === 'user'
  const [showThinking, setShowThinking] = useState(false)

  // Parse markdown quote (lines starting with "> ") from user message content
  const quoteMatch = message.content.match(/^> (.+?)\n\n([\s\S]*)$/s)
  const quoteText = quoteMatch ? quoteMatch[1].replace(/\n> /g, '\n') : null
  const mainText = quoteMatch ? quoteMatch[2] : message.content

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {/* Thinking block (assistant only, before message bubble) */}
      {!isUser && message.thinking && (
        <div style={{ marginBottom: 6, maxWidth: '85%' }}>
          <button
            onClick={() => setShowThinking(!showThinking)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 6, padding: '3px 8px',
              fontSize: 10, color: 'var(--focus)', cursor: 'pointer',
            }}
          >
            <Brain size={10} />
            {showThinking ? '收起思考' : '展开思考'}
          </button>
          {showThinking && (
            <div style={{
              marginTop: 4, padding: '8px 12px',
              background: 'var(--surface3)', borderRadius: 8,
              fontSize: 12, lineHeight: 1.6, color: 'var(--muted)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              borderLeft: '2px solid var(--focus)', fontStyle: 'italic',
              maxHeight: 300, overflowY: 'auto',
            }}>
              {message.thinking}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          maxWidth: '85%',
          padding: '10px 14px',
          background: isUser ? 'var(--accent)' : 'var(--surface2)',
          color: isUser ? '#fff' : 'var(--fg)',
          borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
          fontSize: '13px',
          lineHeight: '1.6',
          whiteSpace: isUser ? 'pre-wrap' : 'normal',
          wordBreak: 'break-word',
        }}
      >
        {/* Render quoted original text with distinct style */}
        {quoteText && (
          <div style={{
            borderLeft: '2px solid rgba(255,255,255,0.4)',
            paddingLeft: 8,
            marginBottom: 6,
            fontStyle: 'italic',
            opacity: 0.85,
          }}>
            {quoteText}
          </div>
        )}
        {isUser ? mainText : <MarkdownRenderer content={mainText} paperId="" />}
      </div>

      {/* Citations */}
      {!isUser && message.citations && message.citations.length > 0 && (
        <div style={{ marginTop: '6px', maxWidth: '85%' }}>
          {message.citations.map((c: Citation, i: number) => (
            <div
              key={i}
              style={{
                borderLeft: '2px solid var(--coral)',
                paddingLeft: '8px',
                marginBottom: '4px',
                fontSize: '11px',
                fontStyle: 'italic',
                color: 'var(--muted)',
                lineHeight: '1.5',
              }}
            >
              <span style={{ color: 'var(--stone)', marginRight: '4px' }}>p.{c.page}</span>
              {c.text}
            </div>
          ))}
        </div>
      )}

      {/* Actions (assistant only) */}
      {!isUser && (
        <div
          style={{
            display: 'flex',
            gap: '4px',
            marginTop: '4px',
          }}
        >
          <button
            onClick={onCopy}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 6px',
              fontSize: '11px',
              color: copied ? 'var(--success)' : 'var(--stone)',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
            }}
          >
            <Copy size={12} strokeWidth={2} />
            {copied ? '已复制' : '复制'}
          </button>

          {message.citations && message.citations.length > 0 && (
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 6px',
                fontSize: '11px',
                color: 'var(--stone)',
                borderRadius: '4px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
              }}
            >
              <ExternalLink size={12} strokeWidth={2} />
              定位来源
            </button>
          )}
        </div>
      )}
    </div>
  )
}
