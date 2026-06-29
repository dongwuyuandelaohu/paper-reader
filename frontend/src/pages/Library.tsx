import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Upload, Link2, LayoutGrid, List, Heart, Tag, Trash2,
  RefreshCw, Download, BookOpen, FileText,
} from 'lucide-react'
import { usePaperStore } from '@/stores/usePaperStore'
import { useTagStore } from '@/stores/useTagStore'
import { useToastStore } from '@/components/Toast'
import { Sidebar } from '@/components/Sidebar'
import { PaperCard } from '@/components/PaperCard'
import { UploadModal } from '@/components/UploadModal'
import { ContextMenu } from '@/components/ContextMenu'
import { TagCreateModal } from '@/components/TagCreateModal'
import { papers as papersApi, parse, notes as notesApi } from '@/api/client'
import type { Paper } from '@/api/types'

type SortTab = 'created_at' | 'last_read_at' | 'title'

/* ─────────── Skeleton Card (loading placeholder) ─────────── */
function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: '10px',
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      <div style={{
        height: '120px',
        background: 'var(--sand)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '20px',
        justifyContent: 'center',
      }}>
        <div style={{ height: '8px', background: 'var(--border2)', borderRadius: '4px', width: '80%', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ height: '8px', background: 'var(--border2)', borderRadius: '4px', width: '95%', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ height: '8px', background: 'var(--border2)', borderRadius: '4px', width: '70%', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ height: '8px', background: 'var(--border2)', borderRadius: '4px', width: '85%', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </div>
      <div style={{ padding: '14px' }}>
        <div style={{ height: '14px', background: 'var(--border2)', borderRadius: '4px', width: '90%', marginBottom: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ height: '12px', background: 'var(--border)', borderRadius: '4px', width: '60%', marginBottom: '10px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', width: '100%', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </div>
    </div>
  )
}

export default function Library() {
  const navigate = useNavigate()
  const showToast = useToastStore((s) => s.showToast)

  const {
    papers, total, loading, loadingMore, hasMore, filter, sort, order, tagId, viewMode, selectedIds,
    fetchPapers, fetchMore, setFilter, setSort, setOrder, setSearch, setViewMode,
    toggleSelect, clearSelection, toggleFavorite, deletePaper, uploadPaperFromUrl,
  } = usePaperStore()

  const { tags, fetchTags, createTag, assignToPaper } = useTagStore()

  const [searchInput, setSearchInput] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadInitialTab, setUploadInitialTab] = useState<'local' | 'url'>('local')
  const [showTagCreateModal, setShowTagCreateModal] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    open: boolean; x: number; y: number; paperId: string | null
  }>({ open: false, x: 0, y: 0, paperId: null })
  const [tagAssignTarget, setTagAssignTarget] = useState<string | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Fetch papers when filter/sort/order/tagId changes (also covers mount)
  useEffect(() => {
    fetchPapers()
  }, [fetchPapers, filter, sort, order, tagId])

  // Infinite scroll: observe sentinel to load more
  const handleLoadMore = useCallback(() => {
    fetchMore()
  }, [fetchMore])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadMore()
      },
      { rootMargin: '300px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [handleLoadMore, papers.length])

  // Fetch tags on mount
  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  // Search debounce — only triggers when searchInput changes AFTER mount
  const isFirstSearchRender = useRef(true)
  useEffect(() => {
    if (isFirstSearchRender.current) {
      isFirstSearchRender.current = false
      return // Skip first render — fetchPapers already called by the main effect
    }
    const timer = setTimeout(() => {
      setSearch(searchInput)
      fetchPapers()
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, setSearch, fetchPapers])

  // Keyboard shortcut ⌘K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Sort tab click
  const handleSortTab = (tab: SortTab) => {
    if (tab === 'created_at') { setSort('created_at'); setOrder('desc') }
    else if (tab === 'last_read_at') { setSort('last_read_at'); setOrder('desc') }
    else { setSort('title'); setOrder('asc') }
  }

  // Upload: call API directly to get paper ID for navigation
  const handleUpload = async (file: File) => {
    await papersApi.upload(file)
    await fetchPapers()
    showToast('论文上传成功')
  }

  const handleUploadUrl = async (url: string, title?: string) => {
    await uploadPaperFromUrl(url, title)
    showToast('论文下载成功')
  }

  // Open upload modal with specific tab
  const openUploadModal = (tab: 'local' | 'url' = 'local') => {
    setUploadInitialTab(tab)
    setShowUploadModal(true)
  }

  // Right-click context menu
  const handleContextMenu = (e: React.MouseEvent, paper: Paper) => {
    e.preventDefault()
    setContextMenu({ open: true, x: e.clientX, y: e.clientY, paperId: paper.id })
  }

  // Build context menu items for a paper
  const buildContextMenuItems = () => {
    const paper = papers.find((p) => p.id === contextMenu.paperId)
    if (!paper) return []
    return [
      {
        label: '打开阅读',
        icon: <BookOpen size={16} strokeWidth={1.8} />,
        onClick: () => navigate(`/reader/${paper.id}`),
      },
      {
        label: paper.is_favorite ? '取消收藏' : '收藏',
        icon: <Heart size={16} strokeWidth={1.8} fill={paper.is_favorite ? 'var(--accent)' : 'none'} />,
        onClick: () => toggleFavorite(paper.id),
      },
      {
        label: '添加标签',
        icon: <Tag size={16} strokeWidth={1.8} />,
        onClick: () => setTagAssignTarget(paper.id),
      },
      {
        label: '重新解析',
        icon: <RefreshCw size={16} strokeWidth={1.8} />,
        onClick: async () => {
          try {
            await parse.trigger(paper.id)
            showToast('已开始重新解析')
            fetchPapers()
          } catch {
            showToast('解析失败')
          }
        },
      },
      {
        label: '导出笔记',
        icon: <Download size={16} strokeWidth={1.8} />,
        onClick: async () => {
          try {
            const res = await notesApi.export(paper.id, 'markdown')
            const blob = new Blob([res.content || ''], { type: 'text/markdown' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${paper.title}-notes.md`
            a.click()
            URL.revokeObjectURL(url)
            showToast('笔记已导出')
          } catch {
            showToast('导出失败')
          }
        },
      },
      {
        label: '删除论文',
        icon: <Trash2 size={16} strokeWidth={1.8} />,
        danger: true,
        divider: true,
        onClick: async () => {
          try {
            await deletePaper(paper.id)
            showToast('论文已删除')
          } catch {
            showToast('删除失败')
          }
        },
      },
    ]
  }

  // Batch actions
  const handleBatchFavorite = async () => {
    const ids = Array.from(selectedIds)
    for (const id of ids) await toggleFavorite(id)
    clearSelection()
    showToast(`已收藏 ${ids.length} 篇论文`)
  }

  const handleBatchDelete = async () => {
    const count = selectedIds.size
    for (const id of Array.from(selectedIds)) await deletePaper(id)
    clearSelection()
    showToast(`已删除 ${count} 篇论文`)
  }

  // Tag create handler
  const handleCreateTag = async (name: string, color: string) => {
    try {
      await createTag({ name, color })
      showToast('标签创建成功')
    } catch {
      showToast('标签创建失败')
    }
  }

  // Status badge
  const getStatusBadge = (paper: Paper) => {
    switch (paper.parse_status) {
      case 'completed':
        return { label: '已解析', color: 'var(--success)', bg: 'var(--success-bg)' }
      case 'processing':
        return { label: '解析中', color: 'var(--focus)', bg: 'rgba(56,152,236,0.1)' }
      case 'pending':
        return { label: '待解析', color: 'var(--warn)', bg: 'var(--warn-bg)' }
      case 'failed':
        return { label: '失败', color: 'var(--error)', bg: 'var(--error-bg)' }
      default:
        return { label: '未知', color: 'var(--stone)', bg: 'var(--sand)' }
    }
  }

  const selectedCount = selectedIds.size
  const hasActiveFilter = searchInput || filter !== 'all' || tagId

  const sortTabs: { key: SortTab; label: string }[] = [
    { key: 'created_at', label: '最近添加' },
    { key: 'last_read_at', label: '最近阅读' },
    { key: 'title', label: '按标题' },
  ]

  const filterButtons: { key: typeof filter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'favorite', label: '收藏' },
    { key: 'untranslated', label: '未翻译' },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar currentPage="library" />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ===== Top bar ===== */}
        <div style={{
          padding: '20px 28px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          {/* Search box */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            transition: 'border-color 0.2s',
          }}>
            <Search size={16} strokeWidth={2} color="var(--stone)" />
            <input
              ref={searchRef}
              type="text"
              placeholder="搜索论文标题、作者、关键词..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '14px',
                color: 'var(--fg)',
                fontFamily: 'var(--font-sans)',
              }}
              onFocus={(e) => { e.currentTarget.parentElement!.style.borderColor = 'var(--accent)' }}
              onBlur={(e) => { e.currentTarget.parentElement!.style.borderColor = 'var(--border)' }}
            />
            <span style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--stone)',
              background: 'var(--bg)',
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              lineHeight: '18px',
              userSelect: 'none',
            }}>
              ⌘K
            </span>
          </div>

          {/* URL import (ghost button) */}
          <button
            onClick={() => openUploadModal('url')}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--fg2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface)'
              e.currentTarget.style.borderColor = 'var(--border2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            <Link2 size={16} strokeWidth={1.8} />
            URL 导入
          </button>

          {/* Upload button (accent) */}
          <button
            onClick={() => setShowUploadModal(true)}
            style={{
              padding: '10px 16px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--white)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.2s',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--coral)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
          >
            <Upload size={16} strokeWidth={1.8} />
            上传论文
          </button>
        </div>

        {/* ===== Filter bar ===== */}
        <div style={{
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {/* Sort tabs */}
            {sortTabs.map((tab) => {
              const isActive = sort === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => handleSortTab(tab.key)}
                  style={{
                    padding: '6px 14px',
                    background: isActive ? 'var(--surface)' : 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? 'var(--fg)' : 'var(--muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                    fontFamily: 'var(--font-sans)',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--fg)' }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--muted)' }}
                >
                  {tab.label}
                </button>
              )
            })}

            <div style={{ width: '1px', height: '16px', background: 'var(--border)', margin: '0 8px' }} />

            {/* Filter buttons */}
            {filterButtons.map((f) => {
              const isActive = filter === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    padding: '6px 14px',
                    background: isActive ? 'var(--accent)' : 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? 'var(--white)' : 'var(--muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontFamily: 'var(--font-sans)',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--fg)' }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--muted)' }}
                >
                  {f.label}
                </button>
              )
            })}

            {/* Result count */}
            <span style={{ fontSize: '12px', color: 'var(--stone)', marginLeft: '12px' }}>
              {loading ? '...' : `${total} 篇`}
            </span>
          </div>

          {/* View toggle */}
          <div style={{
            display: 'flex',
            background: 'var(--surface)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                padding: '6px 10px',
                background: viewMode === 'grid' ? 'var(--sand)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: viewMode === 'grid' ? 'var(--fg)' : 'var(--stone)',
                transition: 'all 0.2s',
              }}
            >
              <LayoutGrid size={16} strokeWidth={1.8} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                padding: '6px 10px',
                background: viewMode === 'list' ? 'var(--sand)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: viewMode === 'list' ? 'var(--fg)' : 'var(--stone)',
                transition: 'all 0.2s',
              }}
            >
              <List size={16} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* ===== Batch action bar ===== */}
        {selectedCount > 0 && (
          <div style={{
            margin: '0 28px 12px',
            padding: '10px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <span style={{ fontSize: '13px', color: 'var(--fg)', fontWeight: 500 }}>
              已选择 {selectedCount} 篇
            </span>
            <button
              onClick={clearSelection}
              style={{
                padding: '4px 12px',
                background: 'var(--sand)',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--muted)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'var(--font-sans)',
              }}
            >
              取消选择
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={handleBatchFavorite}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '13px',
                color: 'var(--fg2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <Heart size={14} strokeWidth={1.8} />
              收藏
            </button>
            <button
              onClick={handleBatchDelete}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid var(--error-bg)',
                borderRadius: '8px',
                fontSize: '13px',
                color: 'var(--error)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <Trash2 size={14} strokeWidth={1.8} />
              删除
            </button>
          </div>
        )}

        {/* ===== Paper area ===== */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 28px 28px' }}>
          {loading ? (
            /* ===== Skeleton loading ===== */
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '16px',
            }}>
              {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : papers.length === 0 ? (
            /* ===== Empty state ===== */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              textAlign: 'center',
              padding: '40px 20px',
            }}>
              <div style={{
                width: '80px',
                height: '80px',
                background: 'var(--surface)',
                borderRadius: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
                border: '1px solid var(--border)',
              }}>
                <FileText size={36} strokeWidth={1.5} color="var(--stone)" />
              </div>
              <h3 style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--fg)',
                marginBottom: '8px',
                margin: '0 0 8px',
              }}>
                {hasActiveFilter ? '没有找到匹配的论文' : '还没有论文'}
              </h3>
              <p style={{
                fontSize: '14px',
                color: 'var(--muted)',
                marginBottom: '24px',
                maxWidth: '360px',
                lineHeight: 1.6,
              }}>
                {hasActiveFilter
                  ? '尝试调整搜索关键词或筛选条件。'
                  : '上传你的第一篇 PDF 论文，或通过 URL 导入开始阅读。'}
              </p>
              {!hasActiveFilter && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    style={{
                      padding: '10px 20px',
                      background: 'var(--accent)',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'var(--white)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'background 0.2s',
                      fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--coral)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
                  >
                    <Upload size={16} strokeWidth={1.8} />
                    上传论文
                  </button>
                  <button
                    onClick={() => openUploadModal('url')}
                    style={{
                      padding: '10px 20px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'var(--fg2)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s',
                      fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--surface)'
                      e.currentTarget.style.borderColor = 'var(--border2)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.borderColor = 'var(--border)'
                    }}
                  >
                    <Link2 size={16} strokeWidth={1.8} />
                    URL 导入
                  </button>
                </div>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            /* ===== Grid view ===== */
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '16px',
            }}>
              {papers.map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  onClick={() => navigate(`/reader/${paper.id}`)}
                  onContextMenu={(e) => handleContextMenu(e, paper)}
                  selected={selectedIds.has(paper.id)}
                  onToggleSelect={() => toggleSelect(paper.id)}
                  onToggleFavorite={() => toggleFavorite(paper.id)}
                />
              ))}
              {loadingMore && Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={`more-${i}`} />)}
            </div>
          ) : (
            /* ===== List view ===== */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {papers.map((paper) => {
                const badge = getStatusBadge(paper)
                const isSelected = selectedIds.has(paper.id)
                return (
                  <div
                    key={paper.id}
                    onClick={() => navigate(`/reader/${paper.id}`)}
                    onContextMenu={(e) => handleContextMenu(e, paper)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      background: isSelected ? 'rgba(201,100,66,0.04)' : 'var(--white)',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'var(--surface)'
                        e.currentTarget.style.borderColor = 'var(--border2)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'var(--white)'
                        e.currentTarget.style.borderColor = 'var(--border)'
                      }
                    }}
                  >
                    {/* Checkbox */}
                    <div
                      onClick={(e) => { e.stopPropagation(); toggleSelect(paper.id) }}
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '6px',
                        background: isSelected ? 'var(--accent)' : 'var(--white)',
                        border: isSelected ? '2px solid var(--accent)' : '2px solid var(--border2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>

                    {/* Title + meta */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: 'var(--font-serif)',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--fg)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {paper.title}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: 'var(--muted)',
                          marginTop: '2px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {paper.authors?.[0]
                            ? `${paper.authors[0]}${paper.authors.length > 1 ? ' et al.' : ''}`
                            : '未知作者'}
                          {paper.year ? ` · ${paper.year}` : ''}
                          {paper.venue ? ` · ${paper.venue}` : ''}
                        </div>
                      </div>
                    </div>

                    {/* Tags */}
                    {paper.tags && paper.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        {paper.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag.id}
                            style={{
                              padding: '2px 8px',
                              background: tag.color,
                              color: 'var(--white)',
                              borderRadius: '5px',
                              fontSize: '11px',
                              fontWeight: 500,
                              lineHeight: '18px',
                            }}
                          >
                            {tag.name}
                          </span>
                        ))}
                        {paper.tags.length > 2 && (
                          <span style={{
                            padding: '2px 8px',
                            background: 'var(--sand)',
                            color: 'var(--muted)',
                            borderRadius: '5px',
                            fontSize: '11px',
                            lineHeight: '18px',
                          }}>
                            +{paper.tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Status badge */}
                    <span style={{
                      padding: '4px 8px',
                      background: badge.bg,
                      color: badge.color,
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 500,
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}>
                      {badge.label}
                    </span>

                    {/* Pages info */}
                    <span style={{
                      fontSize: '12px',
                      color: 'var(--stone)',
                      flexShrink: 0,
                      minWidth: '56px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {paper.pages_parsed}/{paper.total_pages} 页
                    </span>
                    {paper.pages_translated > 0 && (
                      <span style={{
                        fontSize: '11px',
                        color: 'var(--coral)',
                        flexShrink: 0,
                        minWidth: '48px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        译 {paper.pages_translated}/{paper.total_pages}
                      </span>
                    )}

                    {/* Favorite button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(paper.id) }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0,
                        color: paper.is_favorite ? 'var(--accent)' : 'var(--stone)',
                        transition: 'all 0.2s',
                        borderRadius: '6px',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sand)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                    >
                      <Heart
                        size={16}
                        strokeWidth={2}
                        fill={paper.is_favorite ? 'var(--accent)' : 'none'}
                      />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          {!loading && papers.length > 0 && hasMore && (
            <div ref={sentinelRef} style={{ height: '1px', margin: '16px 0' }} />
          )}
          {!loading && !hasMore && papers.length > 0 && (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--stone)', fontSize: '12px' }}>
              已加载全部 {total} 篇论文
            </div>
          )}
        </div>
      </main>

      {/* ===== Modals ===== */}
      <UploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleUpload}
        onUploadUrl={handleUploadUrl}
        initialTab={uploadInitialTab}
      />

      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        open={contextMenu.open}
        onClose={() => setContextMenu((prev) => ({ ...prev, open: false }))}
        items={buildContextMenuItems()}
      />

      <TagCreateModal
        open={showTagCreateModal}
        onClose={() => setShowTagCreateModal(false)}
        onCreate={handleCreateTag}
      />

      {/* Tag Assign Modal (inline) */}
      {tagAssignTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20,20,19,0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setTagAssignTarget(null)}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '16px',
              width: '360px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h3 style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--fg)',
                margin: 0,
              }}>
                添加标签
              </h3>
              <button
                onClick={() => setTagAssignTarget(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: 'var(--stone)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sand)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div style={{
              padding: '16px 24px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}>
              {tags.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '24px 20px',
                  color: 'var(--stone)',
                  fontSize: '14px',
                }}>
                  暂无标签，请先创建标签
                </div>
              ) : (
                tags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={async () => {
                      try {
                        await assignToPaper(tag.id, tagAssignTarget)
                        showToast(`已添加标签「${tag.name}」`)
                        setTagAssignTarget(null)
                        fetchPapers()
                      } catch {
                        showToast('添加标签失败')
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      background: 'none',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: 'var(--fg)',
                      transition: 'all 0.2s',
                      textAlign: 'left',
                      fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sand)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                  >
                    <div style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '5px',
                      background: tag.color,
                      flexShrink: 0,
                    }} />
                    <span style={{ flex: 1 }}>{tag.name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--stone)' }}>
                      {tag.paper_count || 0}
                    </span>
                  </button>
                ))
              )}
              {/* Create new tag button */}
              <button
                onClick={() => {
                  setTagAssignTarget(null)
                  setShowTagCreateModal(true)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  background: 'none',
                  border: '1px dashed var(--border2)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: 'var(--muted)',
                  transition: 'all 0.2s',
                  marginTop: '4px',
                  fontFamily: 'var(--font-sans)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.color = 'var(--accent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border2)'
                  e.currentTarget.style.color = 'var(--muted)'
                }}
              >
                <Tag size={14} strokeWidth={1.8} />
                创建新标签
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
