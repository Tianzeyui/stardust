import { useState } from 'react'
import { Sidebar, type NavItem } from './Sidebar'
import { ChatPage } from '@/components/ai/ChatPage'
import { AIPage } from '@/components/ai/AIPage'
import { DiaryPage } from '@/components/diary/DiaryPage'
import { InspirationPage } from '@/components/inspiration/InspirationPage'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { SkillsPage } from '@/components/skills/SkillsPage'
import { FileManagerPage } from '@/components/files/FileManagerPage'

export function AppLayout() {
  const [activeNav, setActiveNav] = useState<NavItem>('chat')
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
        {activeNav === 'chat' && <ChatPage />}
        {activeNav === 'ai' && <AIPage />}
        {activeNav === 'diary' && <DiaryPage />}
        {activeNav === 'inspiration' && <InspirationPage />}
        {activeNav === 'skills' && <SkillsPage />}
        {activeNav === 'files' && <FileManagerPage />}
        {activeNav === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
