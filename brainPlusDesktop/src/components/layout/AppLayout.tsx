import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Sidebar, type NavItem } from './Sidebar'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { DynamicRoute } from './DynamicRoute'

export function AppLayout() {
  const [activeNav, setActiveNav] = useState<NavItem>('chat')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'about' | undefined>(undefined)

  // A2A 远程任务监听（始终挂载，不在 ChatPage 依赖）
  useEffect(() => {
    const api = window.electronAPI as any
    if (!api?.on) return
    return api.on('a2a:newTask', async (data: any) => {
      console.log('[AppLayout] A2A 远程任务:', data)
      try {
        const { listAgents } = await import('@/lib/agentStore')
        const { delegateToAgent } = await import('@/lib/orchestrator')
        const agents = await listAgents()
        const agent = agents.find((a: any) => a.status === 'active' && a.name === data.agentName)
        if (agent) {
          const result = await delegateToAgent(agent, data.input)
          api.a2a?.completeTask(data.id, result.plainText, result.error).catch(() => {})
        } else {
          api.a2a?.completeTask(data.id, '', `Agent "${data.agentName}" 未找到`).catch(() => {})
        }
      } catch (e: any) { console.warn('[AppLayout] A2A 执行失败:', e.message) }
    })
  }, [])

  useEffect(() => {
    const api = window.electronAPI as any
    if (!api?.onShowAbout) return
    return api.onShowAbout(() => {
      setSettingsTab('about')
      setSettingsOpen(true)
    })
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* 拖拽条 — 含侧边栏分隔线延伸 */}
      <div
        className="h-9 shrink-0 flex"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className={cn(
          'h-full shrink-0 border-r border-border transition-all duration-200',
          sidebarCollapsed ? 'w-16' : 'w-52',
        )} />
        <div className="flex-1" />
      </div>

      <div className="flex flex-1 overflow-hidden" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute top-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-primary/5 blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-10%] h-[30%] w-[30%] rounded-full bg-tertiary/5 blur-[100px]" />
        </div>

        <Sidebar
          activeNav={activeNav}
          onNavChange={setActiveNav}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          onOpenSettings={() => { setSettingsTab(undefined); setSettingsOpen(true) }}
          onCloseSettings={() => setSettingsOpen(false)}
        />

        <main className="flex-1 overflow-auto relative">
          {settingsOpen ? (
            <SettingsPage onClose={() => { setSettingsOpen(false); setSettingsTab(undefined) }} initialTab={settingsTab} />
          ) : (
            <DynamicRoute nav={activeNav} onNavChange={setActiveNav} />
          )}
        </main>
      </div>
    </div>
  )
}
