/**
 * 插件仓库管理器
 * 克隆 Git 仓库到本地，读取 plugins.json 索引
 */
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'

/**
 * 从 Git URL 提取仓库名
 */
export function repoNameFromUrl(url: string): string {
  // https://github.com/owner/repo.git → repo
  // git@github.com:owner/repo.git → repo
  const match = url.match(/[/:]([^/]+?)(?:\.git)?$/)
  return match ? match[1] : url.replace(/[^a-zA-Z0-9]/g, '_')
}

/**
 * 克隆仓库，返回 { success, repoDir, error }
 */
export async function cloneRepo(
  url: string,
  reposDir: string,
): Promise<{ success: boolean; repoDir?: string; error?: string }> {
  const name = repoNameFromUrl(url)
  const repoDir = path.join(reposDir, name)

  // 如果已存在，先删除再重新克隆
  if (fs.existsSync(repoDir)) {
    fs.rmSync(repoDir, { recursive: true, force: true })
  }

  return new Promise((resolve) => {
    execFile('git', ['clone', '--depth', '1', url, repoDir], {
      timeout: 120000,
    }, (err) => {
      if (err) {
        resolve({ success: false, error: `克隆失败: ${err.message}` })
        return
      }
      resolve({ success: true, repoDir })
    })
  })
}

/**
 * 更新已克隆的仓库（git pull）
 */
export async function pullRepo(repoDir: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    execFile('git', ['pull'], { cwd: repoDir, timeout: 60000 }, (err) => {
      if (err) {
        resolve({ success: false, error: `更新失败: ${err.message}` })
        return
      }
      resolve({ success: true })
    })
  })
}

/**
 * 读取仓库中的 plugins.json
 */
export function readRepoPluginsJson(repoDir: string): any[] | null {
  const indexPath = path.join(repoDir, 'plugins.json')
  if (!fs.existsSync(indexPath)) return null
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
  } catch {
    return null
  }
}
