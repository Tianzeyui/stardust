import { useState, useMemo, useEffect } from 'react'
import {
  Bot, MessageSquare, Package, FolderOpen, FolderKanban, BookOpen, Lightbulb, BarChart3,
  Settings, LogOut, PanelLeftClose, PanelLeftOpen, User, ChevronDown, Bell,
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
  const { unreadCount } = useNotifications()
  const [showUserMenu, setShowUserMenu] = useState(false)

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
              onClick={() => { setShowUserMenu(false); onNavChange('notifications') }}>
              <Bell className="h-3.5 w-3.5" /> 通知
              {unreadCount > 0 && (
                <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
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
    </aside>
  )
}
