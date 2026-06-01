import { useState } from 'react'
import { Sidebar, type NavItem } from './Sidebar'
import { AIPlaceholder } from '@/components/ai/AIPlaceholder'
import { DiaryPage } from '@/components/diary/DiaryPage'

export function AppLayout() {
  const [activeNav, setActiveNav] = useState<NavItem>('ai')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* 背景装饰 */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] h-[30%] w-[30%] rounded-full bg-tertiary/5 blur-[100px]" />
      </div>

      {/* 左侧导航栏 */}
      <Sidebar
        activeNav={activeNav}
        onNavChange={setActiveNav}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      {/* 右侧内容区 */}
      <main className="flex-1 overflow-auto relative">
        {activeNav === 'ai' && <AIPlaceholder />}
        {activeNav === 'diary' && <DiaryPage />}
      </main>
    </div>
  )
}
