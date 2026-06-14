/**
 * Main process Supabase client
 * 复用 renderer 的 Supabase 配置（通过 IPC 或环境变量）
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

let client: SupabaseClient | null = null

function loadConfig(): { url: string; anonKey: string } | null {
  try {
    // 尝试从 userData 读取配置
    const configPath = path.join(app.getPath('userData'), 'supabase.json')
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }
  } catch {}
  // fallback: 环境变量
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    return { url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY }
  }
  return null
}

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client
  const config = loadConfig()
  console.log('[supabaseClient] loadConfig:', config ? `url=${config.url.slice(0, 30)}...` : 'null')
  if (!config || !config.url) return null
  client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}
