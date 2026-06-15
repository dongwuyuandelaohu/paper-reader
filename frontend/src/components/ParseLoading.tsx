interface ParseLoadingProps {
  engineName: string
}

export function ParseLoading({ engineName }: ParseLoadingProps) {
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
      {/* Animated skeleton lines */}
      <div style={{ width: '100%', maxWidth: '400px', marginBottom: '32px' }}>
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

      {/* Engine name */}
      <div
        style={{
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--fg)',
        }}
      >
        正在使用 {engineName} 解析...
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
