import { useNavigate } from 'react-router-dom'
import { Library, Settings, Plus, X } from 'lucide-react'
import { usePaperStore } from '../stores/usePaperStore'
import { useTagStore } from '../stores/useTagStore'
import { useState } from 'react'
import { TagCreateModal } from './TagCreateModal'

interface SidebarProps {
  currentPage: 'library' | 'models' | 'settings'
  activeTagId?: string | null
  onTagClick?: (tagId: string) => void
}

export function Sidebar({ currentPage, activeTagId, onTagClick }: SidebarProps) {
  const navigate = useNavigate()
  const papers = usePaperStore((state) => state.papers)
  const tags = useTagStore((state) => state.tags)
  const createTag = useTagStore((state) => state.createTag)
  const [showTagModal, setShowTagModal] = useState(false)

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

  const isSettingsActive = currentPage === 'settings' || currentPage === 'models'

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
          <button
            onClick={() => handleNavClick('/')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              background: currentPage === 'library' ? 'var(--sand)' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              color: currentPage === 'library' ? 'var(--fg)' : 'var(--muted)',
              fontWeight: currentPage === 'library' ? 500 : 400,
              fontSize: '14px',
              transition: 'all 0.2s',
              textAlign: 'left',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              if (currentPage !== 'library') {
                e.currentTarget.style.background = 'var(--bg)'
                e.currentTarget.style.color = 'var(--fg)'
              }
            }}
            onMouseLeave={(e) => {
              if (currentPage !== 'library') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--muted)'
              }
            }}
          >
            <Library size={18} strokeWidth={1.8} />
            <span>论文库</span>
            <span style={{
              marginLeft: 'auto',
              fontSize: '12px',
              color: 'var(--stone)',
            }}>
              {papers.length}
            </span>
          </button>

          {/* Active tag filter indicator */}
          {activeTagId && (
            <div style={{
              margin: '4px 8px 0',
              padding: '6px 10px',
              background: 'var(--bg)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--muted)',
            }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tags.find(t => t.id === activeTagId)?.name || '标签筛选'}
              </span>
              <button
                onClick={() => onTagClick?.(activeTagId)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '2px', color: 'var(--stone)', display: 'flex',
                }}
              >
                <X size={12} />
              </button>
            </div>
          )}
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
              {tags.map((tag) => {
                const isActive = activeTagId === tag.id
                return (
                  <div
                    key={tag.id}
                    onClick={() => onTagClick?.(tag.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      cursor: onTagClick ? 'pointer' : 'default',
                      transition: 'background 0.2s',
                      background: isActive ? 'var(--sand)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--bg)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent'
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
                      color: isActive ? 'var(--fg)' : 'var(--muted)',
                      fontWeight: isActive ? 500 : 400,
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
                )
              })}

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

        {/* Spacer to push settings to bottom */}
        {currentPage !== 'library' && <div style={{ flex: 1 }} />}

        {/* Settings button at bottom */}
        <div style={{
          padding: '0 12px',
          borderTop: '1px solid var(--border)',
          paddingTop: '12px',
          marginTop: 'auto',
        }}>
          <button
            onClick={() => handleNavClick('/settings')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              background: isSettingsActive ? 'var(--sand)' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              color: isSettingsActive ? 'var(--fg)' : 'var(--muted)',
              fontWeight: isSettingsActive ? 500 : 400,
              fontSize: '14px',
              transition: 'all 0.2s',
              textAlign: 'left',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              if (!isSettingsActive) {
                e.currentTarget.style.background = 'var(--bg)'
                e.currentTarget.style.color = 'var(--fg)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isSettingsActive) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--muted)'
              }
            }}
          >
            <Settings size={18} strokeWidth={1.8} />
            <span>设置</span>
          </button>
        </div>
      </div>

      <TagCreateModal
        open={showTagModal}
        onClose={() => setShowTagModal(false)}
        onCreate={handleCreateTag}
      />
    </>
  )
}
