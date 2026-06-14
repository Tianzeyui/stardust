/**
 * 社区插件服务
 * 从 GitHub brainPlus-community-plugins 仓库获取插件列表
 * 使用 raw.githubusercontent.com 直接获取文件，避免 API 限流和 base64 解码
 */

export interface CommunityPlugin {
  id: string
  name: string
  version: string
  description: string
  icon: string
  permissions?: string[]
}

const REPO = 'Tianzeyui/brainPlus-community-plugins'
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`
const CACHE_KEY = 'brainplus_community_plugins'
const CACHE_TIME_KEY = 'brainplus_community_plugins_time'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 分钟

/**
 * 通过 Electron IPC 发起 HTTP 请求，返回原始文本
 */
async function fetchText(url: string): Promise<string> {
  const api = (window as any).electronAPI?.http
  if (!api) throw new Error('Electron HTTP API 不可用')

  const result = await api.fetch(url)

  if (!result.success) throw new Error(result.error || 'HTTP 请求失败')
  if (result.status !== 200) throw new Error(`HTTP ${result.status}`)

  return result.data
}

/**
 * 通过 Electron IPC 请求 JSON
 */
async function fetchJSON(url: string): Promise<any> {
  const text = await fetchText(url)
  return JSON.parse(text)
}

/**
 * 获取社区插件列表
 * 从 raw.githubusercontent.com 读取 plugins.json 索引文件，无需 GitHub API 认证
 */
export async function fetchCommunityPlugins(): Promise<CommunityPlugin[]> {
  const url = `${RAW_BASE}/plugins.json`
  const plugins: CommunityPlugin[] = await fetchJSON(url)
  return plugins.filter(p => !p.id.startsWith('_'))
}

/**
 * 获取缓存的插件列表
 */
export function getCachedPlugins(): CommunityPlugin[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const timeStr = localStorage.getItem(CACHE_TIME_KEY)
    if (!raw || !timeStr) return null

    const age = Date.now() - parseInt(timeStr, 10)
    if (age > CACHE_TTL_MS) return null

    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 缓存插件列表
 */
export function cachePlugins(plugins: CommunityPlugin[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(plugins))
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()))
  } catch {
    // localStorage 可能满了，忽略
  }
}

/**
 * 获取缓存年龄（分钟），null 表示无缓存
 */
export function getCacheAgeMinutes(): number | null {
  try {
    const timeStr = localStorage.getItem(CACHE_TIME_KEY)
    if (!timeStr) return null
    return Math.floor((Date.now() - parseInt(timeStr, 10)) / 60000)
  } catch {
    return null
  }
}
