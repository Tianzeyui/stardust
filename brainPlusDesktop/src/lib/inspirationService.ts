import { getSupabaseClient, isSupabaseConfigured } from './supabase'
import type { Inspiration, InspirationFolder, InspirationInsert, InspirationUpdate } from '@/types/inspiration'

function requireClient() {
  if (!isSupabaseConfigured()) throw new Error('请先配置 Supabase')
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase 客户端未初始化')
  return client
}

// ====== 文件夹 ======

export async function fetchFolders(): Promise<InspirationFolder[]> {
  const supabase = requireClient()
  const { data, error } = await supabase
    .from('inspiration_folders')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as InspirationFolder[]
}

export async function createFolder(name: string): Promise<InspirationFolder> {
  const supabase = requireClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')
  const { data, error } = await supabase
    .from('inspiration_folders')
    .insert({ name: name.trim(), user_id: user.id })
    .select()
    .single()
  if (error) throw error
  return data as InspirationFolder
}

export async function deleteFolder(id: string): Promise<void> {
  const supabase = requireClient()
  const { error } = await supabase
    .from('inspiration_folders')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ====== 灵感 ======

export async function fetchInspirations(folderId?: string | null): Promise<Inspiration[]> {
  const supabase = requireClient()
  let query = supabase
    .from('inspirations')
    .select('*')
    .order('created_at', { ascending: false })

  if (folderId !== undefined && folderId !== null) {
    query = query.eq('folder_id', folderId)
  }

  const { data, error } = await query
  if (error) throw error
  return data as Inspiration[]
}

export async function searchInspirations(query: string): Promise<Inspiration[]> {
  const supabase = requireClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')

  // 尝试用 RPC 全文搜索
  const { data, error } = await supabase
    .rpc('search_inspirations', { search_query: query, user_uuid: user.id })

  if (!error && data) return data as Inspiration[]

  // 回退到 ILIKE 模糊搜索
  const { data: fallback } = await supabase
    .from('inspirations')
    .select('*')
    .eq('user_id', user.id)
    .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
    .order('created_at', { ascending: false })

  return (fallback || []) as Inspiration[]
}

export async function insertInspiration(item: InspirationInsert): Promise<Inspiration> {
  const supabase = requireClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')

  const { data, error } = await supabase
    .from('inspirations')
    .insert({ ...item, user_id: user.id })
    .select()
    .single()

  if (error) throw error
  return data as Inspiration
}

export async function updateInspiration(id: string, update: InspirationUpdate): Promise<Inspiration> {
  const supabase = requireClient()
  const { data, error } = await supabase
    .from('inspirations')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Inspiration
}

export async function deleteInspiration(id: string): Promise<void> {
  const supabase = requireClient()
  const { error } = await supabase
    .from('inspirations')
    .delete()
    .eq('id', id)

  if (error) throw error
}
