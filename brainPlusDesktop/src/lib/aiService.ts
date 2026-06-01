import { getSupabaseClient, isSupabaseConfigured } from './supabase'
import type { AIModelFavorite } from '@/types/ai'

function requireClient() {
  if (!isSupabaseConfigured()) throw new Error('请先配置 Supabase')
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase 客户端未初始化')
  return client
}

/** 获取当前用户的收藏列表 */
export async function fetchFavorites(): Promise<AIModelFavorite[]> {
  const supabase = requireClient()
  const { data, error } = await supabase
    .from('ai_model_favorites')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data as AIModelFavorite[]
}

/** 添加收藏 */
export async function addFavorite(model: {
  model_id: string
  model_name: string
  model_url: string
  model_icon: string
}): Promise<void> {
  const supabase = requireClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')

  const { data: existing } = await supabase
    .from('ai_model_favorites')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { error } = await supabase
    .from('ai_model_favorites')
    .insert({
      user_id: user.id,
      model_id: model.model_id,
      model_name: model.model_name,
      model_url: model.model_url,
      model_icon: model.model_icon,
      sort_order: nextOrder,
    })

  if (error) throw error
}

/** 删除收藏 */
export async function removeFavorite(modelId: string): Promise<void> {
  const supabase = requireClient()
  const { error } = await supabase
    .from('ai_model_favorites')
    .delete()
    .eq('model_id', modelId)

  if (error) throw error
}

/** 更新收藏排序 */
export async function updateFavoriteOrder(items: { id: string; sort_order: number }[]): Promise<void> {
  const supabase = requireClient()
  for (const item of items) {
    await supabase
      .from('ai_model_favorites')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id)
  }
}
