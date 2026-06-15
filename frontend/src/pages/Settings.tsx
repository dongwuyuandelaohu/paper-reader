import { useState, useEffect } from 'react'
import { Sidebar } from '../components/Sidebar'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useToastStore } from '../components/Toast'
import type { Engine } from '../api/types'
import { Cpu, Globe, BookOpen, MessageSquare, Info, ChevronDown, RotateCcw, Save } from 'lucide-react'

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
        background: '#fff',
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
          background: 'var(--white)',
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

function SectionDivider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '32px 0' }} />
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

function EngineCard({ engine, isDefault, onSetDefault }: {
  engine: Engine; isDefault: boolean; onSetDefault: () => void
}) {
  const engineIcons: Record<string, string> = {
    PyMuPDF: '📄',
    Marker: '🔬',
    MinerU: '⛏️',
  }
  const icon = engineIcons[engine.name] || '⚙️'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '16px 20px',
      background: isDefault ? 'var(--surface)' : 'var(--white)',
      border: isDefault ? '1.5px solid var(--accent)' : '1px solid var(--border)',
      borderRadius: 12,
      marginBottom: 10,
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        flexShrink: 0,
      }}>
        {icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{engine.name}</span>
          {isDefault && (
            <span style={{
              fontSize: 10,
              padding: '2px 8px',
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: 10,
              fontWeight: 500,
            }}>默认</span>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{
          fontSize: 11,
          padding: '3px 10px',
          borderRadius: 10,
          fontWeight: 500,
          background: engine.available ? 'var(--success-bg)' : 'var(--bg)',
          color: engine.available ? 'var(--success)' : 'var(--stone)',
        }}>
          {engine.available ? '可用' : '不可用'}
        </span>
        {!isDefault && engine.available && (
          <button
            onClick={onSetDefault}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 500,
              border: '1px solid var(--border2)',
              borderRadius: 8,
              background: 'var(--white)',
              color: 'var(--fg2)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            设为默认
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────

export default function Settings() {
  const { settings, engines, loading, fetchSettings, updateSettings, resetSettings, fetchEngines } = useSettingsStore()
  const showToast = useToastStore((s) => s.showToast)

  // Local state mirrors
  const [parseEngine, setParseEngine] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('zh')
  const [translateStyle, setTranslateStyle] = useState('academic')
  const [preloadNextPage, setPreloadNextPage] = useState(false)
  const [fontSize, setFontSize] = useState(16)
  const [lineHeight, setLineHeight] = useState(1.75)
  const [pdfDisplayMode, setPdfDisplayMode] = useState('mixed')
  const [syncScroll, setSyncScroll] = useState(true)
  const [darkTheme, setDarkTheme] = useState(false)
  const [qaTemperature, setQaTemperature] = useState(0.3)
  const [qaMaxTokens, setQaMaxTokens] = useState('4096')
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Initial load
  useEffect(() => {
    fetchSettings()
    fetchEngines()
  }, [])

  // Sync from store to local state when settings load
  useEffect(() => {
    if (settings) {
      setParseEngine(settings.parse_engine || '')
      setTargetLanguage(settings.target_language || 'zh')
      setTranslateStyle(settings.translate_style || 'academic')
      setPreloadNextPage(settings.preload_next_page ?? false)
      setFontSize(settings.font_size ?? 16)
      setLineHeight(settings.line_height ?? 1.75)
      setPdfDisplayMode(settings.pdf_display_mode || 'mixed')
      setSyncScroll(settings.sync_scroll ?? true)
      setDarkTheme(settings.theme === 'dark')
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
      preloadNextPage !== (settings.preload_next_page ?? false) ||
      fontSize !== (settings.font_size ?? 16) ||
      lineHeight !== (settings.line_height ?? 1.75) ||
      pdfDisplayMode !== (settings.pdf_display_mode || 'mixed') ||
      syncScroll !== (settings.sync_scroll ?? true) ||
      darkTheme !== (settings.theme === 'dark') ||
      qaTemperature !== (settings.qa_temperature ?? 0.3) ||
      String(qaMaxTokens) !== String(settings.qa_max_tokens ?? 4096)
    setHasChanges(changed)
  }, [settings, parseEngine, targetLanguage, translateStyle, preloadNextPage, fontSize, lineHeight, pdfDisplayMode, syncScroll, darkTheme, qaTemperature, qaMaxTokens])

  const handleSetDefaultEngine = async (engineName: string) => {
    setParseEngine(engineName)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSettings({
        parse_engine: parseEngine,
        target_language: targetLanguage,
        translate_style: translateStyle,
        preload_next_page: preloadNextPage,
        font_size: fontSize,
        line_height: lineHeight,
        pdf_display_mode: pdfDisplayMode,
        sync_scroll: syncScroll,
        theme: darkTheme ? 'dark' : 'light',
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
      setPreloadNextPage(settings.preload_next_page ?? false)
      setFontSize(settings.font_size ?? 16)
      setLineHeight(settings.line_height ?? 1.75)
      setPdfDisplayMode(settings.pdf_display_mode || 'mixed')
      setSyncScroll(settings.sync_scroll ?? true)
      setDarkTheme(settings.theme === 'dark')
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
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
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
            系统设置
          </h1>
          <p style={{ fontSize: 14, color: 'var(--stone)', lineHeight: 1.5 }}>
            自定义 PaperLens 的行为和外观，管理解析引擎与阅读偏好
          </p>
        </div>

        {/* Scrollable Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 48px 100px',
        }}>
          <div style={{ maxWidth: 760 }}>

            {/* ── Section 1: 解析引擎 ── */}
            <section>
              <SectionTitle icon={<Cpu size={18} />} title="解析引擎" />
              <SectionDesc>选择默认的 PDF 解析引擎。不同引擎在速度、精度和格式支持上有差异。</SectionDesc>

              {engines.map((engine) => (
                <EngineCard
                  key={engine.name}
                  engine={engine}
                  isDefault={parseEngine === engine.name}
                  onSetDefault={() => handleSetDefaultEngine(engine.name)}
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

            <SectionDivider />

            {/* ── Section 2: 翻译设置 ── */}
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
            </section>

            <SectionDivider />

            {/* ── Section 3: 阅读体验 ── */}
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

              <SettingRow label="深色主题">
                <Toggle checked={darkTheme} onChange={setDarkTheme} />
              </SettingRow>
            </section>

            <SectionDivider />

            {/* ── Section 4: 问答设置 ── */}
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

            <SectionDivider />

            {/* ── Section 5: 关于 ── */}
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
                    background: 'var(--white)',
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
                    background: 'var(--white)',
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
