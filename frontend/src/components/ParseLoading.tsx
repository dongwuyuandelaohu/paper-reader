import { useState, useEffect, useRef } from 'react'

interface ParseLoadingProps {
  engineName: string
  progress?: number       // 0 ~ 1
  totalPages?: number
  pagesDone?: number
  logs?: string[]
}

export function ParseLoading({ engineName, progress, totalPages, pagesDone, logs }: ParseLoadingProps) {
  const hasProgress = progress != null && progress > 0
  const percent = hasProgress ? Math.round(progress * 100) : 0
  const [showLogs, setShowLogs] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  // 有日志时自动展开
  useEffect(() => {
    if (logs && logs.length > 0 && !showLogs) {
      setShowLogs(true)
    }
  }, [logs])

  // 自动滚动到底部
  useEffect(() => {
    if (showLogs && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, showLogs])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        height: '100%',
        background: 'var(--surface)',
        padding: '40px',
        overflow: 'hidden',
      }}
    >
      {/* Progress circle / bar */}
      <div style={{
        width: '100%',
        maxWidth: '400px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px',
        flexShrink: 0,
      }}>
        {hasProgress ? (
          <>
            <div style={{
              fontSize: '32px',
              fontWeight: 700,
              color: 'var(--coral)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}>
              {percent}%
            </div>
            <div style={{
              width: '100%',
              height: '6px',
              background: 'var(--surface3, #30302e)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${percent}%`,
                background: 'linear-gradient(90deg, var(--accent), var(--coral))',
                borderRadius: '3px',
                transition: 'width 0.4s ease',
              }} />
            </div>
            {totalPages != null && (
              <div style={{
                fontSize: '12px',
                color: 'var(--muted)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {pagesDone != null ? `${pagesDone} / ${totalPages} 页` : `共 ${totalPages} 页`}
              </div>
            )}
          </>
        ) : (
          <div style={{ width: '100%' }}>
            {[100, 85, 92, 70, 88, 60, 95].map((width, i) => (
              <div
                key={i}
                style={{
                  height: '10px',
                  width: `${width}%`,
                  background: 'var(--border)',
                  borderRadius: '4px',
                  marginBottom: '10px',
                  animation: 'parse-loading-pulse 2s infinite',
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Engine name */}
      <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--fg)', flexShrink: 0, marginBottom: 12 }}>
        {hasProgress ? `${engineName} 解析中...` : `正在使用 ${engineName} 解析...`}
      </div>

      {/* 日志面板 */}
      {logs && logs.length > 0 && (
        <div style={{
          width: '100%',
          maxWidth: '600px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          {/* 日志标题栏 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: 'var(--surface3, #30302e)',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            flexShrink: 0,
          }}
            onClick={() => setShowLogs(!showLogs)}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
              解析日志 ({logs.length})
            </span>
            <span style={{ fontSize: 11, color: 'var(--stone)' }}>
              {showLogs ? '收起' : '展开'}
            </span>
          </div>
          {/* 日志内容 */}
          {showLogs && (
            <div style={{
              flex: 1,
              overflowY: 'auto',
              background: 'var(--bg)',
              borderRadius: '0 0 6px 6px',
              padding: '8px 12px',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--muted)',
              minHeight: 100,
              maxHeight: '100%',
            }}>
              {logs.map((line, i) => (
                <div key={i} style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  marginBottom: 1,
                  color: line.toLowerCase().includes('error') || line.toLowerCase().includes('fail')
                    ? 'var(--coral)'
                    : line.toLowerCase().includes('warn')
                    ? 'var(--warn)'
                    : 'var(--muted)',
                }}>
                  {line}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes parse-loading-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
