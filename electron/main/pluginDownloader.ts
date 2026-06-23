/**
 * 社区插件下载器
 * 通过 jsDelivr CDN 下载插件文件（国内可访问，无 API 限流）
 */
import fs from 'fs'
import path from 'path'
import https from 'https'

const REPO = 'Tianzeyui/stardust-community-plugins'
const CDN_BASE = `https://cdn.jsdelivr.net/gh/${REPO}@main`
const UA = 'Stardust/1.0'

/**
 * 通过 HTTPS 下载文件，返回 Buffer
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
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || '下载失败'}`))
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
 * 下载插件的所有文件到目标目录
 * @param pluginId 插件目录名（如 "diary"）
 * @param fileList 文件列表（如 ["manifest.json", "index.tsx", "package.json"]）
 * @param destDir 目标目录路径
 * @param onProgress 进度回调
 */
export async function downloadPluginFiles(
  pluginId: string,
  fileList: string[],
  destDir: string,
  onProgress?: (file: string, current: number, total: number) => void,
): Promise<void> {
  // 确保目标目录存在
  fs.mkdirSync(destDir, { recursive: true })

  let completed = 0
  const total = fileList.length

  for (const file of fileList) {
    const url = `${CDN_BASE}/${encodeURIComponent(pluginId)}/${file}`
    const targetPath = path.join(destDir, file)

    // 确保子目录存在
    const dir = path.dirname(targetPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    // 下载文件
    const buffer = await httpsGetBuffer(url)
    fs.writeFileSync(targetPath, buffer)

    completed++
    onProgress?.(file, completed, total)
  }
}
