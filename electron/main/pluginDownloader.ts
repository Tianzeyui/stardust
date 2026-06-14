/**
 * 社区插件下载器
 * 从 GitHub brainPlus-community-plugins 仓库下载插件文件到本地
 */
import fs from 'fs'
import path from 'path'
import https from 'https'

const REPO = 'Tianzeyui/brainPlus-community-plugins'
const API_HOST = 'api.github.com'
const RAW_HOST = 'raw.githubusercontent.com'
const UA = 'BrainPlus/1.0'

interface GitHubContent {
  name: string
  path: string
  type: 'file' | 'dir'
  download_url: string | null
  url: string
}

/**
 * 发起 HTTPS GET 请求，返回 JSON
 */
function httpsGetJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': UA,
        'Accept': 'application/vnd.github.v3+json',
      },
    }, (res) => {
      // 处理重定向
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        res.resume()
        httpsGetJSON(res.headers.location).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`))
        return
      }
      let data = ''
      res.setEncoding('utf-8')
      res.on('data', (chunk: string) => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error('JSON 解析失败')) }
      })
    }).on('error', reject)
      .on('timeout', function(this: any) { this.destroy(); reject(new Error('请求超时')) })
  })
}

/**
 * 下载文件内容，返回 Buffer
 */
function httpsGetBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, {
      timeout: 30000,
      headers: { 'User-Agent': UA },
    }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        res.resume()
        httpsGetBuffer(res.headers.location).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      res.on('end', () => { resolve(Buffer.concat(chunks)) })
    }).on('error', reject)
      .on('timeout', function(this: any) { this.destroy(); reject(new Error('下载超时')) })
  })
}

/**
 * 递归获取 GitHub 目录下所有文件的 download_url
 */
async function listDirContents(apiUrl: string): Promise<Array<{ path: string; download_url: string }>> {
  const items: GitHubContent[] = await httpsGetJSON(apiUrl)
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
 * 获取某个插件的文件列表
 */
export async function listPluginFiles(pluginId: string): Promise<Array<{ path: string; download_url: string }>> {
  const url = `https://${API_HOST}/repos/${REPO}/contents/${encodeURIComponent(pluginId)}`
  return listDirContents(url)
}

/**
 * 从 GitHub 下载插件 manifest.json
 */
export async function fetchManifestFromGithub(pluginId: string): Promise<any> {
  const url = `https://${API_HOST}/repos/${REPO}/contents/${encodeURIComponent(pluginId)}/manifest.json`
  const data = await httpsGetJSON(url)
  // GitHub API 返回的 content 是 base64 编码
  if (data.content && data.encoding === 'base64') {
    return JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'))
  }
  throw new Error('manifest.json 格式异常')
}

/**
 * 下载插件的所有文件到目标目录
 */
export async function downloadPluginFiles(
  pluginId: string,
  destDir: string,
  onProgress?: (file: string, current: number, total: number) => void,
): Promise<void> {
  const files = await listPluginFiles(pluginId)

  if (files.length === 0) throw new Error('插件目录为空')

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
    const buffer = await httpsGetBuffer(file.download_url)
    fs.writeFileSync(targetPath, buffer)

    completed++
    onProgress?.(relativePath, completed, files.length)
  }
}
