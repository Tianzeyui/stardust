import { Bell, X, Info, AlertTriangle, AlertCircle, ArrowLeft } from 'lucide-react'
import { useNotifications } from '@/contexts/NotificationContext'

const iconMap = { info: Info, warning: AlertTriangle, error: AlertCircle, confirm: AlertTriangle }
const colorMap = { info: 'text-blue-500', warning: 'text-yellow-500', error: 'text-destructive', confirm: 'text-yellow-500' }
const bgMap = { info: 'bg-blue-500/5', warning: 'bg-yellow-500/5', error: 'bg-destructive/5', confirm: 'bg-yellow-500/5' }

export function NotificationsPage({ onClose }: { onClose?: () => void }) {
  const { notifications, dismiss, resolveConfirm, markAllRead } = useNotifications()

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center gap-2 border-b border-border px-4">
        {onClose && (
          <button className="p-1 -ml-1 text-muted-foreground hover:text-foreground transition-colors" onClick={onClose} title="返回">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <Bell className="h-4 w-4 text-muted-foreground shrink-0" />
        <h2 className="text-sm font-semibold">通知</h2>
        <div className="flex-1" />
        {notifications.length > 0 && (
          <button className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            onClick={markAllRead}>
            全部已读
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Bell className="h-8 w-8 opacity-20" />
            <p className="text-xs">暂无通知</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {notifications.map(n => {
              const IconComp = iconMap[n.type]
              const colorCls = colorMap[n.type]
              return (
                <div key={n.id} className={`px-4 py-3 ${n.read ? '' : bgMap[n.type]}`}>
                  <div className="flex items-start gap-3">
                    <IconComp className={`h-4 w-4 shrink-0 mt-0.5 ${colorCls}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{n.title}</p>
                        {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{n.message}</p>
                      {n.source && (
                        <p className="text-[10px] text-muted-foreground/40 mt-1">{n.source}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/30 mt-1">
                        {new Date(n.timestamp).toLocaleString('zh-CN')}
                      </p>
                      {/* 确认按钮 */}
                      {n.type === 'confirm' && n.actions && !n.resolved && (
                        <div className="flex gap-2 mt-3">
                          {n.actions.map(a => (
                            <button key={a.key}
                              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                a.variant === 'destructive'
                                  ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                                  : 'bg-primary/10 text-primary hover:bg-primary/20'
                              }`}
                              onClick={() => resolveConfirm(n.id, a.key)}
                            >{a.label}</button>
                          ))}
                        </div>
                      )}
                      {n.type === 'confirm' && n.resolved && (
                        <p className="text-xs text-muted-foreground/50 mt-2">已处理</p>
                      )}
                    </div>
                    <button className="shrink-0 p-1 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
                      onClick={() => dismiss(n.id)}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
