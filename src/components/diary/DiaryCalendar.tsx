import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DiaryEntry } from '@/types/diary'

interface DiaryCalendarProps {
  entries: DiaryEntry[]
  selectedDate: string
  onSelect: (date: string) => void
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

export function DiaryCalendar({ entries, selectedDate, onSelect }: DiaryCalendarProps) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1) // 1-based

  const entryDates = new Set(entries.map(e => e.entry_date))

  // 当前视图的年月
  const firstDay = new Date(viewYear, viewMonth - 1, 1)
  const lastDay = new Date(viewYear, viewMonth, 0)
  const daysInMonth = lastDay.getDate()
  // 第一天是周几（0=周日，转换为 1=周一）
  const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12) }
    else setViewMonth(viewMonth - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1) }
    else setViewMonth(viewMonth + 1)
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null) // 空白填充
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const todayStr = today.toISOString().slice(0, 10)

  return (
    <div className="select-none">
      {/* 月份导航 */}
      <div className="flex items-center justify-between mb-2 px-1">
        <button className="p-0.5 hover:bg-muted rounded transition-colors" onClick={prevMonth}>
          <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <span className="text-xs font-medium">{viewYear}年{viewMonth}月</span>
        <button className="p-0.5 hover:bg-muted rounded transition-colors" onClick={nextMonth}>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* 星期表头 */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[10px] text-muted-foreground py-0.5">{d}</div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="aspect-square" />

          const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const hasEntry = entryDates.has(dateStr)
          const isSelected = dateStr === selectedDate
          const isToday = dateStr === todayStr

          return (
            <button
              key={dateStr}
              className={`aspect-square flex items-center justify-center text-xs rounded-sm transition-colors
                ${isSelected ? 'bg-primary text-primary-foreground font-semibold' : ''}
                ${!isSelected && hasEntry ? 'bg-primary/15 text-primary font-medium hover:bg-primary/25' : ''}
                ${!isSelected && !hasEntry ? 'text-muted-foreground hover:bg-muted/50' : ''}
                ${isToday && !isSelected ? 'ring-1 ring-primary/30' : ''}
              `}
              onClick={() => onSelect(dateStr)}
              title={hasEntry ? `${dateStr} 有日记` : dateStr}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
