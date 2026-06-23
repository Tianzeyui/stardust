/**
 * 插件仓库服务
 * 管理用户添加的 Git 仓库，克隆到本地并读取插件列表
 */
import type { CommunityPlugin } from '@/lib/communityPluginService'

export interface PluginRepo {
  url: string
  name: string
  repoDir?: string
  plugins: CommunityPlugin[]
  addedAt: string
}

const STORAGE_KEY = 'stardust_plugin_repos'

/**
 * 获取已保存的仓库列表
 */
export function getSavedRepos(): PluginRepo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * 保存仓库列表
 */
function saveRepos(repos: PluginRepo[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(repos))
}

/**
 * 从 URL 提取仓库名
 */
function repoNameFromUrl(url: string): string {
  const match = url.match(/[/:]([^/]+?)(?:\.git)?$/)
  return match ? match[1] : url.replace(/[^a-zA-Z0-9]/g, '_')
}

/**
 * 添加仓库（克隆 + 保存）
 */
export async function addRepo(url: string): Promise<{ success: boolean; error?: string; repo?: PluginRepo }> {
  const api = (window as any).electronAPI?.plugin
  if (!api) return { success: false, error: '仅 Electron 环境支持' }

  // 检查是否已添加
  const existing = getSavedRepos()
  if (existing.some(r => r.url === url)) {
    return { success: false, error: '该仓库已添加' }
  }

  // 克隆
  const result = await api.cloneRepo(url)
  if (!result.success) return { success: false, error: result.error }

  const repo: PluginRepo = {
    url,
    name: repoNameFromUrl(url),
    repoDir: result.repoDir,
    plugins: (result.plugins || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      icon: p.icon,
      permissions: p.permissions,
      files: p.files,
    })),
    addedAt: new Date().toISOString(),
  }

  existing.push(repo)
  saveRepos(existing)
  return { success: true, repo }
}

/**
 * 刷新仓库（git pull）
 */
export async function refreshRepo(repoUrl: string): Promise<{ success: boolean; error?: string; plugins?: CommunityPlugin[] }> {
  const api = (window as any).electronAPI?.plugin
  if (!api) return { success: false, error: '仅 Electron 环境支持' }

  const repos = getSavedRepos()
  const repo = repos.find(r => r.url === repoUrl)
  if (!repo?.repoDir) return { success: false, error: '仓库未克隆' }

  const result = await api.pullRepo(repo.repoDir)
  if (!result.success) return result

  // 更新插件列表
  const plugins = (result.plugins || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    version: p.version,
    description: p.description,
    icon: p.icon,
    permissions: p.permissions,
    files: p.files,
  }))

  repo.plugins = plugins
  saveRepos(repos)
  return { success: true, plugins }
}

/**
 * 删除仓库
 */
/**
 * 重新克隆仓库（删除本地后重新 clone）
 */
export async function recloneRepo(repoUrl: string): Promise<{ success: boolean; error?: string; repo?: PluginRepo }> {
  const api = (window as any).electronAPI?.plugin
  if (!api) return { success: false, error: '仅 Electron 环境支持' }

  const repos = getSavedRepos()
  const idx = repos.findIndex(r => r.url === repoUrl)
  if (idx === -1) return { success: false, error: '仓库未找到' }

  // 重新克隆（cloneRepo 会先删除旧目录）
  const result = await api.cloneRepo(repoUrl)
  if (!result.success) return { success: false, error: result.error }

  const updated: PluginRepo = {
    ...repos[idx],
    repoDir: result.repoDir,
    plugins: (result.plugins || []).map((p: any) => ({
      id: p.id, name: p.name, version: p.version,
      description: p.description, icon: p.icon, permissions: p.permissions, files: p.files,
    })),
  }
  repos[idx] = updated
  saveRepos(repos)
  return { success: true, repo: updated }
}

export function removeRepo(url: string): void {
  const repos = getSavedRepos().filter(r => r.url !== url)
  saveRepos(repos)
}

/**
 * 获取所有仓库的插件（合并列表）
 */
export function getAllRepoPlugins(): CommunityPlugin[] {
  return getSavedRepos().flatMap(r => r.plugins)
}
