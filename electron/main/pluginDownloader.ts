/**
 * 社区插件下载器
 * 从 GitHub brainPlus-community-plugins 仓库下载插件文件到本地
 */
import fs from 'fs'
import path from 'path'

const REPO = 'Tianzeyui/brainPlus-community-plugins'
const API_BASE = `https://api.github.com/repos/${REPO}`
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`

interface GitHubContent {
  name: string
  path: string
  type: 'file' | 'dir'
  download_url: string | null
  url: string
}

/**
 * 递归获取 GitHub 目录下所有文件的 download_url
 */
async function listDirContents(dirUrl: string): Promise<Array<{ path: string; download_url: string }>> {
  const res = await fetch(dirUrl, {
    headers: { 'User-Agent': 'brainPlus', 'Accept': 'application/vnd.github.v3+json' },
  })
  if (!res.ok) throw new Error(`GitHub API error (${res.status}): ${res.statusText}`)

  const items: GitHubContent[] = await res.json()
  const files: Array<{ path: string; download_url: string }> = []

  for (const item of items) {
    if (item.type === 'file' && item.download_url) {
      files.push({ path: item.path, download_url: item.download_url })
    } else if (item.type === 'dir') {
      const subFiles = await listDirContents(item.url)
      files.push(...subFiles)
    }
  }

  return files
}

/**
 * 获取某个插件的文件列表（相对路径 → download_url）
 */
export async function listPluginFiles(pluginId: string): Promise<Array<{ path: string; download_url: string }>> {
  const url = `${API_BASE}/contents/${encodeURIComponent(pluginId)}`
  return listDirContents(url)
}

/**
 * 从 GitHub 下载插件 manifest.json
 */
export async function fetchManifestFromGithub(pluginId: string): Promise<any> {
  const url = `${API_BASE}/contents/${encodeURIComponent(pluginId)}/manifest.json`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'brainPlus', 'Accept': 'application/vnd.github.v3+json' },
  })
  if (!res.ok) throw new Error(`获取 manifest 失败 (${res.status})`)
  const data = await res.json()
  // GitHub API 返回的 content 是 base64 编码
  if (data.content && data.encoding === 'base64') {
    return JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'))
  }
  throw new Error('manifest.json 格式异常')
}

/**
 * 下载插件的所有文件到目标目录
 * @param pluginId 插件目录名（如 "diary"）
 * @param destDir 目标目录路径
 * @param onProgress 进度回调
 */
export async function downloadPluginFiles(
  pluginId: string,
  destDir: string,
  onProgress?: (file: string, current: number, total: number) => void,
): Promise<void> {
  const files = await listPluginFiles(pluginId)

  // 确保目标目录存在
  fs.mkdirSync(destDir, { recursive: true })

  let completed = 0
  for (const file of files) {
    // 计算相对路径：去掉 pluginId 前缀
    const relativePath = file.path.replace(`${pluginId}/`, '')
    const targetPath = path.join(destDir, relativePath)

    // 确保子目录存在
    const dir = path.dirname(targetPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    // 下载文件
    const res = await fetch(file.download_url, {
      headers: { 'User-Agent': 'brainPlus' },
    })
    if (!res.ok) throw new Error(`下载 ${relativePath} 失败 (${res.status})`)

    const buffer = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(targetPath, buffer)

    completed++
    onProgress?.(relativePath, completed, files.length)
  }
}
