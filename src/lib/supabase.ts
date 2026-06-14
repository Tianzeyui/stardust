import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ========== 内存缓存（磁盘文件 + IPC） ==========

let supabaseCache: { url: string; anonKey: string } | null = null
let cachedClient: SupabaseClient | null = null

const api = () => window.electronAPI?.config

/** 启动时从磁盘加载 */
export async function initSupabaseConfig(): Promise<void> {
  if (!api()) return
  const config = await api()!.getSupabase()
  if (config.url && config.anonKey) {
    supabaseCache = config
  }
}

export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  return supabaseCache
}

export async function saveSupabaseConfig(url: string, anonKey: string): Promise<void> {
  supabaseCache = { url, anonKey }
  cachedClient = null
  await api()?.saveSupabase(supabaseCache)
}

export async function clearSupabaseConfig(): Promise<void> {
  supabaseCache = null
  cachedClient = null
  await api()?.clearSupabase()
}

export function isSupabaseConfigured(): boolean {
  return !!supabaseCache
}

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient
  if (!supabaseCache) return null
  cachedClient = createClient(supabaseCache.url, supabaseCache.anonKey)
  return cachedClient
}
