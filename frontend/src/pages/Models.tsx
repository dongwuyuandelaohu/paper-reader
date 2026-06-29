import { useState, useEffect } from 'react'
import { Plus, CheckCircle2, XCircle, Trash2, Pencil, Zap, Globe, MessageSquare, Loader2, AlertTriangle, Eye, EyeOff, ChevronDown } from 'lucide-react'
import { Sidebar } from '../components/Sidebar'
import { Modal } from '../components/Modal'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useToastStore } from '../components/Toast'
import type { AIModel } from '../api/types'

type Provider = 'openai' | 'anthropic' | 'google' | 'other'

function detectProvider(url: string, name: string): Provider {
  const text = (url + ' ' + name).toLowerCase()
  if (text.includes('openai') || text.includes('api.openai')) return 'openai'
  if (text.includes('anthropic') || text.includes('claude')) return 'anthropic'
  if (text.includes('google') || text.includes('gemini') || text.includes('generativelanguage')) return 'google'
  return 'other'
}

const providerStyles: Record<Provider, { bg: string; color: string; label: string }> = {
  openai: { bg: 'rgba(45,122,79,0.12)', color: 'var(--success)', label: 'OpenAI' },
  anthropic: { bg: 'rgba(107,79,192,0.12)', color: '#9d7aea', label: 'Anthropic' },
  google: { bg: 'rgba(59,111,192,0.12)', color: '#5b8fd6', label: 'Google' },
  other: { bg: 'var(--surface)', color: 'var(--muted)', label: 'Other' },
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    return dateStr
  }
}

function maskKey(key?: string): string {
  if (!key) return 'sk-••••••'
  if (key.length > 8) return key.slice(0, 3) + '••••••' + key.slice(-4)
  return 'sk-••••••'
}

interface FormData {
  name: string
  api_base_url: string
  api_key: string
  model_id: string
  supportsVision: boolean
}

const emptyForm: FormData = { name: '', api_base_url: '', api_key: '', model_id: '', supportsVision: false }

export default function Models() {
  const { models, loading, fetchModels, createModel, deleteModel, testModel, setDefaultModel, updateModel } = useSettingsStore()
  const showToast = useToastStore((s) => s.showToast)

  const [showModal, setShowModal] = useState(false)
  const [editingModel, setEditingModel] = useState<AIModel | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set())
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string; latency_ms?: number }>>({})
  const [deleteTarget, setDeleteTarget] = useState<AIModel | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  const defaultTranslateModel = models.find((m) => m.is_default_translate != null)
  const defaultChatModel = models.find((m) => m.is_default_chat != null)

  function openAddModal() {
    setEditingModel(null)
    setForm(emptyForm)
    setShowApiKey(false)
    setShowModal(true)
  }

  function openEditModal(model: AIModel) {
    setEditingModel(model)
    setForm({
      name: model.name,
      api_base_url: model.api_base_url,
      api_key: '',
      model_id: model.model_id,
      supportsVision: model.supports_vision ?? false,
    })
    setShowApiKey(false)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingModel(null)
    setForm(emptyForm)
  }

  async function handleSave(testFirst: boolean) {
    if (!form.name || !form.api_base_url || !form.model_id) {
      showToast('请填写必要字段')
      return
    }
    if (!editingModel && !form.api_key) {
      showToast('请填写 API Key')
      return
    }

    setSaving(true)
    try {
      let modelId: string

      if (editingModel) {
        const data: Record<string, string | boolean> = {}
        if (form.name !== editingModel.name) data.name = form.name
        if (form.api_base_url !== editingModel.api_base_url) data.api_base_url = form.api_base_url
        if (form.model_id !== editingModel.model_id) data.model_id = form.model_id
        if (form.api_key) data.api_key = form.api_key
        if (form.supportsVision !== (editingModel.supports_vision ?? false)) data.supports_vision = form.supportsVision
        await updateModel(editingModel.id, data)
        modelId = editingModel.id
        showToast('模型已更新')
      } else {
        await createModel({ ...form, supports_vision: form.supportsVision })
        const latest = useSettingsStore.getState().models
        modelId = latest[latest.length - 1]?.id || ''
        showToast('模型已添加')
      }

      if (testFirst && modelId) {
        setTestingIds((prev) => new Set(prev).add(modelId))
        try {
          const result = await testModel(modelId)
          setTestResults((prev) => ({ ...prev, [modelId]: result }))
          if (!result.success) {
            showToast('模型已添加，但连接测试失败: ' + result.message)
          }
        } finally {
          setTestingIds((prev) => {
            const next = new Set(prev)
            next.delete(modelId)
            return next
          })
        }
      }

      closeModal()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败'
      showToast(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest(model: AIModel) {
    setTestingIds((prev) => new Set(prev).add(model.id))
    try {
      const result = await testModel(model.id)
      setTestResults((prev) => ({ ...prev, [model.id]: result }))
      if (result.success) {
        showToast(`连接成功，延迟 ${result.latency_ms ?? '?'}ms`)
      } else {
        showToast('连接失败: ' + result.message)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '测试失败'
      setTestResults((prev) => ({ ...prev, [model.id]: { success: false, message: msg } }))
      showToast(msg)
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev)
        next.delete(model.id)
        return next
      })
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteModel(deleteTarget.id)
      showToast('模型已删除')
      setDeleteTarget(null)
      setTestResults((prev) => {
        const next = { ...prev }
        delete next[deleteTarget.id]
        return next
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '删除失败'
      showToast(msg)
    } finally {
      setDeleting(false)
    }
  }

  async function handleSetDefault(modelId: string, type: 'translate' | 'chat') {
    try {
      await setDefaultModel(modelId, type)
      showToast(`已设为${type === 'translate' ? '翻译' : '问答'}默认模型`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '设置失败'
      showToast(msg)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
      <Sidebar currentPage="models" />

      <main style={{ flex: 1, overflow: 'auto', padding: '40px 48px' }}>
        <div style={{ maxWidth: 900 }}>
          {/* Header */}
          <div style={{ marginBottom: 36 }}>
            <h1 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 28,
              fontWeight: 600,
              color: 'var(--fg)',
              marginBottom: 6,
            }}>
              模型管理
            </h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>
              配置翻译和问答使用的 AI 模型，支持 OpenAI 兼容接口。
            </p>
            <button
              onClick={openAddModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              <Plus size={16} strokeWidth={2} />
              添加模型
            </button>
          </div>

          {/* Default Models Section */}
          <div style={{ marginBottom: 36 }}>
            <h2 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 18,
              fontWeight: 600,
              color: 'var(--fg)',
              marginBottom: 16,
            }}>
              默认模型
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <DefaultModelCard
                type="translate"
                icon={<Globe size={18} />}
                title="翻译默认模型"
                model={defaultTranslateModel}
                models={models}
                onChange={(id) => handleSetDefault(id, 'translate')}
              />
              <DefaultModelCard
                type="chat"
                icon={<MessageSquare size={18} />}
                title="问答默认模型"
                model={defaultChatModel}
                models={models}
                onChange={(id) => handleSetDefault(id, 'chat')}
              />
            </div>
          </div>

          {/* Model List Section */}
          <div>
            <h2 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 18,
              fontWeight: 600,
              color: 'var(--fg)',
              marginBottom: 16,
            }}>
              已配置模型 ({models.length})
            </h2>

            {loading && models.length === 0 ? (
              <div style={{
                padding: 48,
                textAlign: 'center',
                color: 'var(--stone)',
                fontSize: 14,
              }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                加载中...
              </div>
            ) : models.length === 0 ? (
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 48,
                textAlign: 'center',
              }}>
                <Zap size={40} style={{ color: 'var(--silver)', marginBottom: 16 }} />
                <p style={{ fontSize: 16, color: 'var(--fg)', fontWeight: 500, marginBottom: 4 }}>
                  暂无模型配置
                </p>
                <p style={{ fontSize: 13, color: 'var(--stone)' }}>
                  点击上方按钮添加你的第一个 AI 模型
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {models.map((model) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    testing={testingIds.has(model.id)}
                    testResult={testResults[model.id]}
                    onTest={() => handleTest(model)}
                    onEdit={() => openEditModal(model)}
                    onDelete={() => setDeleteTarget(model)}
                    onSetDefault={(type) => handleSetDefault(model.id, type)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add/Edit Modal */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={editingModel ? '编辑模型' : '添加模型'}
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button onClick={closeModal} style={btnSecondary}>
              取消
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              style={{ ...btnSecondary, opacity: saving ? 0.6 : 1 }}
            >
              {editingModel ? '直接保存' : '直接添加'}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? '处理中...' : editingModel ? '测试并保存' : '测试并添加'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <FormField label="模型名称" hint="给模型取一个易于识别的名称">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="例如：GPT-4o、Claude 3.5 Sonnet"
              style={inputStyle}
            />
          </FormField>
          <FormField label="API Base URL" hint="OpenAI 兼容接口的地址">
            <input
              value={form.api_base_url}
              onChange={(e) => setForm((f) => ({ ...f, api_base_url: e.target.value }))}
              placeholder="https://api.openai.com/v1"
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 13 }}
            />
          </FormField>
          <FormField label="API Key" hint={editingModel ? '留空则保持不变' : '密钥将安全存储'}>
            <div style={{ position: 'relative' }}>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={form.api_key}
                onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                placeholder="sk-..."
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 13, paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  color: 'var(--stone)',
                  display: 'flex',
                }}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </FormField>
          <FormField label="模型 ID" hint="API 中使用的模型标识符">
            <input
              value={form.model_id}
              onChange={(e) => setForm((f) => ({ ...f, model_id: e.target.value }))}
              placeholder="gpt-4o / claude-3-5-sonnet-20241022"
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 13 }}
            />
          </FormField>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <input
              type="checkbox"
              id="supportsVision"
              checked={form.supportsVision}
              onChange={(e) => setForm((f) => ({ ...f, supportsVision: e.target.checked }))}
              style={{ marginTop: 3, cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
            <label htmlFor="supportsVision" style={{ cursor: 'pointer', flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
                支持图片理解 (Vision)
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--stone)', marginTop: 2 }}>
                勾选后可在问答中发送图片给该模型
              </span>
            </label>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="确认删除"
        footer={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setDeleteTarget(null)} style={btnSecondary}>
              取消
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                ...btnSecondary,
                background: 'var(--error)',
                color: '#fff',
                borderColor: 'var(--error)',
                opacity: deleting ? 0.6 : 1,
              }}
            >
              {deleting ? '删除中...' : '确认删除'}
            </button>
          </div>
        }
      >
        {deleteTarget && (
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '16px',
              background: 'var(--error-bg)',
              borderRadius: 8,
              marginBottom: 16,
            }}>
              <AlertTriangle size={20} style={{ color: 'var(--error)', flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 14, color: 'var(--fg)', fontWeight: 500 }}>
                  确定要删除模型「{deleteTarget.name}」吗？
                </p>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  此操作不可撤销。如果该模型已被设为默认模型，删除后需要重新配置。
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

/* ===== Sub-components ===== */

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint && (
        <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 4 }}>{hint}</p>
      )}
    </div>
  )
}

function DefaultModelCard({
  icon,
  title,
  model,
  models,
  onChange,
}: {
  type: 'translate' | 'chat'
  icon: React.ReactNode
  title: string
  model: AIModel | undefined
  models: AIModel[]
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const provider = model ? detectProvider(model.api_base_url, model.name) : null

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '20px',
      position: 'relative',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
        color: 'var(--muted)',
        fontSize: 13,
        fontWeight: 500,
      }}>
        {icon}
        {title}
      </div>
      {model ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {provider && (
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: providerStyles[provider].bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
                color: providerStyles[provider].color,
              }}>
                {providerStyles[provider].label[0]}
              </div>
            )}
            <span style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--fg)',
            }}>
              {model.name}
            </span>
            {model.is_verified && (
              <span style={badgeVerified}>已验证</span>
            )}
          </div>
          <div style={{
            fontSize: 12,
            color: 'var(--stone)',
            fontFamily: 'var(--font-mono)',
            marginBottom: 12,
          }}>
            {model.model_id}
          </div>
        </div>
      ) : (
        <div style={{
          fontSize: 13,
          color: 'var(--stone)',
          marginBottom: 12,
          padding: '12px 0',
        }}>
          未设置默认模型
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--muted)',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--ring-deep)'
            e.currentTarget.style.color = 'var(--fg)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--muted)'
          }}
        >
          更改
          <ChevronDown size={14} />
        </button>
        {open && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            minWidth: 200,
            zIndex: 10,
            overflow: 'hidden',
          }}>
            {models.length === 0 ? (
              <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--stone)' }}>
                暂无可用模型
              </div>
            ) : (
              models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { onChange(m.id); setOpen(false) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '10px 16px',
                    background: model?.id === m.id ? 'var(--bg)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--fg)',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = model?.id === m.id ? 'var(--bg)' : 'transparent')}
                >
                  <span style={{ flex: 1 }}>{m.name}</span>
                  {model?.id === m.id && (
                    <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ModelCard({
  model,
  testing,
  testResult,
  onTest,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  model: AIModel
  testing: boolean
  testResult?: { success: boolean; message: string; latency_ms?: number }
  onTest: () => void
  onEdit: () => void
  onDelete: () => void
  onSetDefault: (type: 'translate' | 'chat') => void
}) {
  const provider = detectProvider(model.api_base_url, model.name)
  const ps = providerStyles[provider]
  const [showActions, setShowActions] = useState(false)

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '20px',
      transition: 'border-color 0.2s',
    }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border2)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: ps.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 700,
          color: ps.color,
          flexShrink: 0,
        }}>
          {ps.label[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--fg)',
            }}>
              {model.name}
            </span>
            {model.is_verified ? (
              <span style={badgeVerified}>
                <CheckCircle2 size={10} strokeWidth={2.5} />
                已验证
              </span>
            ) : (
              <span style={badgeUnverified}>
                <XCircle size={10} strokeWidth={2.5} />
                未验证
              </span>
            )}
            {model.supports_vision && (
              <span style={badgeVision}>👁 Vision</span>
            )}
            {model.is_default_translate != null && (
              <span style={badgeDefault}>翻译默认</span>
            )}
            {model.is_default_chat != null && (
              <span style={badgeDefault}>问答默认</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--stone)', marginTop: 2 }}>
            {ps.label} · {model.model_id}
          </div>
        </div>

        {/* Actions dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowActions(!showActions)}
            style={{
              padding: '6px 10px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--muted)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--ring-deep)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            操作
            <ChevronDown size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
          </button>
          {showActions && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              minWidth: 160,
              zIndex: 10,
              overflow: 'hidden',
            }}>
              {model.is_default_translate == null && (
                <DropdownItem
                  label="设为翻译默认"
                  onClick={() => { onSetDefault('translate'); setShowActions(false) }}
                />
              )}
              {model.is_default_chat == null && (
                <DropdownItem
                  label="设为问答默认"
                  onClick={() => { onSetDefault('chat'); setShowActions(false) }}
                />
              )}
              <DropdownItem label="编辑" onClick={() => { onEdit(); setShowActions(false) }} />
              <DropdownItem label="删除" danger onClick={() => { onDelete(); setShowActions(false) }} />
            </div>
          )}
        </div>
      </div>

      {/* Body: API info grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        marginBottom: 16,
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--stone)', marginBottom: 4, fontWeight: 500 }}>API Base URL</div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--fg2)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '8px 10px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {model.api_base_url}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--stone)', marginBottom: 4, fontWeight: 500 }}>API Key</div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--fg2)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '8px 10px',
            letterSpacing: 2,
          }}>
            {maskKey()}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 12, color: 'var(--stone)' }}>
          添加于 {formatTime(model.created_at)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {testResult && (
            <span style={{
              fontSize: 12,
              color: testResult.success ? 'var(--success)' : 'var(--error)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              {testResult.success ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              {testResult.success
                ? `${testResult.latency_ms ?? '?'}ms`
                : testResult.message}
            </span>
          )}
          <button
            onClick={onTest}
            disabled={testing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 14px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 12,
              color: testing ? 'var(--stone)' : 'var(--fg2)',
              cursor: testing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!testing) e.currentTarget.style.borderColor = 'var(--ring-deep)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            {testing ? (
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Zap size={13} />
            )}
            {testing ? '测试中' : '测试'}
          </button>
          <button
            onClick={onEdit}
            style={{
              padding: '6px 14px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--fg2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--ring-deep)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            <Pencil size={13} />
            编辑
          </button>
          <button
            onClick={onDelete}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--error)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--error-bg)'
              e.currentTarget.style.borderColor = 'var(--error)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            <Trash2 size={13} />
            删除
          </button>
        </div>
      </div>
    </div>
  )
}

function DropdownItem({ label, danger, onClick }: { label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        padding: '9px 16px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontSize: 13,
        color: danger ? 'var(--error)' : 'var(--fg)',
        textAlign: 'left',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? 'var(--error-bg)' : 'var(--bg)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  )
}

/* ===== Shared styles ===== */

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 14,
  color: 'var(--fg)',
  outline: 'none',
  transition: 'border-color 0.2s',
}

const btnPrimary: React.CSSProperties = {
  padding: '9px 18px',
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}

const btnSecondary: React.CSSProperties = {
  padding: '9px 18px',
  background: 'var(--surface)',
  color: 'var(--fg2)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}

const badgeVerified: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: '2px 8px',
  background: 'var(--success-bg)',
  color: 'var(--success)',
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 500,
}

const badgeUnverified: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: '2px 8px',
  background: 'var(--surface)',
  color: 'var(--stone)',
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 500,
}

const badgeDefault: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  background: 'var(--warn-bg)',
  color: 'var(--warn)',
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 500,
}

const badgeVision: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: '2px 8px',
  background: '#e8f0fe',
  color: '#3b6fc0',
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 500,
}
