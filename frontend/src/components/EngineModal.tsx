import { useState, useEffect, useRef } from 'react'
import { system } from '@/api/client'

interface EngineInfo {
  name: string
  available: boolean
  version: string | null
  description: string
  install_size_mb: number
  built_in: boolean
  error?: string | null
}

interface InstallStatus {
  status: 'not_started' | 'installing' | 'completed' | 'failed' | 'already_installing'
  progress: number
  logs: Array<{ time: string; message: string }>
  started_at: string | null
  completed_at: string | null
  error?: string
}

interface EngineModalProps {
  open: boolean
  onClose: () => void
  engines: EngineInfo[]
  selectedEngine: string
  onSelect: (engine: string) => void
  onStartParse: () => void
  parsing: boolean
  cachedEngines?: Record<string, number>
  totalPages?: number
  onRecheck?: () => Promise<void>
  onEnginesUpdate?: () => void
}

function getBadge(engine: EngineInfo): { label: string; color: string } {
  if (engine.built_in) return { label: '内置', color: 'var(--accent)' }
  if (engine.available) return { label: '可用', color: 'var(--success)' }
  return { label: '未安装', color: 'var(--stone)' }
}

function formatSize(mb: number): string {
  if (mb < 1) return `${Math.round(mb * 1024)} KB`
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

export function EngineModal({
  open,
  onClose,
  engines,
  selectedEngine,
  onSelect,
  onStartParse,
  parsing,
  cachedEngines = {},
  totalPages = 0,
  onRecheck,
  onEnginesUpdate,
}: EngineModalProps) {
  const [rechecking, setRechecking] = useState(false)
  const [installingEngines, setInstallingEngines] = useState<Record<string, InstallStatus>>({})
  const eventSourceRefs = useRef<Record<string, EventSource>>({})

  // Cleanup SSE connections on unmount
  useEffect(() => {
    return () => {
      Object.values(eventSourceRefs.current).forEach(es => es.close())
    }
  }, [])

  if (!open) return null

  const handleRecheck = async () => {
    if (!onRecheck) return
    setRechecking(true)
    try {
      await onRecheck()
    } finally {
      setRechecking(false)
    }
  }

  const handleInstall = async (engineName: string) => {
    try {
      // Start installation
      await system.installEngine(engineName)
      
      // Connect to SSE for progress updates
      const eventSource = new EventSource(`/api/v1/system/engines/${engineName}/install/status`)
      eventSourceRefs.current[engineName] = eventSource

      eventSource.onmessage = async (event) => {
        const status: InstallStatus = JSON.parse(event.data)
        
        setInstallingEngines(prev => ({
          ...prev,
          [engineName]: status
        }))

        // If installation completed or failed, close SSE and refresh engines
        if (status.status === 'completed' || status.status === 'failed') {
          eventSource.close()
          delete eventSourceRefs.current[engineName]
          
          // Refresh engine list
          if (onRecheck) {
            await onRecheck()
          }
          if (onEnginesUpdate) {
            await onEnginesUpdate()
          }
        }
      }

      eventSource.onerror = () => {
        eventSource.close()
        delete eventSourceRefs.current[engineName]
        setInstallingEngines(prev => {
          const updated = { ...prev }
          delete updated[engineName]
          return updated
        })
      }
    } catch (error) {
      console.error('Failed to start installation:', error)
    }
  }

  const cachedCount = cachedEngines[selectedEngine] || 0
  const hasCache = cachedCount >= totalPages && totalPages > 0
  const buttonText = parsing
    ? '解析中...'
    : hasCache
    ? '加载缓存'
    : '开始解析'

  // Check if any engine is unavailable
  const hasUnavailable = engines.some(e => !e.available && !e.built_in)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          maxWidth: '520px',
          width: '100%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--fg)',
              margin: 0,
            }}
          >
            选择解析引擎
          </h2>
          {hasUnavailable && onRecheck && (
            <button
              onClick={handleRecheck}
              disabled={rechecking}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                background: 'var(--surface2)',
                color: rechecking ? 'var(--muted)' : 'var(--accent)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: rechecking ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: rechecking ? 'spin 1s linear infinite' : 'none' }}>
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              {rechecking ? '检测中...' : '重新检测'}
            </button>
          )}
        </div>

        {/* Engine list */}
        <div
          style={{
            padding: '16px 24px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {engines.map((engine) => {
            const isSelected = selectedEngine === engine.name
            const badge = getBadge(engine)
            const engineCacheCount = cachedEngines[engine.name] || 0
            const engineHasCache = engineCacheCount >= totalPages && totalPages > 0
            const installStatus = installingEngines[engine.name]
            const isInstalling = installStatus?.status === 'installing' || installStatus?.status === 'already_installing'

            return (
              <div key={engine.name} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div
                  onClick={() => engine.available && onSelect(engine.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--surface2)' : 'transparent',
                    cursor: engine.available ? 'pointer' : 'default',
                    opacity: engine.available ? 1 : 0.6,
                    transition: 'all 0.2s',
                  }}
                >
                  {/* Radio button */}
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--stone)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: 'var(--accent)',
                        }}
                      />
                    )}
                  </div>

                  {/* Engine info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--fg)',
                        }}
                      >
                        {engine.name}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          color: badge.color,
                          background: 'var(--surface2)',
                          padding: '1px 8px',
                          borderRadius: '10px',
                          border: `1px solid ${badge.color}`,
                        }}
                      >
                        {badge.label}
                      </span>
                      {engine.version && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--stone)',
                          }}
                        >
                          v{engine.version}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--muted)',
                        lineHeight: 1.5,
                      }}
                    >
                      {engine.description}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        marginTop: '6px',
                        fontSize: '11px',
                        color: 'var(--stone)',
                      }}
                    >
                      <span>{formatSize(engine.install_size_mb)}</span>
                      {engineHasCache && (
                        <span style={{ color: 'var(--success)', fontWeight: 500 }}>
                          ✓ 已缓存 {engineCacheCount} 页
                        </span>
                      )}
                      {engineCacheCount > 0 && !engineHasCache && (
                        <span style={{ color: 'var(--warn)' }}>
                          部分缓存 ({engineCacheCount}/{totalPages} 页)
                        </span>
                      )}
                      {!engine.available && !engine.built_in && !isInstalling && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleInstall(engine.name)
                          }}
                          style={{
                            padding: '2px 8px',
                            fontSize: '11px',
                            background: 'var(--accent)',
                            color: 'var(--white)',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 500,
                          }}
                        >
                          安装
                        </button>
                      )}
                      {isInstalling && (
                        <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                          安装中... {installStatus.progress}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Installation progress */}
                {installStatus && installStatus.logs.length > 0 && (
                  <div
                    style={{
                      padding: '12px',
                      background: 'var(--surface2)',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {/* Progress bar */}
                    {installStatus.status === 'installing' && (
                      <div
                        style={{
                          height: '4px',
                          background: 'var(--border)',
                          borderRadius: '2px',
                          overflow: 'hidden',
                          marginBottom: '8px',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${installStatus.progress}%`,
                            background: 'var(--accent)',
                            transition: 'width 0.3s',
                          }}
                        />
                      </div>
                    )}

                    {/* Logs */}
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--muted)',
                        fontFamily: 'var(--font-mono)',
                        maxHeight: '120px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      {installStatus.logs.slice(-5).map((log, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                          <span style={{ color: 'var(--stone)', flexShrink: 0 }}>
                            {new Date(log.time).toLocaleTimeString('zh-CN', { hour12: false })}
                          </span>
                          <span>{log.message}</span>
                        </div>
                      ))}
                    </div>

                    {/* Status message */}
                    {installStatus.status === 'completed' && (
                      <div
                        style={{
                          marginTop: '8px',
                          padding: '6px 10px',
                          background: 'rgba(34, 197, 94, 0.1)',
                          border: '1px solid var(--success)',
                          borderRadius: '4px',
                          fontSize: '12px',
                          color: 'var(--success)',
                          fontWeight: 500,
                        }}
                      >
                        ✓ 安装成功
                      </div>
                    )}
                    {installStatus.status === 'failed' && (
                      <div
                        style={{
                          marginTop: '8px',
                          padding: '6px 10px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid var(--error)',
                          borderRadius: '4px',
                          fontSize: '12px',
                          color: 'var(--error)',
                          fontWeight: 500,
                        }}
                      >
                        ✗ 安装失败: {installStatus.error || '未知错误'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
          }}
        >
          <button
            onClick={onClose}
            disabled={parsing}
            style={{
              padding: '8px 16px',
              background: 'var(--surface2)',
              color: 'var(--fg)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: parsing ? 'not-allowed' : 'pointer',
              opacity: parsing ? 0.5 : 1,
              transition: 'all 0.2s',
            }}
          >
            取消
          </button>
          <button
            onClick={onStartParse}
            disabled={parsing || !selectedEngine}
            style={{
              padding: '8px 16px',
              background: parsing || !selectedEngine ? 'var(--border2)' : hasCache ? 'var(--success)' : 'var(--accent)',
              color: 'var(--white)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: parsing || !selectedEngine ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {buttonText}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
