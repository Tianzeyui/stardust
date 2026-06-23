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

/**
 * 解析 GitHub URL
 * 支持: https://github.com/user/repo
 *       https://github.com/user/repo.git
 *       https://github.com/user/repo/tree/branch/path
 * 返回 { repoUrl, subPath }
 */
export function parseGitHubUrl(url: string): { repoUrl: string; subPath: string } | null {
  // 去掉末尾的 .git 和 /
  const clean = url.replace(/\.git$/, '').replace(/\/$/, '')
  // 匹配 /tree/branch/path 格式
  const treeMatch = clean.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/tree\/[^/]+\/(.+)$/)
  if (treeMatch) {
    return { repoUrl: `https://github.com/${treeMatch[1]}.git`, subPath: treeMatch[2] }
  }
  // 匹配标准 repo URL
  const repoMatch = clean.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)$/)
  if (repoMatch) {
    return { repoUrl: `https://github.com/${repoMatch[1]}.git`, subPath: '' }
  }
  return null
}

/**
 * 克隆仓库到临时目录，返回本地路径
 */
export async function cloneToTemp(url: string): Promise<{ success: boolean; localPath?: string; error?: string }> {
  const os = await import('os')
  const tmpDir = path.join(os.tmpdir(), `stardust-skill-${Date.now()}`)

  return new Promise((resolve) => {
    execFile('git', ['clone', '--depth', '1', url, tmpDir], { timeout: 120000 }, (err) => {
      if (err) {
        resolve({ success: false, error: `克隆失败: ${err.message}` })
        return
      }
      resolve({ success: true, localPath: tmpDir })
    })
  })
}

/**
 * 删除临时目录
 */
export function removeTempDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true })
  }
}
