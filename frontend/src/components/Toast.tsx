import { create } from 'zustand'
import { useEffect } from 'react'

interface Toast {
  id: string
  message: string
}

interface ToastStore {
  toasts: Toast[]
  showToast: (message: string) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  showToast: (message: string) => {
    const id = Math.random().toString(36).substring(2, 9)
    set((state) => ({ toasts: [...state.toasts, { id, message }] }))
  },
  removeToast: (id: string) => {
    set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }))
  },
}))

export function Toast() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      zIndex: 9999,
    }}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(toast.id)
    }, 3000)
    return () => clearTimeout(timer)
  }, [toast.id, onRemove])

  return (
    <div style={{
      background: 'var(--deep)',
      color: 'var(--white)',
      padding: '12px 20px',
      borderRadius: '10px',
      fontSize: '14px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      animation: 'slideInFromBottom 0.3s ease-out',
      maxWidth: '400px',
    }}>
      {toast.message}
      <style>{`
        @keyframes slideInFromBottom {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
