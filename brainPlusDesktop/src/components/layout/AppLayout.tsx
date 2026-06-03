import { useState, useEffect } from 'react'
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'about' | undefined>(undefined)

  useEffect(() => {
    const api = window.electronAPI as any
    if (!api?.onShowAbout) return
    return api.onShowAbout(() => {
      setSettingsTab('about')
      setSettingsOpen(true)
    })
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
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

      <main className="flex-1 overflow-auto relative pt-9">
        {settingsOpen ? (
          <SettingsPage onClose={() => { setSettingsOpen(false); setSettingsTab(undefined) }} initialTab={settingsTab} />
        ) : (
          <>
            {activeNav === 'chat' && <ChatPage />}
            {activeNav === 'ai' && <AIPage />}
            {activeNav === 'diary' && <DiaryPage />}
            {activeNav === 'inspiration' && <InspirationPage />}
            {activeNav === 'skills' && <SkillsPage />}
            {activeNav === 'files' && <FileManagerPage />}
          </>
        )}
      </main>
    </div>
  )
}
