import { useState } from 'react'
import {
  MessageSquare, Bot, BookOpen, Lightbulb, Package,
  Settings, LogOut, Brain, PanelLeftClose, PanelLeftOpen,
  FolderOpen, User, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

export type NavItem = 'chat' | 'ai' | 'diary' | 'inspiration' | 'skills' | 'files'

interface SidebarProps {
  activeNav: NavItem
  onNavChange: (item: NavItem) => void
  collapsed: boolean
  onToggleCollapse: () => void
  onOpenSettings: () => void
  onCloseSettings: () => void
}

const navItems: { id: NavItem; label: string; icon: typeof BookOpen }[] = [
  { id: 'chat', label: 'AI 助手', icon: Bot },
  { id: 'ai', label: 'AI 工具箱', icon: MessageSquare },
  { id: 'diary', label: '日记', icon: BookOpen },
  { id: 'inspiration', label: '灵感记录', icon: Lightbulb },
  { id: 'skills', label: 'Skills', icon: Package },
  { id: 'files', label: '文件', icon: FolderOpen },
]

export function Sidebar({ activeNav, onNavChange, collapsed, onToggleCollapse, onOpenSettings, onCloseSettings }: SidebarProps) {
  const { user, signOut } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-border bg-card pt-9 pb-4 transition-all duration-200',
        collapsed ? 'w-16 items-center' : 'w-52 items-stretch px-3',
      )}
    >
      {/* 顶部：Logo + 折叠按钮 */}
      <div className={cn('mb-6 flex items-center', collapsed ? 'flex-col gap-2' : 'justify-between')}>
        <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && <span className="text-lg font-bold tracking-tight">BrainPlus</span>}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onToggleCollapse} title={collapsed ? '展开侧边栏' : '收起侧边栏'}>
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      {/* 中间导航 */}
      <nav className={cn('flex flex-1 gap-2', collapsed ? 'flex-col items-center' : 'flex-col')}>
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeNav === item.id
          return (
            <Button key={item.id} variant={isActive ? 'default' : 'ghost'}
              size={collapsed ? 'icon' : 'default'}
              className={cn('transition-all', collapsed ? 'h-10 w-10' : 'justify-start gap-3', !isActive && 'text-muted-foreground hover:text-foreground')}
              onClick={() => { onCloseSettings(); onNavChange(item.id) }} title={collapsed ? item.label : undefined}>
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
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
              <span className="flex-1 text-left text-xs truncate">
                {user?.email || '用户'}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
            </>
          )}
        </button>

        {/* 下拉菜单 */}
        {showUserMenu && (
          <div className={cn(
            'absolute z-50 rounded-lg border border-border bg-card shadow-lg py-1',
            collapsed ? 'left-full bottom-0 ml-1 w-40' : 'bottom-full left-0 mb-1 w-full',
          )}>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => { setShowUserMenu(false); onOpenSettings() }}
            >
              <Settings className="h-3.5 w-3.5" /> 设置
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => { setShowUserMenu(false); signOut() }}
            >
              <LogOut className="h-3.5 w-3.5" /> 退出登录
            </button>
          </div>
        )}
      </div>

      {/* 点击空白处关闭菜单 */}
      {showUserMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
      )}
    </aside>
  )
}
