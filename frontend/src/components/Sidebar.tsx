import { useNavigate } from 'react-router-dom'
import { Library, Cpu, Settings, Plus } from 'lucide-react'
import { usePaperStore } from '../stores/usePaperStore'
import { useTagStore } from '../stores/useTagStore'
import { useState } from 'react'
import { TagCreateModal } from './TagCreateModal'

interface SidebarProps {
  currentPage: 'library' | 'models' | 'settings'
}

export function Sidebar({ currentPage }: SidebarProps) {
  const navigate = useNavigate()
  const papers = usePaperStore((state) => state.papers)
  const tags = useTagStore((state) => state.tags)
  const createTag = useTagStore((state) => state.createTag)
  const [showTagModal, setShowTagModal] = useState(false)

  const navItems = [
    { id: 'library' as const, label: '论文库', icon: Library, path: '/' },
    { id: 'models' as const, label: '模型管理', icon: Cpu, path: '/models' },
    { id: 'settings' as const, label: '系统设置', icon: Settings, path: '/settings' },
  ]

  const handleNavClick = (path: string) => {
    navigate(path)
  }

  const handleCreateTag = async (name: string, color: string) => {
    try {
      await createTag({ name, color })
    } catch (error) {
      console.error('Failed to create tag:', error)
    }
  }

  return (
    <>
      <div style={{
        width: '240px',
        height: '100vh',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 0',
      }}>
        {/* Logo */}
        <div style={{
          padding: '0 20px',
          marginBottom: '32px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            background: 'var(--accent)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--white)',
            fontFamily: 'var(--font-serif)',
            fontSize: '18px',
            fontWeight: 600,
          }}>
            P
          </div>
          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--fg)',
          }}>
            PaperLens
          </div>
        </div>

        {/* Navigation */}
        <div style={{
          padding: '0 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.id
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  background: isActive ? 'var(--sand)' : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: isActive ? 'var(--fg)' : 'var(--muted)',
                  fontWeight: isActive ? 500 : 400,
                  fontSize: '14px',
                  transition: 'all 0.2s',
                  textAlign: 'left',
                  width: '100%',
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
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.id === 'library' && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '12px',
                    color: 'var(--stone)',
                  }}>
                    {papers.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Tags Section (only on library page) */}
        {currentPage === 'library' && (
          <div style={{
            marginTop: '32px',
            padding: '0 12px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
              padding: '0 8px',
            }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                标签
              </div>
              <button
                onClick={() => setShowTagModal(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--stone)',
                  borderRadius: '6px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--sand)'
                  e.currentTarget.style.color = 'var(--fg)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none'
                  e.currentTarget.style.color = 'var(--stone)'
                }}
              >
                <Plus size={16} strokeWidth={2} />
              </button>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              overflowY: 'auto',
              flex: 1,
            }}>
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '4px',
                    background: tag.color,
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: '13px',
                    color: 'var(--fg)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {tag.name}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    color: 'var(--stone)',
                  }}>
                    {tag.paper_count || 0}
                  </span>
                </div>
              ))}

              {tags.length === 0 && (
                <div style={{
                  padding: '20px',
                  textAlign: 'center',
                  fontSize: '13px',
                  color: 'var(--stone)',
                }}>
                  暂无标签
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <TagCreateModal
        open={showTagModal}
        onClose={() => setShowTagModal(false)}
        onCreate={handleCreateTag}
      />
    </>
  )
}
