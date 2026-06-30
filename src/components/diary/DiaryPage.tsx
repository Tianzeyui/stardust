import { useState, useCallback, useEffect } from 'react'
import { Plus, PenLine, BookOpen, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DiaryTimeline } from './DiaryTimeline'
import { DiaryContent } from './DiaryContent'
import { isSupabaseConfigured } from '@/lib/supabase'
import { fetchDiaryEntries, upsertDiaryEntry, deleteDiaryEntry } from '@/lib/diaryService'
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

  const handleDelete = async () => {
    if (!selectedEntry) return
    if (!confirm(`确定删除 ${selectedEntry.entry_date}${selectedEntry.title ? `「${selectedEntry.title}」` : ''} 的日记吗？`)) return
    await deleteDiaryEntry(selectedEntry.id)
    setSelectedDate(todayStr())
    setEditing(false)
    await loadEntries()
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">请先配置 Supabase 连接</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* 统一顶栏 */}
      <div className="flex h-11 items-center gap-2 border-b border-border px-4">
        <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
        <h2 className="text-sm font-semibold">日记</h2>
        <div className="flex-1" />
        <p className="text-sm text-muted-foreground">
          {new Date(selectedDate).toLocaleDateString('zh-CN', {
            year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
          })}
        </p>
        {selectedEntry && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>
            <PenLine className="mr-1 h-3.5 w-3.5" />
            编辑
          </Button>
        )}
        {selectedEntry && (
          <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={handleDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            删除
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleNew}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          写日记
        </Button>
      </div>

      {/* 内容区：时间轴 + 正文 */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-72 shrink-0 flex-col border-r border-border">
          <DiaryTimeline
            entries={entries}
            selectedDate={selectedDate}
            onSelect={handleSelectDate}
            loading={loading}
          />
        </div>
        <div className="flex flex-1 flex-col overflow-auto p-4">
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
