import { useState, useEffect, useCallback } from 'react'
import type { DiaryEntry } from '@/types/diary'
import {
  fetchDiaryByDate,
  fetchPreviousDiary,
  fetchNextDiary,
  upsertDiaryEntry,
  deleteDiaryEntry,
} from '@/lib/diaryService'
import { isSupabaseConfigured } from '@/lib/supabase'

interface UseDiaryReturn {
  entry: DiaryEntry | null
  prevEntry: DiaryEntry | null
  loading: boolean
  error: string | null
  currentDate: string
  setCurrentDate: (date: string) => void
  goToPrevDay: () => void
  goToNextDay: () => void
  saveEntry: (content: string, title?: string, tags?: string[]) => Promise<void>
  removeEntry: () => Promise<void>
  refresh: () => void
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function offsetDate(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function useDiary(initialDate?: string): UseDiaryReturn {
  const [currentDate, setCurrentDate] = useState(initialDate || todayStr())
  const [entry, setEntry] = useState<DiaryEntry | null>(null)
  const [prevEntry, setPrevEntry] = useState<DiaryEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (date: string) => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [current, previous] = await Promise.all([
        fetchDiaryByDate(date),
        fetchPreviousDiary(date),
      ])
      setEntry(current)
      setPrevEntry(previous)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载日记失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(currentDate)
  }, [currentDate, load])

  const goToPrevDay = useCallback(() => {
    setCurrentDate((d) => offsetDate(d, -1))
  }, [])

  const goToNextDay = useCallback(() => {
    setCurrentDate((d) => offsetDate(d, 1))
  }, [])

  const saveEntry = useCallback(
    async (content: string, title?: string, tags?: string[]) => {
      setError(null)
      try {
        const result = await upsertDiaryEntry({
          entry_date: currentDate,
          content,
          title,
          tags: tags || [],
        })
        setEntry(result)
      } catch (e) {
        setError(e instanceof Error ? e.message : '保存日记失败')
        throw e
      }
    },
    [currentDate],
  )

  const removeEntry = useCallback(async () => {
    if (!entry) return
    setError(null)
    try {
      await deleteDiaryEntry(entry.id)
      setEntry(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除日记失败')
      throw e
    }
  }, [entry])

  return {
    entry,
    prevEntry,
    loading,
    error,
    currentDate,
    setCurrentDate,
    goToPrevDay,
    goToNextDay,
    saveEntry,
    removeEntry,
    refresh: () => load(currentDate),
  }
}
