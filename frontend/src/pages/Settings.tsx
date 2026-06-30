import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useToastStore } from '../components/Toast'
import { system } from '../api/client'
import type { Engine } from '../api/types'
import { Cpu, Globe, BookOpen, MessageSquare, Info, ChevronDown, ChevronRight, RotateCcw, Save, Download, CheckCircle2, AlertCircle, Loader2, ExternalLink, Folder, Trash2 } from 'lucide-react'

// ─── Sub-components ──────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: checked ? 'var(--accent)' : 'var(--sand)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: 'var(--surface)',
        position: 'absolute',
        top: 3,
        left: checked ? 23 : 3,
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      }} />
    </button>
  )
}

function Slider({ value, min, max, step, onChange, suffix }: {
  value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          flex: 1,
          height: 4,
          appearance: 'none',
          WebkitAppearance: 'none',
          background: `linear-gradient(to right, var(--accent) ${pct}%, var(--border2) ${pct}%)`,
          borderRadius: 2,
          outline: 'none',
          cursor: 'pointer',
          accentColor: 'var(--accent)',
        }}
      />
      <span style={{ fontSize: 13, color: 'var(--stone)', minWidth: 48, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        {value}{suffix}
      </span>
    </div>
  )
}

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          padding: '8px 36px 8px 14px',
          border: '1px solid var(--border2)',
          borderRadius: 8,
          background: 'var(--surface)',
          color: 'var(--fg)',
          fontSize: 13,
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          outline: 'none',
          minWidth: 180,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} style={{
        position: 'absolute',
        right: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
        color: 'var(--stone)',
      }} />
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ color: 'var(--accent)', display: 'flex' }}>{icon}</span>
      <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>{title}</h3>
    </div>
  )
}

function SectionDesc({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 20, lineHeight: 1.5 }}>{children}</p>
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
      <span style={{ fontSize: 14, color: 'var(--fg2)' }}>{label}</span>
      {children}
    </div>
  )
}

// ─── Engine Card ─────────────────────────────────────────────

type InstallState = {
  status: 'idle' | 'starting' | 'downloading' | 'completed' | 'failed'
  progress: number
  message: string
  logs: Array<string | { message: string; percent: number }>
  showManual: boolean
}

function EngineCard({ engine, isDefault, onSetDefault, onInstallComplete }: {
  engine: Engine
  isDefault: boolean
  onSetDefault: () => void
  onInstallComplete: () => void
}) {
  const engineIcons: Record<string, string> = {
    PyMuPDF: '📄',
    Marker: '🔬',
    MinerU: '⛏️',
  }
  const icon = engineIcons[engine.name] || '⚙️'
  const engineKey = engine.name.toLowerCase()  // 'marker' / 'mineru' / 'pymupdf'
  const canInstall = engineKey === 'marker' || engineKey === 'mineru'

  const [install, setInstall] = useState<InstallState>({
    status: 'idle', progress: 0, message: '', logs: [], showManual: false,
  })
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [])

  const startInstall = async () => {
    setInstall({ status: 'starting', progress: 0, message: '正在启动安装...', logs: [], showManual: false })
    try {
      await system.installEngine(engineKey)
      // 开始轮询状态
      setInstall(s => ({ ...s, status: 'downloading', message: '正在下载...', progress: 5 }))
      pollRef.current = window.setInterval(async () => {
        try {
          const status = await system.engineInstallStatus(engineKey)
          // 后端没有顶层 message，从最近一条 log 推导
          const lastLog = status.logs?.[status.logs.length - 1]
          const msgText = lastLog && typeof lastLog === 'object'
            ? lastLog.message
            : (lastLog as string | undefined)
          const newState: InstallState = {
            status: status.status === 'completed' ? 'completed'
                  : status.status === 'failed' ? 'failed'
                  : 'downloading',
            progress: status.progress ?? 0,
            message: msgText ?? '',
            logs: status.logs ?? [],
            showManual: install.showManual,
          }
          setInstall(newState)
          if (newState.status === 'completed') {
            if (pollRef.current) window.clearInterval(pollRef.current)
            onInstallComplete()
          } else if (newState.status === 'failed') {
            if (pollRef.current) window.clearInterval(pollRef.current)
          }
        } catch (e) {
          // 忽略单次轮询错误
        }
      }, 1500)
    } catch (err: any) {
      setInstall(s => ({ ...s, status: 'failed', message: err.message || '启动失败' }))
    }
  }

  const renderAction = () => {
    if (!canInstall) {
      // PyMuPDF 等内置引擎
      return (
        <span style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500,
          background: 'var(--success-bg)', color: 'var(--success)',
        }}>内置</span>
      )
    }

    if (engine.available) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500,
            background: 'var(--success-bg)', color: 'var(--success)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <CheckCircle2 size={11} /> 已安装
          </span>
          {!isDefault && (
            <button onClick={onSetDefault} style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 500,
              border: '1px solid var(--border2)', borderRadius: 8,
              background: 'var(--surface)', color: 'var(--fg2)', cursor: 'pointer',
            }}>设为默认</button>
          )}
        </div>
      )
    }

    // 未安装
    const isWorking = install.status === 'starting' || install.status === 'downloading'
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {isWorking ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--stone)', marginBottom: 4 }}>
                {install.message || '下载中...'} {install.progress}%
              </div>
              <div style={{
                height: 4, background: 'var(--sand)', borderRadius: 2, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${install.progress}%`, height: '100%',
                  background: 'var(--accent)', transition: 'width 0.3s',
                }} />
              </div>
            </div>
          </div>
        ) : install.status === 'completed' ? (
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500,
            background: 'var(--success-bg)', color: 'var(--success)',
          }}>安装完成</span>
        ) : install.status === 'failed' ? (
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500,
            background: 'var(--error-bg)', color: 'var(--error)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <AlertCircle size={11} /> 失败
          </span>
        ) : (
          <button onClick={startInstall} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 500,
            border: 'none', borderRadius: 8,
            background: 'var(--accent)', color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Download size={12} /> 下载安装
          </button>
        )}
        {!isDefault && engine.available && (
          <button onClick={onSetDefault} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 500,
            border: '1px solid var(--border2)', borderRadius: 8,
            background: 'var(--surface)', color: 'var(--fg2)', cursor: 'pointer',
          }}>设为默认</button>
        )}
      </div>
    )
  }

  const manualDir = `C:\\Users\\<你的用户名>\\.paperlens\\engines\\${engineKey}-engine`
  const downloadUrl = engineKey === 'marker'
    ? 'https://github.com/paper-reader/engines/releases'
    : 'https://github.com/paper-reader/engines/releases'

  return (
    <div style={{
      background: install.status === 'failed' ? 'rgba(239,68,68,0.03)' : 'var(--white)',
      border: `1px solid ${install.status === 'failed' ? 'var(--error-bg)' : 'var(--border)'}`,
      borderRadius: 12, marginBottom: 10, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: 'var(--bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>{icon}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{engine.name}</span>
            {isDefault && (
              <span style={{
                fontSize: 10, padding: '2px 8px', background: 'var(--accent)',
                color: '#fff', borderRadius: 10, fontWeight: 500,
              }}>默认</span>
            )}
            {engine.error && !engine.available && (
              <span style={{
                fontSize: 10, padding: '2px 8px',
                background: 'var(--error-bg)', color: 'var(--error)',
                borderRadius: 10, fontWeight: 500,
              }}>未安装</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 4, lineHeight: 1.4 }}>
            {engine.description}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--silver)' }}>
            {engine.version && <span>v{engine.version}</span>}
            {engine.install_size_mb > 0 && <span>{engine.install_size_mb} MB</span>}
            {engine.built_in && <span>内置</span>}
          </div>
        </div>

        {renderAction()}
      </div>

      {/* 手动安装说明（仅 marker / mineru） */}
      {canInstall && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setInstall(s => ({ ...s, showManual: !s.showManual }))}
            style={{
              width: '100%', padding: '10px 20px', background: 'var(--surface)',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 12, color: 'var(--stone)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {install.showManual ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              网络不好？查看手动安装说明
            </span>
          </button>
          {install.showManual && (
            <div style={{
              padding: '14px 20px 18px', background: 'var(--surface)',
              fontSize: 12, color: 'var(--fg2)', lineHeight: 1.7,
            }}>
              <p style={{ marginBottom: 10, color: 'var(--stone)' }}>
                如果自动下载失败（网络受限或下载速度慢），可以手动下载引擎包并解压到指定目录，然后点击"重新检测"。
              </p>
              <ol style={{ paddingLeft: 20, marginBottom: 10 }}>
                <li style={{ marginBottom: 6 }}>
                  访问{' '}
                  <a
                    href={downloadUrl}
                    target="_blank" rel="noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'none' }}
                  >
                    GitHub Releases <ExternalLink size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />
                  </a>
                  ，下载对应平台的 {engineKey}-engine-{engineKey === 'marker' ? 'windows-x86_64' : 'windows-x86_64'}.zip
                </li>
                <li style={{ marginBottom: 6 }}>
                  解压到目录：
                  <code style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 6px', marginLeft: 4,
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 11,
                  }}>
                    <Folder size={10} /> {manualDir}
                  </code>
                </li>
                <li style={{ marginBottom: 6 }}>
                  确保目录中包含 <code style={{ padding: '1px 4px', background: 'var(--bg)', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>{engineKey}-engine{engineKey === 'mineru' ? '.bat' : '.exe'}</code> 文件
                </li>
                <li>重启 PaperLens，系统会自动检测到引擎</li>
              </ol>
            </div>
          )}

          {install.status === 'failed' && install.logs.length > 0 && (
            <div style={{
              padding: '12px 20px', background: 'var(--error-bg)',
              fontSize: 11, color: 'var(--error)', fontFamily: 'var(--font-mono)',
              maxHeight: 120, overflowY: 'auto',
            }}>
              {install.logs.slice(-5).map((log, i) => {
                const text = typeof log === 'string' ? log : (log?.message ?? String(log))
                return <div key={i}>{text}</div>
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────

export default function Settings() {
  const { settings, engines, models, loading, fetchSettings, updateSettings, resetSettings, fetchEngines, fetchModels } = useSettingsStore()
  const showToast = useToastStore((s) => s.showToast)
  const navigate = useNavigate()

  // Local state mirrors
  const [parseEngine, setParseEngine] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('zh')
  const [translateStyle, setTranslateStyle] = useState('academic')
  const [autoTranslate, setAutoTranslate] = useState(true)
  const [preloadNextPage, setPreloadNextPage] = useState(false)
  const [enableThinking, setEnableThinking] = useState(false)
  const [glossaryModelId, setGlossaryModelId] = useState<string>('')
  const [fontSize, setFontSize] = useState(16)
  const [lineHeight, setLineHeight] = useState(1.75)
  const [pdfDisplayMode, setPdfDisplayMode] = useState('mixed')
  const [syncScroll, setSyncScroll] = useState(true)
  const [theme, setTheme] = useState('dark')
  const [qaTemperature, setQaTemperature] = useState(0.3)
  const [qaMaxTokens, setQaMaxTokens] = useState('4096')
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [dataInfo, setDataInfo] = useState<{ data_dir: string; db_size: number; parse_cache_size: number; papers_size: number; paper_count: number; pages_count: number; translations_count: number } | null>(null)
  const [clearing, setClearing] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string>('engine')

  // Initial load
  useEffect(() => {
    fetchSettings()
    fetchEngines()
    fetchModels()
    system.dataInfo().then(setDataInfo).catch(() => {})
  }, [])

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleClearCache = async (type: 'parse' | 'translations' | 'all') => {
    if (!confirm(type === 'all' ? '确认清理所有缓存？这将删除所有解析和翻译结果，需要重新解析。' : `确认清理${type === 'parse' ? '解析' : '翻译'}缓存？`)) return
    setClearing(type)
    try {
      await system.clearCache(type)
      showToast('缓存已清理')
      const info = await system.dataInfo()
      setDataInfo(info)
    } catch (err: any) {
      showToast('清理失败: ' + (err.message || '未知错误'))
    } finally {
      setClearing(null)
    }
  }

  // Sync from store to local state when settings load
  useEffect(() => {
    if (settings) {
      setParseEngine(settings.parse_engine || '')
      setTargetLanguage(settings.target_language || 'zh')
      setTranslateStyle(settings.translate_style || 'academic')
      setAutoTranslate(settings.auto_translate ?? true)
      setPreloadNextPage(settings.preload_next_page ?? false)
      setEnableThinking(settings.enable_thinking ?? false)
      setGlossaryModelId(settings.glossary_model_id ?? '')
      setFontSize(settings.font_size ?? 16)
      setLineHeight(settings.line_height ?? 1.75)
      setPdfDisplayMode(settings.pdf_display_mode || 'mixed')
      setSyncScroll(settings.sync_scroll ?? true)
      setTheme(settings.theme || 'dark')
      setQaTemperature(settings.qa_temperature ?? 0.3)
      setQaMaxTokens(String(settings.qa_max_tokens ?? 4096))
    }
  }, [settings])

  // Track changes
  useEffect(() => {
    if (!settings) return
    const changed =
      parseEngine !== (settings.parse_engine || '') ||
      targetLanguage !== (settings.target_language || 'zh') ||
      translateStyle !== (settings.translate_style || 'academic') ||
      autoTranslate !== (settings.auto_translate ?? true) ||
      preloadNextPage !== (settings.preload_next_page ?? false) ||
      enableThinking !== (settings.enable_thinking ?? false) ||
      glossaryModelId !== (settings.glossary_model_id ?? '') ||
      fontSize !== (settings.font_size ?? 16) ||
      lineHeight !== (settings.line_height ?? 1.75) ||
      pdfDisplayMode !== (settings.pdf_display_mode || 'mixed') ||
      syncScroll !== (settings.sync_scroll ?? true) ||
      theme !== (settings.theme || 'dark') ||
      qaTemperature !== (settings.qa_temperature ?? 0.3) ||
      String(qaMaxTokens) !== String(settings.qa_max_tokens ?? 4096)
    setHasChanges(changed)
  }, [settings, parseEngine, targetLanguage, translateStyle, autoTranslate, preloadNextPage, enableThinking, glossaryModelId, fontSize, lineHeight, pdfDisplayMode, syncScroll, theme, qaTemperature, qaMaxTokens])

  const handleSetDefaultEngine = async (engineName: string) => {
    setParseEngine(engineName)
  }

  const handleInstallComplete = async () => {
    showToast('引擎安装完成')
    await fetchEngines()  // 重新获取引擎列表
  }

  const handleRecheck = async () => {
    try {
      const res = await system.recheckEngines()
      showToast(res.message || '引擎检测完成')
      await fetchEngines()
    } catch (err: any) {
      showToast('检测失败: ' + (err.message || '未知错误'))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSettings({
        parse_engine: parseEngine,
        target_language: targetLanguage,
        translate_style: translateStyle,
        auto_translate: autoTranslate,
        preload_next_page: preloadNextPage,
        enable_thinking: enableThinking,
        glossary_model_id: glossaryModelId || null,
        font_size: fontSize,
        line_height: lineHeight,
        pdf_display_mode: pdfDisplayMode,
        sync_scroll: syncScroll,
        theme: theme,
        qa_temperature: qaTemperature,
        qa_max_tokens: Number(qaMaxTokens),
      })
      showToast('设置已保存')
    } catch (err: any) {
      showToast('保存失败: ' + (err.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (settings) {
      setParseEngine(settings.parse_engine || '')
      setTargetLanguage(settings.target_language || 'zh')
      setTranslateStyle(settings.translate_style || 'academic')
      setAutoTranslate(settings.auto_translate ?? true)
      setPreloadNextPage(settings.preload_next_page ?? false)
      setEnableThinking(settings.enable_thinking ?? false)
      setGlossaryModelId(settings.glossary_model_id ?? '')
      setFontSize(settings.font_size ?? 16)
      setLineHeight(settings.line_height ?? 1.75)
      setPdfDisplayMode(settings.pdf_display_mode || 'mixed')
      setSyncScroll(settings.sync_scroll ?? true)
      setTheme(settings.theme || 'dark')
      setQaTemperature(settings.qa_temperature ?? 0.3)
      setQaMaxTokens(String(settings.qa_max_tokens ?? 4096))
    }
    showToast('已取消修改')
  }

  const handleReset = async () => {
    if (!confirm('确定要重置所有设置吗？此操作不可恢复。')) return
    try {
      await resetSettings()
      showToast('所有设置已重置')
    } catch (err: any) {
      showToast('重置失败: ' + (err.message || '未知错误'))
    }
  }

  const handleCheckUpdate = () => {
    showToast('当前已是最新版本 v1.0.0')
  }

  if (loading && !settings) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
        <Sidebar currentPage="settings" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--stone)', fontSize: 14 }}>
          加载中...
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
      <Sidebar currentPage="settings" />

      <main style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* ── Secondary menu (二级菜单) ── */}
        <div style={{
          width: '200px',
          flexShrink: 0,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          padding: '24px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}>
          {[
            { id: 'models', label: '模型管理', icon: Cpu },
            { id: 'engine', label: '解析引擎', icon: Cpu },
            { id: 'translate', label: '翻译设置', icon: Globe },
            { id: 'reading', label: '阅读体验', icon: BookOpen },
            { id: 'qa', label: '问答设置', icon: MessageSquare },
            { id: 'data', label: '数据管理', icon: Folder },
            { id: 'about', label: '关于', icon: Info },
          ].map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.id
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'models') {
                    navigate('/models')
                  } else {
                    setActiveSection(item.id)
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 16px',
                  margin: '0 8px',
                  background: isActive ? 'var(--sand)' : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: isActive ? 'var(--fg)' : 'var(--muted)',
                  fontWeight: isActive ? 500 : 400,
                  fontSize: '13px',
                  transition: 'all 0.15s',
                  textAlign: 'left',
                  width: 'calc(100% - 16px)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--bg)'
                    e.currentTarget.style.color = 'var(--fg)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--muted)'
                  }
                }}
              >
                <Icon size={16} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>

        {/* ── Content area ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '32px 48px 0', flexShrink: 0 }}>
            <h1 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 28,
              fontWeight: 700,
              color: 'var(--fg)',
              marginBottom: 6,
            }}>
              {activeSection === 'engine' ? '解析引擎' :
               activeSection === 'translate' ? '翻译设置' :
               activeSection === 'reading' ? '阅读体验' :
               activeSection === 'qa' ? '问答设置' :
               activeSection === 'data' ? '数据管理' : '关于'}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--stone)', lineHeight: 1.5 }}>
              {activeSection === 'engine' ? '选择默认的 PDF 解析引擎。不同引擎在速度、精度和格式支持上有差异。' :
               activeSection === 'translate' ? '配置翻译目标语言、风格和预加载行为。' :
               activeSection === 'reading' ? '调整阅读界面的字体、行高和显示模式。' :
               activeSection === 'qa' ? '调整 AI 问答的生成参数。' :
               activeSection === 'data' ? '查看数据占用和清理缓存。' : '应用信息和重置选项。'}
            </p>
          </div>

          {/* Scrollable Content */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 48px 100px',
          }}>
            <div style={{ maxWidth: 760 }}>

              {/* ── Section: 解析引擎 ── */}
              {activeSection === 'engine' && (
                <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <SectionTitle icon={<Cpu size={18} />} title="解析引擎" />
                <button
                  onClick={handleRecheck}
                  style={{
                    padding: '4px 12px', fontSize: 12, fontWeight: 500,
                    border: '1px solid var(--border2)', borderRadius: 6,
                    background: 'var(--surface)', color: 'var(--fg2)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <RotateCcw size={12} /> 重新检测
                </button>
              </div>
              <SectionDesc>选择默认的 PDF 解析引擎。不同引擎在速度、精度和格式支持上有差异。</SectionDesc>

              {engines.map((engine) => (
                <EngineCard
                  key={engine.name}
                  engine={engine}
                  isDefault={parseEngine === engine.name}
                  onSetDefault={() => handleSetDefaultEngine(engine.name)}
                  onInstallComplete={handleInstallComplete}
                />
              ))}

              {engines.length === 0 && (
                <div style={{
                  padding: '32px',
                  textAlign: 'center',
                  color: 'var(--stone)',
                  fontSize: 13,
                  background: 'var(--surface)',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                }}>
                  未检测到可用的解析引擎
                </div>
              )}
            </section>
              )}

            {/* ── Section 2: 翻译设置 ── */}
            {activeSection === 'translate' && (
            <section>
              <SectionTitle icon={<Globe size={18} />} title="翻译设置" />
              <SectionDesc>配置翻译目标语言、风格和预加载行为。</SectionDesc>

              <SettingRow label="目标语言">
                <SelectInput
                  value={targetLanguage}
                  onChange={setTargetLanguage}
                  options={[
                    { value: 'zh', label: '中文' },
                    { value: 'ja', label: '日语' },
                    { value: 'ko', label: '韩语' },
                    { value: 'fr', label: '法语' },
                    { value: 'de', label: '德语' },
                    { value: 'es', label: '西班牙语' },
                  ]}
                />
              </SettingRow>

              <SettingRow label="翻译风格">
                <SelectInput
                  value={translateStyle}
                  onChange={setTranslateStyle}
                  options={[
                    { value: 'academic', label: '学术' },
                    { value: 'casual', label: '通俗' },
                    { value: 'literal', label: '直译' },
                  ]}
                />
              </SettingRow>

              <SettingRow label="预加载下一页">
                <Toggle checked={preloadNextPage} onChange={setPreloadNextPage} />
              </SettingRow>

              <SettingRow label="自动翻译当前页">
                <Toggle checked={autoTranslate} onChange={setAutoTranslate} />
              </SettingRow>

              <SettingRow label="AI 思考模式">
                <Toggle checked={enableThinking} onChange={setEnableThinking} />
              </SettingRow>
              <div style={{ fontSize: 11, color: 'var(--silver)', marginTop: -8, marginBottom: 12, lineHeight: 1.5 }}>
                关闭后翻译/问答不使用深度思考，首 token 更快（推荐关闭）。部分模型（如 Qwen）支持此选项。
              </div>

              <SettingRow label="术语查询模型">
                <SelectInput
                  value={glossaryModelId}
                  onChange={setGlossaryModelId}
                  options={[
                    { value: '', label: '跟随默认问答模型' },
                    ...models.map((m: any) => ({ value: m.id, label: m.name })),
                  ]}
                />
              </SettingRow>
              <div style={{ fontSize: 11, color: 'var(--silver)', marginTop: -8, marginBottom: 12, lineHeight: 1.5 }}>
                为术语查询指定独立模型（可选用更快的小模型），不指定则使用默认问答模型。
              </div>
            </section>
            )}

            {/* ── Section 3: 阅读体验 ── */}
            {activeSection === 'reading' && (
            <section>
              <SectionTitle icon={<BookOpen size={18} />} title="阅读体验" />
              <SectionDesc>调整阅读界面的字体、行高和显示模式。</SectionDesc>

              <div style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, color: 'var(--fg2)' }}>正文字号</span>
                </div>
                <Slider value={fontSize} min={12} max={24} step={1} onChange={setFontSize} suffix="px" />
              </div>

              <div style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, color: 'var(--fg2)' }}>行高</span>
                </div>
                <Slider value={lineHeight} min={1.2} max={2.5} step={0.1} onChange={setLineHeight} />
              </div>

              <SettingRow label="PDF 显示模式">
                <SelectInput
                  value={pdfDisplayMode}
                  onChange={setPdfDisplayMode}
                  options={[
                    { value: 'pdf', label: '原始 PDF' },
                    { value: 'text', label: '纯文本' },
                    { value: 'mixed', label: '混合模式' },
                  ]}
                />
              </SettingRow>

              <SettingRow label="同步滚动">
                <Toggle checked={syncScroll} onChange={setSyncScroll} />
              </SettingRow>

              <SettingRow label="主题">
                <SelectInput
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: 'light', label: '浅色' },
                    { value: 'dark', label: '深色' },
                    { value: 'auto', label: '跟随系统' },
                  ]}
                />
              </SettingRow>
            </section>
            )}

            {/* ── Section 4: 问答设置 ── */}
            {activeSection === 'qa' && (
            <section>
              <SectionTitle icon={<MessageSquare size={18} />} title="问答设置" />
              <SectionDesc>调整 AI 问答的生成参数。</SectionDesc>

              <div style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, color: 'var(--fg2)' }}>Temperature</span>
                </div>
                <Slider value={qaTemperature} min={0} max={1} step={0.1} onChange={setQaTemperature} />
                <div style={{ fontSize: 11, color: 'var(--silver)', marginTop: 4 }}>0 = 精确回答，1 = 创造性回答</div>
              </div>

              <SettingRow label="最大 Tokens">
                <SelectInput
                  value={qaMaxTokens}
                  onChange={setQaMaxTokens}
                  options={[
                    { value: '2048', label: '2048' },
                    { value: '4096', label: '4096' },
                    { value: '8192', label: '8192' },
                    { value: '16384', label: '16384' },
                  ]}
                />
              </SettingRow>
            </section>
            )}

            {/* ── Section: 数据管理 ── */}
            {activeSection === 'data' && (
            <section>
              <SectionTitle icon={<Folder size={18} />} title="数据管理" />
              <SectionDesc>查看数据占用和清理缓存。</SectionDesc>

              {dataInfo && (
                <>
                  {/* Data directory */}
                  <SettingRow label="数据目录">
                    <div style={{ fontSize: 12, color: 'var(--silver)', fontFamily: 'var(--font-mono)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={dataInfo.data_dir}>
                      {dataInfo.data_dir}
                    </div>
                  </SettingRow>

                  {/* Storage breakdown */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 120, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: 'var(--silver)', marginBottom: 4 }}>论文文件</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>{formatSize(dataInfo.papers_size)}</div>
                      <div style={{ fontSize: 11, color: 'var(--stone)', marginTop: 2 }}>{dataInfo.paper_count} 篇</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 120, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: 'var(--silver)', marginBottom: 4 }}>解析缓存</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>{formatSize(dataInfo.parse_cache_size)}</div>
                      <div style={{ fontSize: 11, color: 'var(--stone)', marginTop: 2 }}>{dataInfo.pages_count} 页</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 120, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: 'var(--silver)', marginBottom: 4 }}>数据库</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>{formatSize(dataInfo.db_size)}</div>
                      <div style={{ fontSize: 11, color: 'var(--stone)', marginTop: 2 }}>{dataInfo.translations_count} 条翻译</div>
                    </div>
                  </div>

                  {/* Clear cache buttons */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleClearCache('parse')}
                      disabled={clearing !== null}
                      style={{
                        padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                        border: '1px solid var(--border2)', background: 'var(--surface)', color: 'var(--fg2)',
                        cursor: clearing ? 'not-allowed' : 'pointer', opacity: clearing ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
                      }}
                    >
                      {clearing === 'parse' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={14} />}
                      清理解析缓存
                    </button>
                    <button
                      onClick={() => handleClearCache('translations')}
                      disabled={clearing !== null}
                      style={{
                        padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                        border: '1px solid var(--border2)', background: 'var(--surface)', color: 'var(--fg2)',
                        cursor: clearing ? 'not-allowed' : 'pointer', opacity: clearing ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
                      }}
                    >
                      {clearing === 'translations' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={14} />}
                      清理翻译缓存
                    </button>
                    <button
                      onClick={() => handleClearCache('all')}
                      disabled={clearing !== null}
                      style={{
                        padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                        border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: 'var(--error)',
                        cursor: clearing ? 'not-allowed' : 'pointer', opacity: clearing ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
                      }}
                    >
                      {clearing === 'all' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                      清理全部缓存
                    </button>
                  </div>
                </>
              )}
            </section>
            )}

            {/* ── Section 5: 关于 ── */}
            {activeSection === 'about' && (
            <section>
              <SectionTitle icon={<Info size={18} />} title="关于" />
              <SectionDesc>应用信息和重置选项。</SectionDesc>

              {/* App Info Card */}
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                marginBottom: 20,
              }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontFamily: 'var(--font-serif)',
                  fontSize: 26,
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  P
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>PaperLens</div>
                  <div style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 4 }}>版本 1.0.0</div>
                  <div style={{ fontSize: 12, color: 'var(--silver)', lineHeight: 1.5 }}>
                    基于 React + FastAPI 构建的学术论文阅读助手
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={handleCheckUpdate}
                  style={{
                    padding: '10px 20px',
                    fontSize: 13,
                    fontWeight: 500,
                    border: '1px solid var(--border2)',
                    borderRadius: 8,
                    background: 'var(--surface)',
                    color: 'var(--fg2)',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  检查更新
                </button>

                <button
                  onClick={handleReset}
                  style={{
                    padding: '10px 20px',
                    fontSize: 13,
                    fontWeight: 500,
                    border: '1px solid var(--error-bg)',
                    borderRadius: 8,
                    background: 'var(--surface)',
                    color: 'var(--error)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'background 0.15s',
                  }}
                >
                  <RotateCcw size={14} />
                  重置所有设置
                </button>
              </div>
            </section>
            )}
            </div>
          </div>
        </div>

        {/* ── Save Bar (fixed bottom) ── */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          padding: '14px 48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
        }}>
          <span style={{ fontSize: 13, color: 'var(--stone)' }}>
            {hasChanges ? '有未保存的更改' : '所有设置已保存'}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleCancel}
              disabled={!hasChanges}
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 500,
                border: '1px solid var(--border2)',
                borderRadius: 8,
                background: 'transparent',
                color: hasChanges ? 'var(--fg2)' : 'var(--silver)',
                cursor: hasChanges ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              style={{
                padding: '8px 24px',
                fontSize: 13,
                fontWeight: 500,
                border: 'none',
                borderRadius: 8,
                background: hasChanges ? 'var(--accent)' : 'var(--sand)',
                color: hasChanges ? '#fff' : 'var(--silver)',
                cursor: hasChanges && !saving ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s',
              }}
            >
              <Save size={14} />
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
