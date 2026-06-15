import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { Components } from 'react-markdown'

interface MarkdownRendererProps {
  content: string
  paperId: string
  className?: string
}

function processContent(content: string, paperId: string): string {
  // Rewrite markdown image URLs: ![alt](filename) → ![alt](/api/v1/parse/{paperId}/images/{filename})
  // Skip URLs that already start with http(s) or /api/ (e.g., MinerU full API paths)
  return content.replace(
    /!\[([^\]]*)\]\((?!https?:\/\/|\/api\/)([^)]+)\)/g,
    (_match, alt, src) => `![${alt}](/api/v1/parse/${paperId}/images/${src})`
  )
}

function renderMathBlock(content: string): string {
  // Process display math: $$...$$ → <div class="math-block">...</div>
  let result = content.replace(
    /\$\$([^$]+)\$\$/g,
    '<div class="math-block math">$$1$</div>'
  )
  // Process inline math: $...$ → <span class="math-inline math">...</span>
  result = result.replace(
    /\$([^$\n]+)\$/g,
    '<span class="math-inline math">$$1$</span>'
  )
  return result
}

const components: Components = {
  img: ({ src, alt, ...props }) => (
    <img
      src={src}
      alt={alt || ''}
      style={{
        maxWidth: '100%',
        borderRadius: '6px',
        margin: '8px 0',
        display: 'block',
      }}
      {...(props as React.ImgHTMLAttributes<HTMLImageElement>)}
    />
  ),
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '12px 0' }}>
      <table
        style={{
          borderCollapse: 'collapse',
          width: '100%',
          fontSize: '13px',
        }}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ background: 'var(--surface2)' }}>{children}</thead>
  ),
  th: ({ children }) => (
    <th
      style={{
        border: '1px solid var(--border)',
        padding: '8px',
        textAlign: 'left',
        fontWeight: 600,
        color: 'var(--fg)',
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      style={{
        border: '1px solid var(--border)',
        padding: '8px',
        color: 'var(--fg)',
      }}
    >
      {children}
    </td>
  ),
  pre: ({ children }) => (
    <pre
      style={{
        background: 'var(--surface2)',
        borderRadius: '6px',
        padding: '12px 16px',
        overflowX: 'auto',
        margin: '12px 0',
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        lineHeight: 1.6,
      }}
    >
      {children}
    </pre>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.startsWith('language-')
    if (isBlock) {
      return <code className={className}>{children}</code>
    }
    return (
      <code
        style={{
          background: 'var(--surface2)',
          padding: '2px 6px',
          borderRadius: '4px',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
        }}
      >
        {children}
      </code>
    )
  },
  h1: ({ children }) => (
    <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', fontWeight: 700, margin: '24px 0 12px', color: 'var(--fg)' }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 700, margin: '20px 0 10px', color: 'var(--fg)' }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '17px', fontWeight: 600, margin: '16px 0 8px', color: 'var(--fg)' }}>
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '15px', fontWeight: 600, margin: '14px 0 6px', color: 'var(--fg)' }}>
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 style={{ fontFamily: 'var(--font-serif)', fontSize: '14px', fontWeight: 600, margin: '12px 0 4px', color: 'var(--fg)' }}>
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 style={{ fontFamily: 'var(--font-serif)', fontSize: '13px', fontWeight: 600, margin: '10px 0 4px', color: 'var(--fg2)' }}>
      {children}
    </h6>
  ),
  a: ({ children, href }) => (
    <a href={href} style={{ color: 'var(--accent)', textDecoration: 'none' }} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote
      style={{
        borderLeft: '3px solid var(--accent)',
        paddingLeft: '16px',
        margin: '12px 0',
        color: 'var(--fg2)',
      }}
    >
      {children}
    </blockquote>
  ),
}

export function MarkdownRenderer({ content, paperId, className }: MarkdownRendererProps) {
  const processed = renderMathBlock(processContent(content, paperId))

  return (
    <div
      className={className}
      style={{
        fontSize: '13px',
        lineHeight: 1.8,
        color: 'var(--fg)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {processed}
      </ReactMarkdown>

      <style>{`
        .math {
          font-family: var(--font-serif);
          font-style: italic;
        }
        .math-block {
          text-align: center;
          background: var(--surface2);
          padding: 16px;
          margin: 12px 0;
          border-radius: 6px;
          font-size: 14px;
          overflow-x: auto;
        }
        .math-inline {
          padding: 0 2px;
        }
      `}</style>
    </div>
  )
}
