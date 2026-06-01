import { useState } from 'react'
import {
  MessageSquare,
  BookOpen,
  Settings,
  LogOut,
  Brain,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { SettingsDialog } from '@/components/auth/SettingsDialog'

export type NavItem = 'ai' | 'diary'

interface SidebarProps {
  activeNav: NavItem
  onNavChange: (item: NavItem) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

const navItems: { id: NavItem; label: string; icon: typeof BookOpen }[] = [
  { id: 'ai', label: 'AI 助手', icon: MessageSquare },
  { id: 'diary', label: '日记', icon: BookOpen },
]

export function Sidebar({ activeNav, onNavChange, collapsed, onToggleCollapse }: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { signOut } = useAuth()

  return (
    <>
      <aside
        className={cn(
          'flex h-screen flex-col border-r border-border bg-card py-4 transition-all duration-200',
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

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onToggleCollapse}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        {/* 中间导航按钮 */}
        <nav className={cn('flex flex-1 gap-2', collapsed ? 'flex-col items-center' : 'flex-col')}>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeNav === item.id
            return (
              <Button
                key={item.id}
                variant={isActive ? 'default' : 'ghost'}
                size={collapsed ? 'icon' : 'default'}
                className={cn(
                  'transition-all',
                  collapsed
                    ? 'h-10 w-10'
                    : 'justify-start gap-3',
                  !isActive && 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => onNavChange(item.id)}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Button>
            )
          })}
        </nav>

        {/* 底部按钮 */}
        <div className={cn('flex gap-2', collapsed ? 'flex-col items-center' : 'flex-col')}>
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'default'}
            className={cn(
              'text-muted-foreground hover:text-foreground',
              collapsed ? 'h-10 w-10' : 'justify-start gap-3',
            )}
            onClick={() => setSettingsOpen(true)}
            title={collapsed ? '设置' : undefined}
          >
            <Settings className="h-5 w-5 shrink-0" />
            {!collapsed && <span>设置</span>}
          </Button>

          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'default'}
            className={cn(
              'text-muted-foreground hover:text-destructive',
              collapsed ? 'h-10 w-10' : 'justify-start gap-3',
            )}
            onClick={signOut}
            title={collapsed ? '退出登录' : undefined}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!collapsed && <span>退出登录</span>}
          </Button>
        </div>
      </aside>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
