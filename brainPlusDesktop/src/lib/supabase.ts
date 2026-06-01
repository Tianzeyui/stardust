import { createClient, SupabaseClient } from '@supabase/supabase-js'

const STORAGE_KEY_URL = 'brainplus_supabase_url'
const STORAGE_KEY_ANON_KEY = 'brainplus_supabase_anon_key'

let cachedClient: SupabaseClient | null = null

/**
 * 从 localStorage 获取已保存的 Supabase 配置
 */
export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = localStorage.getItem(STORAGE_KEY_URL)
  const anonKey = localStorage.getItem(STORAGE_KEY_ANON_KEY)
  if (url && anonKey) {
    return { url, anonKey }
  }
  return null
}

/**
 * 保存 Supabase 配置到 localStorage
 */
export function saveSupabaseConfig(url: string, anonKey: string): void {
  localStorage.setItem(STORAGE_KEY_URL, url)
  localStorage.setItem(STORAGE_KEY_ANON_KEY, anonKey)
  cachedClient = null // 清除缓存，下次获取时会用新配置创建
}

/**
 * 清除 Supabase 配置
 */
export function clearSupabaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY_URL)
  localStorage.removeItem(STORAGE_KEY_ANON_KEY)
  cachedClient = null
}

/**
 * 是否已配置 Supabase
 */
export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null
}

/**
 * 获取 Supabase 客户端实例
 * 如果配置改变，需要先调用 clearSupabaseConfig 清除缓存
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient

  const config = getSupabaseConfig()
  if (!config) return null

  cachedClient = createClient(config.url, config.anonKey)
  return cachedClient
}
