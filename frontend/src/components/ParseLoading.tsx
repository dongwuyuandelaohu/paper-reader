interface ParseLoadingProps {
  engineName: string
  progress?: number       // 0 ~ 1
  totalPages?: number
  pagesDone?: number
}

export function ParseLoading({ engineName, progress, totalPages, pagesDone }: ParseLoadingProps) {
  const hasProgress = progress != null && progress > 0
  const percent = hasProgress ? Math.round(progress * 100) : 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: 'var(--surface)',
        padding: '40px',
      }}
    >
      {/* Progress circle / bar */}
      <div style={{
        width: '100%',
        maxWidth: '360px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '32px',
      }}>
        {hasProgress ? (
          <>
            {/* Percentage */}
            <div style={{
              fontSize: '32px',
              fontWeight: 700,
              color: 'var(--coral)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}>
              {percent}%
            </div>
            {/* Progress bar */}
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
            {/* Page counter */}
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
          /* Indeterminate skeleton (before progress arrives) */
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
      <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--fg)' }}>
        {hasProgress ? `${engineName} 解析中...` : `正在使用 ${engineName} 解析...`}
      </div>

      <style>{`
        @keyframes parse-loading-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
