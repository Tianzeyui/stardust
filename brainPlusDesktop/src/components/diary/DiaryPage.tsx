import { useState, useCallback, useEffect } from 'react'
import { Plus, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DiaryTimeline } from './DiaryTimeline'
import { DiaryContent } from './DiaryContent'
import { isSupabaseConfigured } from '@/lib/supabase'
import { fetchDiaryEntries, upsertDiaryEntry } from '@/lib/diaryService'
import { AIPlaceholder } from '@/components/ai/AIPlaceholder'
import type { DiaryEntry } from '@/types/diary'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function DiaryPage() {
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(todayStr())
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadEntries = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    setLoading(true)
    try {
      const data = await fetchDiaryEntries()
      setEntries(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const selectedEntry = entries.find((e) => e.entry_date === selectedDate) ?? null

  const handleSave = useCallback(
    async (content: string, title?: string, tags?: string[]) => {
      await upsertDiaryEntry({ entry_date: selectedDate, content, title, tags: tags || [] })
      setEditing(false)
      await loadEntries()
    },
    [selectedDate, loadEntries],
  )

  const handleSelectDate = (date: string) => {
    setSelectedDate(date)
    setEditing(false)
  }

  const handleNew = () => {
    setSelectedDate(todayStr())
    setEditing(true)
  }

  if (!isSupabaseConfigured()) {
    return <AIPlaceholder />
  }

  return (
    <div className="flex h-full">
      {/* 左侧时间轴 */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border bg-card/50">
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <h2 className="font-semibold">日记</h2>
          <Button size="sm" onClick={handleNew}>
            <Plus className="mr-1 h-4 w-4" />
            新建
          </Button>
        </div>

        <DiaryTimeline
          entries={entries}
          selectedDate={selectedDate}
          onSelect={handleSelectDate}
          loading={loading}
        />
      </div>

      {/* 右侧：内容 + 编辑 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 顶栏 */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <p className="text-sm text-muted-foreground">
            {new Date(selectedDate).toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </p>
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <PenLine className="mr-1 h-4 w-4" />
              {selectedEntry ? '编辑' : '写日记'}
            </Button>
          )}
        </div>

        {/* 内容 / 编辑器 */}
        <div className="flex-1 overflow-auto p-8">
          <DiaryContent
            entry={selectedEntry}
            editing={editing}
            onStartEdit={() => setEditing(true)}
            onCancelEdit={() => setEditing(false)}
            onSave={handleSave}
          />
        </div>
      </div>
    </div>
  )
}
