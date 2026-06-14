import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface ConfirmAction {
  key: string
  label: string
  variant?: 'default' | 'destructive'
}

export interface NotificationItem {
  id: string
  type: 'info' | 'warning' | 'error' | 'confirm'
  title: string
  message: string
  source?: string
  timestamp: number
  read: boolean
  // confirm 专用
  actions?: ConfirmAction[]
  resolve?: (key: string) => void
  resolved?: boolean
}

interface NotificationContextType {
  notifications: NotificationItem[]
  unreadCount: number
  notify: (item: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => string
  confirm: (opts: {
    title: string; message: string; source?: string
    actions: ConfirmAction[]
  }) => Promise<string>
  dismiss: (id: string) => void
  resolveConfirm: (id: string, key: string) => void
  markAllRead: () => void
}

const NotificationContext = createContext<NotificationContextType | null>(null)

// 全局引用，供非 React 代码（如 pluginSystem）调用
let _global: NotificationContextType | null = null
export function getNotificationAPI(): NotificationContextType | null { return _global }

let _idSeq = 0
function genId() { return 'notif_' + (++_idSeq) + '_' + Date.now().toString(36) }

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  const notify = useCallback((item: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => {
    const id = genId()
    const n: NotificationItem = { ...item, id, timestamp: Date.now(), read: false }
    setNotifications(prev => [n, ...prev].slice(0, 100))
    return id
  }, [])

  const confirm = useCallback((opts: {
    title: string; message: string; source?: string
    actions: ConfirmAction[]
  }): Promise<string> => {
    return new Promise((resolve) => {
      const id = genId()
      setNotifications(prev => [{
        id, type: "confirm" as const, title: opts.title, message: opts.message,
        source: opts.source, actions: opts.actions, resolve,
        timestamp: Date.now(), read: false,
      }, ...prev].slice(0, 100))
    })
  }, [])

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const resolveConfirm = useCallback((id: string, key: string) => {
    setNotifications(prev => prev.map(n =>
      n.id === id ? { ...n, resolved: true, read: true, resolve: undefined } : n
    ))
    // 找到对应的 notification 并调用 resolve
    const found = notifications.find(n => n.id === id)
    found?.resolve?.(key)
  }, [notifications])

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  const value = {
    notifications, unreadCount, notify, confirm, dismiss, resolveConfirm, markAllRead,
  }

  _global = value

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
