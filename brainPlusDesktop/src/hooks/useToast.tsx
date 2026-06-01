import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface Toast {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'destructive'
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (t: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

// 全局快捷函数
let globalAddToast: ((t: Omit<Toast, 'id'>) => void) | null = null

export function toast(t: Omit<Toast, 'id'>) {
  if (!globalAddToast) {
    console.warn('[Toast] ToastProvider 未挂载，使用 alert 兜底:', t.title)
    alert(`${t.title}${t.description ? '\n' + t.description : ''}`)
    return
  }
  globalAddToast(t)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
    const newToast: Toast = { ...t, id }
    setToasts(prev => [...prev, newToast])

    const duration = t.duration ?? 3000
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration)
    }
  }, [removeToast])

  // 注册全局快捷函数
  globalAddToast = addToast

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内部使用')
  return {
    toast: (t: Omit<Toast, 'id'>) => ctx.addToast(t),
    dismiss: (id: string) => ctx.removeToast(id),
    toasts: ctx.toasts,
  }
}
