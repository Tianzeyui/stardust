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
const API_BASE = `https://api.github.com/repos/${REPO}`
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
 * 1. 用 GitHub API 列出目录（1 次请求）
 * 2. 用 raw.githubusercontent.com 获取每个 manifest.json（无需解码 base64）
 */
export async function fetchCommunityPlugins(): Promise<CommunityPlugin[]> {
  // 1. 列出仓库顶级目录
  const contents: Array<{ name: string; type: string }> = await fetchJSON(`${API_BASE}/contents/`)

  const dirs = contents.filter(
    (item) => item.type === 'dir' && !item.name.startsWith('_') && !item.name.startsWith('.'),
  )

  if (dirs.length === 0) return []

  // 2. 并行从 raw.githubusercontent.com 获取每个插件的 manifest.json
  const results = await Promise.allSettled(
    dirs.map(async (dir) => {
      const manifestUrl = `${RAW_BASE}/${encodeURIComponent(dir.name)}/manifest.json`
      const text = await fetchText(manifestUrl)
      const manifest = JSON.parse(text)
      return {
        id: manifest.id || dir.name,
        name: manifest.name || dir.name,
        version: manifest.version || '0.0.0',
        description: manifest.description || '',
        icon: manifest.icon || 'Package',
        permissions: manifest.permissions,
      } as CommunityPlugin
    }),
  )

  return results
    .filter((r): r is PromiseFulfilledResult<CommunityPlugin> => r.status === 'fulfilled')
    .map((r) => r.value)
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
