/**
 * 社区插件服务
 * 通过 GitHub REST API 获取 brainPlus-community-plugins 仓库中的插件列表
 */
import * as lucide from 'lucide-react'

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
const CACHE_KEY = 'brainplus_community_plugins'
const CACHE_TIME_KEY = 'brainplus_community_plugins_time'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 分钟

/**
 * 通过 Electron IPC 发起 HTTP 请求（绕过 CORS）
 */
async function fetchViaIPC(url: string): Promise<any> {
  const api = (window as any).electronAPI?.http
  if (!api) throw new Error('Electron HTTP API 不可用')

  const result = await api.fetch(url, {
    headers: {
      'User-Agent': 'brainPlus',
      'Accept': 'application/vnd.github.v3+json',
    },
  })

  if (!result.success) throw new Error(result.error || 'HTTP 请求失败')
  if (result.status === 403) throw new Error('GitHub API 限流，请稍后再试')
  if (result.status !== 200) throw new Error(`GitHub API 错误 (${result.status})`)

  return JSON.parse(result.data)
}

/**
 * 获取社区插件列表
 */
export async function fetchCommunityPlugins(): Promise<CommunityPlugin[]> {
  // 1. 列出仓库顶级目录
  const contents: Array<{ name: string; type: string }> = await fetchViaIPC(
    `${API_BASE}/contents/`,
  )

  const dirs = contents.filter(
    (item) => item.type === 'dir' && !item.name.startsWith('_') && !item.name.startsWith('.'),
  )

  // 2. 并行获取每个插件的 manifest.json
  const results = await Promise.allSettled(
    dirs.map(async (dir) => {
      const manifest = await fetchViaIPC(
        `${API_BASE}/contents/${encodeURIComponent(dir.name)}/manifest.json`,
      )
      // GitHub API 返回的 content 是 base64 编码
      if (manifest.content && manifest.encoding === 'base64') {
        const decoded = JSON.parse(atob(manifest.content))
        return {
          id: decoded.id || dir.name,
          name: decoded.name || dir.name,
          version: decoded.version || '0.0.0',
          description: decoded.description || '',
          icon: decoded.icon || 'Package',
          permissions: decoded.permissions,
        } as CommunityPlugin
      }
      return null
    }),
  )

  // 过滤掉失败的请求
  return results
    .filter((r): r is PromiseFulfilledResult<CommunityPlugin | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((p): p is CommunityPlugin => p !== null)
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

/**
 * 获取 lucide-react 图标组件
 */
export function getIconComponent(iconName: string) {
  return (lucide as any)[iconName] || lucide.Package
}
