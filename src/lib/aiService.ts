import { getSupabaseClient, isSupabaseConfigured } from './supabase'
import type { ToolboxCategory, ToolboxItem } from '@/types/ai'

function requireClient() {
  if (!isSupabaseConfigured()) throw new Error('请先配置 Supabase')
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase 客户端未初始化')
  return client
}

// ====== 分类 ======

export async function fetchCategories(): Promise<ToolboxCategory[]> {
  const sb = requireClient()
  const { data, error } = await sb
    .from('toolbox_categories')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data as ToolboxCategory[]
}

export async function createCategory(name: string, icon = ''): Promise<ToolboxCategory> {
  const sb = requireClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('未登录')
  const { data, error } = await sb
    .from('toolbox_categories')
    .insert({ user_id: user.id, name, icon })
    .select()
    .single()
  if (error) throw error
  return data as ToolboxCategory
}

export async function updateCategory(id: string, patch: Partial<Pick<ToolboxCategory, 'name' | 'icon'>>): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('toolbox_categories').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteCategory(id: string): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('toolbox_categories').delete().eq('id', id)
  if (error) throw error
}

// ====== 工具项 ======

export async function fetchItems(categoryId?: string): Promise<ToolboxItem[]> {
  const sb = requireClient()
  let query = sb.from('toolbox_items').select('*').order('sort_order', { ascending: true })
  if (categoryId) query = query.eq('category_id', categoryId)
  const { data, error } = await query
  if (error) throw error
  return data as ToolboxItem[]
}

export async function createItem(item: {
  category_id: string | null
  name: string
  url?: string
  icon?: string
  description?: string
}): Promise<ToolboxItem> {
  const sb = requireClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('未登录')
  const { data, error } = await sb
    .from('toolbox_items')
    .insert({
      user_id: user.id,
      category_id: item.category_id,
      name: item.name,
      url: item.url || '',
      icon: item.icon || '',
      description: item.description || '',
    })
    .select()
    .single()
  if (error) throw error
  return data as ToolboxItem
}

export async function updateItem(id: string, patch: Partial<Pick<ToolboxItem, 'name' | 'url' | 'icon' | 'description' | 'category_id'>>): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('toolbox_items').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteItem(id: string): Promise<void> {
  const sb = requireClient()
  const { error } = await sb.from('toolbox_items').delete().eq('id', id)
  if (error) throw error
}
