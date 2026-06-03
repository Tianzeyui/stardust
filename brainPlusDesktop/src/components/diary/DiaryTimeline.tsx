import { cn } from '@/lib/utils'
import type { DiaryEntry } from '@/types/diary'

interface DiaryTimelineProps {
  entries: DiaryEntry[]
  selectedDate: string
  onSelect: (date: string) => void
  loading: boolean
}

function groupByMonth(entries: DiaryEntry[]) {
  const groups: { month: string; entries: DiaryEntry[] }[] = []
  const sorted = [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date))

  for (const entry of sorted) {
    const month = entry.entry_date.slice(0, 7) // YYYY-MM
    const last = groups[groups.length - 1]
    if (last && last.month === month) {
      last.entries.push(entry)
    } else {
      groups.push({ month, entries: [entry] })
    }
  }
  return groups
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-')
  return `${y}年${parseInt(m)}月`
}

function formatDay(date: string): string {
  const d = new Date(date)
  return d.toLocaleDateString('zh-CN', { day: 'numeric', weekday: 'short' })
}

export function DiaryTimeline({ entries, selectedDate, onSelect, loading }: DiaryTimelineProps) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">还没有日记，点击右上角新建</p>
      </div>
    )
  }

  const groups = groupByMonth(entries)

  return (
    <div className="flex-1 overflow-auto py-2">
      {groups.map((group) => (
        <div key={group.month}>
          <div className="sticky top-0 bg-muted/80 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur-sm">
            {formatMonth(group.month)}
          </div>
          {group.entries.map((entry) => {
            const isActive = entry.entry_date === selectedDate
            return (
              <button
                key={entry.id}
                className={cn(
                  'group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent',
                  isActive && 'bg-accent border-r-2 border-primary',
                )}
                onClick={() => onSelect(entry.entry_date)}
              >
                <div className="flex w-12 shrink-0 flex-col items-center text-center">
                  <span className={cn('text-lg font-semibold tabular-nums', isActive && 'text-primary')}>
                    {new Date(entry.entry_date).getDate()}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(entry.entry_date).toLocaleDateString('zh-CN', { weekday: 'short' })}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm font-medium', isActive && 'text-primary')}>
                    {entry.title || '无标题'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.content.slice(0, 40) || '空内容'}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
