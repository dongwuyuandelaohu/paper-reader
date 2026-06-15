import { useState, useRef } from 'react'
import { Upload, Link, X, FileText, Loader2 } from 'lucide-react'
import { Modal } from './Modal'

interface UploadModalProps {
  open: boolean
  onClose: () => void
  onUpload: (file: File) => Promise<void>
}

interface UploadItem {
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

export function UploadModal({ open, onClose, onUpload }: UploadModalProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'url'>('local')
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [url, setUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    const newUploads: UploadItem[] = Array.from(files)
      .filter(f => f.type === 'application/pdf')
      .map(file => ({ file, progress: 0, status: 'pending' as const }))
    setUploads(prev => [...prev, ...newUploads])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const removeUpload = (index: number) => {
    setUploads(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    if (uploads.length === 0) return

    setIsUploading(true)
    for (let i = 0; i < uploads.length; i++) {
      if (uploads[i].status === 'pending') {
        setUploads(prev => prev.map((u, idx) =>
          idx === i ? { ...u, status: 'uploading', progress: 0 } : u
        ))

        try {
          await onUpload(uploads[i].file)
          setUploads(prev => prev.map((u, idx) =>
            idx === i ? { ...u, status: 'success', progress: 100 } : u
          ))
        } catch (error) {
          setUploads(prev => prev.map((u, idx) =>
            idx === i ? { ...u, status: 'error', error: '上传失败' } : u
          ))
        }
      }
    }
    setIsUploading(false)

    // Close after successful uploads
    setTimeout(() => {
      setUploads([])
      onClose()
    }, 1000)
  }

  const handleClose = () => {
    if (!isUploading) {
      setUploads([])
      setUrl('')
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="导入论文"
      footer={
        <>
          <button
            onClick={handleClose}
            disabled={isUploading}
            style={{
              padding: '8px 16px',
              background: 'var(--sand)',
              color: 'var(--fg)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: isUploading ? 'not-allowed' : 'pointer',
              opacity: isUploading ? 0.5 : 1,
              transition: 'all 0.2s',
            }}
          >
            取消
          </button>
          <button
            onClick={handleUpload}
            disabled={uploads.length === 0 || isUploading}
            style={{
              padding: '8px 16px',
              background: uploads.length > 0 && !isUploading ? 'var(--accent)' : 'var(--border2)',
              color: 'var(--white)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: uploads.length > 0 && !isUploading ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
            }}
          >
            {isUploading ? '导入中...' : '开始导入'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '12px',
        }}>
          <button
            onClick={() => setActiveTab('local')}
            style={{
              padding: '8px 16px',
              background: activeTab === 'local' ? 'var(--sand)' : 'transparent',
              color: activeTab === 'local' ? 'var(--fg)' : 'var(--muted)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            <Upload size={16} strokeWidth={1.8} />
            本地上传
          </button>
          <button
            onClick={() => setActiveTab('url')}
            style={{
              padding: '8px 16px',
              background: activeTab === 'url' ? 'var(--sand)' : 'transparent',
              color: activeTab === 'url' ? 'var(--fg)' : 'var(--muted)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            <Link size={16} strokeWidth={1.8} />
            URL 下载
          </button>
        </div>

        {/* Local Upload Tab */}
        {activeTab === 'local' && (
          <>
            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border2)',
                borderRadius: '12px',
                padding: '40px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: 'var(--surface)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.background = 'var(--bg)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border2)'
                e.currentTarget.style.background = 'var(--surface)'
              }}
            >
              <Upload
                size={40}
                strokeWidth={1.8}
                color="var(--stone)"
                style={{ marginBottom: '12px' }}
              />
              <div style={{
                fontSize: '14px',
                color: 'var(--fg)',
                fontWeight: 500,
                marginBottom: '4px',
              }}>
                点击选择或拖拽 PDF 文件到此处
              </div>
              <div style={{
                fontSize: '12px',
                color: 'var(--muted)',
              }}>
                支持批量上传
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              style={{ display: 'none' }}
            />

            {/* Upload Queue */}
            {uploads.length > 0 && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '200px',
                overflowY: 'auto',
              }}>
                {uploads.map((item, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      background: 'var(--surface)',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <FileText size={20} strokeWidth={1.8} color="var(--accent)" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--fg)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {item.file.name}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: 'var(--muted)',
                        marginTop: '2px',
                      }}>
                        {formatFileSize(item.file.size)}
                      </div>
                      {item.status === 'uploading' && (
                        <div style={{
                          height: '3px',
                          background: 'var(--border)',
                          borderRadius: '2px',
                          marginTop: '6px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: '60%',
                            background: 'var(--accent)',
                            borderRadius: '2px',
                            animation: 'indeterminate 1.5s infinite',
                          }} />
                        </div>
                      )}
                    </div>
                    {item.status === 'pending' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeUpload(index)
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          color: 'var(--stone)',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <X size={16} strokeWidth={2} />
                      </button>
                    )}
                    {item.status === 'uploading' && (
                      <Loader2 size={16} strokeWidth={2} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
                    )}
                    {item.status === 'success' && (
                      <div style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 500 }}>
                        完成
                      </div>
                    )}
                    {item.status === 'error' && (
                      <div style={{ fontSize: '12px', color: 'var(--error)', fontWeight: 500 }}>
                        失败
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* URL Download Tab */}
        {activeTab === 'url' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="输入论文 PDF 下载链接"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--border2)',
                borderRadius: '8px',
                fontSize: '14px',
                color: 'var(--fg)',
                background: 'var(--surface)',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border2)'}
            />
            <div style={{
              fontSize: '12px',
              color: 'var(--muted)',
              padding: '12px',
              background: 'var(--surface)',
              borderRadius: '8px',
              border: '1px solid var(--border)',
            }}>
              提示：请确保链接可以直接下载 PDF 文件
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Modal>
  )
}
