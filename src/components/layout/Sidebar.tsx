import { useState, useMemo, useEffect } from 'react'
import {
  Bot, MessageSquare, Package, FolderOpen, FolderKanban, BookOpen, Lightbulb, BarChart3,
  Settings, LogOut, PanelLeftClose, PanelLeftOpen, User, ChevronDown, Bell, CheckCircle, XCircle, Info, AlertTriangle, AlertCircle, ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { pluginSystem } from '@/lib/pluginSystem'
import type { NavItemDef } from '@/lib/pluginTypes'

import { initCorePlugins } from '@/lib/corePlugins'

export type NavItem = string

interface SidebarProps {
  activeNav: NavItem
  onNavChange: (item: NavItem) => void
  collapsed: boolean
  onToggleCollapse: () => void
  onOpenSettings: () => void
  onCloseSettings: () => void
}

const iconMap: Record<string, any> = {
  Bot, MessageSquare, Package, FolderOpen, FolderKanban, BookOpen, Lightbulb, BarChart3,
}

export function Sidebar({ activeNav, onNavChange, collapsed, onToggleCollapse, onOpenSettings, onCloseSettings }: SidebarProps) {
  const [ready, setReady] = useState(false)
  const [version, setVersion] = useState(0)
  const navItems = useMemo(() => ready ? pluginSystem.getNavItems() : [], [ready, version])

  useEffect(() => { initCorePlugins(); setReady(true) }, [])
  useEffect(() => {
    // 异步恢复第三方插件
    const paths = pluginSystem.getInstalledPaths()
    if (paths.length > 0) {
      Promise.all(paths.map(p => pluginSystem.restoreInstalled(p))).then(() => setVersion(pluginSystem.getVersion()))
    }
    // 监听插件变更（安装/卸载/启停）
    return pluginSystem.onChange(() => setVersion(pluginSystem.getVersion()))
  }, [])
  const { user, signOut } = useAuth()
  const { notifications, unreadCount, dismiss, resolveConfirm, markAllRead } = useNotifications()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifPopover, setShowNotifPopover] = useState(false)

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-card py-4 transition-all duration-200',
        collapsed ? 'w-16 items-center' : 'w-52 items-stretch px-3',
      )}
    >
      {/* 顶部：Logo + 折叠按钮 */}
      <div className={cn('mb-6 flex items-center', collapsed ? 'flex-col gap-2' : 'justify-between')}>
        <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
            <img src="/assets/icons/iconWhite.svg" alt="BrainPlus" className="h-7 w-7" />
          </div>
          {!collapsed && <span className="text-lg font-bold tracking-tight">BrainPlus</span>}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onToggleCollapse} title={collapsed ? '展开侧边栏' : '收起侧边栏'}>
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      {/* 中间导航——从 PluginSystem 动态渲染 */}
      <nav className={cn('flex flex-1 gap-2 overflow-auto', collapsed ? 'flex-col items-center' : 'flex-col')}>
        {navItems.map(item => {
          const IconComponent = iconMap[item.icon] || Bot
          const isActive = activeNav === item.id
          const isPlugin = pluginSystem.isPlugin(item.id)
          return (
            <Button key={item.id} variant={isActive ? 'default' : 'ghost'}
              size={collapsed ? 'icon' : 'default'}
              className={cn('transition-all relative', collapsed ? 'h-10 w-10' : 'justify-start gap-3', !isActive && 'text-muted-foreground hover:text-foreground')}
              onClick={() => { onCloseSettings(); onNavChange(item.id) }} title={collapsed ? (isPlugin ? `${item.label}（插件）` : item.label) : undefined}>
              <IconComponent className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate flex-1 min-w-0 text-left">{item.label}</span>
                  {isPlugin && (
                    <span className="text-[9px] leading-none text-muted-foreground/35 shrink-0 ml-1 select-none">插件</span>
                  )}
                </>
              )}
              {collapsed && isPlugin && (
                <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/25" title="插件" />
              )}
            </Button>
          )
        })}
      </nav>

      {/* 通知铃铛 */}
      <div className="relative mb-1">
        <button
          className={cn(
            'flex items-center gap-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            collapsed ? 'p-1.5' : 'w-full px-2 py-1.5',
          )}
          onClick={() => setShowNotifPopover(!showNotifPopover)}
        >
          <div className="relative">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-destructive-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          {!collapsed && <span className="text-xs">通知</span>}
        </button>

        {/* 通知气泡 */}
        {showNotifPopover && (
          <div className={cn(
            'absolute z-50 rounded-xl border border-border bg-card shadow-xl',
            collapsed ? 'left-full bottom-0 ml-2 w-80' : 'bottom-full left-0 mb-2 w-80',
          )}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-xs font-semibold">通知</span>
              <div className="flex items-center gap-2">
                {notifications.length > 0 && (
                  <button className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground" onClick={markAllRead}>
                    全部已读
                  </button>
                )}
                <button className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-0.5"
                  onClick={() => { setShowNotifPopover(false); onNavChange('notifications') }}>
                  查看全部 <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-xs text-muted-foreground text-center">暂无通知</p>
              ) : (
                notifications.slice(0, 20).map(n => {
                  const iconMap: Record<string, any> = { info: Info, warning: AlertTriangle, error: AlertCircle, confirm: AlertTriangle }
                  const colorMap: Record<string, string> = { info: 'text-blue-500', warning: 'text-yellow-500', error: 'text-destructive', confirm: 'text-yellow-500' }
                  const IconComp = iconMap[n.type] || Info
                  return (
                    <div key={n.id} className={`border-b border-border/50 last:border-0 px-4 py-3 ${n.read ? '' : 'bg-accent/30'}`}>
                      <div className="flex items-start gap-2.5">
                        <IconComp className={`h-4 w-4 shrink-0 mt-0.5 ${colorMap[n.type]}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{n.title}</p>
                          <p className="text-[11px] text-muted-foreground/60 mt-0.5">{n.message}</p>
                          {n.source && <p className="text-[9px] text-muted-foreground/40 mt-0.5">{n.source}</p>}
                          {/* 确认按钮 */}
                          {n.type === 'confirm' && n.actions && !n.resolved && (
                            <div className="flex gap-2 mt-2.5">
                              {n.actions.map(a => (
                                <button key={a.key}
                                  className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
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
                            <p className="text-[10px] text-muted-foreground/50 mt-1">已处理</p>
                          )}
                        </div>
                        {n.type !== 'confirm' && (
                          <button className="shrink-0 p-0.5 text-muted-foreground/20 hover:text-muted-foreground"
                            onClick={() => dismiss(n.id)}>
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* 底部：用户信息 + 菜单 */}
      <div className={cn('relative', collapsed ? 'flex flex-col items-center' : '')}>
        <button
          className={cn(
            'flex items-center gap-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            collapsed ? 'p-1.5' : 'w-full px-2 py-1.5',
          )}
          onClick={() => setShowUserMenu(!showUserMenu)}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-4 w-4" />
          </div>
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-xs truncate">{user?.email || '用户'}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
            </>
          )}
        </button>

        {showUserMenu && (
          <div className={cn(
            'absolute z-50 rounded-lg border border-border bg-card shadow-lg py-1',
            collapsed ? 'left-full bottom-0 ml-1 w-40' : 'bottom-full left-0 mb-1 w-full',
          )}>
            <button className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => { setShowUserMenu(false); onNavChange('usage') }}>
              <BarChart3 className="h-3.5 w-3.5" /> 用量统计
            </button>
            <button className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => { setShowUserMenu(false); onOpenSettings() }}>
              <Settings className="h-3.5 w-3.5" /> 设置
            </button>
            <button className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
              onClick={() => { setShowUserMenu(false); signOut() }}>
              <LogOut className="h-3.5 w-3.5" /> 退出登录
            </button>
          </div>
        )}
      </div>

      {showUserMenu && <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />}
      {showNotifPopover && <div className="fixed inset-0 z-40" onClick={() => setShowNotifPopover(false)} />}
    </aside>
  )
}
