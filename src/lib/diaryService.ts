import { getSupabaseClient, isSupabaseConfigured } from './supabase'
import type { DiaryEntry, DiaryEntryInsert, DiaryEntryUpdate } from '@/types/diary'

function requireClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('请先配置 Supabase 连接信息')
  }
  const client = getSupabaseClient()
  if (!client) {
    throw new Error('Supabase 客户端未初始化')
  }
  return client
}

/** 获取当前用户的日记列表（按日期降序） */
export async function fetchDiaryEntries(
  from?: string,
  to?: string,
): Promise<DiaryEntry[]> {
  const supabase = requireClient()
  let query = supabase
    .from('diary_entries')
    .select('*')
    .order('entry_date', { ascending: false })

  if (from) query = query.gte('entry_date', from)
  if (to) query = query.lte('entry_date', to)

  const { data, error } = await query
  if (error) throw error
  return data as DiaryEntry[]
}

/** 获取某一天的日记 */
export async function fetchDiaryByDate(date: string): Promise<DiaryEntry | null> {
  const supabase = requireClient()
  const { data, error } = await supabase
    .from('diary_entries')
    .select('*')
    .eq('entry_date', date)
    .maybeSingle()

  if (error) throw error
  return data as DiaryEntry | null
}

/** 创建或更新日记（upsert：同一天已存在则更新） */
export async function upsertDiaryEntry(
  entry: DiaryEntryInsert,
): Promise<DiaryEntry> {
  const supabase = requireClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')

  const { data, error } = await supabase
    .from('diary_entries')
    .upsert(
      { ...entry, user_id: user.id },
      { onConflict: 'user_id,entry_date' },
    )
    .select()
    .single()

  if (error) throw error
  return data as DiaryEntry
}

/** 更新日记 */
export async function updateDiaryEntry(
  id: string,
  update: DiaryEntryUpdate,
): Promise<DiaryEntry> {
  const supabase = requireClient()
  const { data, error } = await supabase
    .from('diary_entries')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as DiaryEntry
}

/** 删除日记 */
export async function deleteDiaryEntry(id: string): Promise<void> {
  const supabase = requireClient()
  const { error } = await supabase
    .from('diary_entries')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/** 获取某日的前一篇日记 */
export async function fetchPreviousDiary(
  currentDate: string,
): Promise<DiaryEntry | null> {
  const supabase = requireClient()
  const { data, error } = await supabase
    .from('diary_entries')
    .select('*')
    .lt('entry_date', currentDate)
    .order('entry_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as DiaryEntry | null
}

/** 获取某日的后一篇日记 */
export async function fetchNextDiary(
  currentDate: string,
): Promise<DiaryEntry | null> {
  const supabase = requireClient()
  const { data, error } = await supabase
    .from('diary_entries')
    .select('*')
    .gt('entry_date', currentDate)
    .order('entry_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as DiaryEntry | null
}
