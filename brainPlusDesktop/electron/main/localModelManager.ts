/**
 * 本地模型管理 — 下载/删除/查询 GGUF 模型
 * 模型存储在 userData/models/
 */
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import https from 'https'
import { EventEmitter } from 'events'

// ====== 可用模型列表 ======

export interface ModelInfo {
  id: string
  name: string
  size: string   // 人类可读
  sizeBytes: number
  url: string    // 下载地址
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: 'qwen2.5-1.5b',
    name: 'Qwen2.5 1.5B',
    size: '~1.0 GB',
    sizeBytes: 1080000000,
    url: 'https://modelscope.cn/models/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/master/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'qwen2.5-3b',
    name: 'Qwen2.5 3B',
    size: '~3.3 GB',
    sizeBytes: 3500000000,
    url: 'https://modelscope.cn/models/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/master/qwen2.5-3b-instruct-q4_k_m.gguf',
  },
  {
    id: 'smollm2-1.7b',
    name: 'SmolLM2 1.7B',
    size: '~1.1 GB',
    sizeBytes: 1150000000,
    url: 'https://hf-mirror.com/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
  },
]

// ====== 全局状态 ======

const emitter = new EventEmitter()
emitter.setMaxListeners(20)

const modelDir = path.join(app.getPath('userData'), 'models')

/** 当前下载状态 */
let downloading: string | null = null // model id

// ====== 启用状态持久化 ======

const configDir = path.join(app.getPath('userData'), 'config')
const enabledModelsFile = path.join(configDir, 'local-models.json')

function getEnabledModels(): string[] {
  try {
    if (!fs.existsSync(enabledModelsFile)) return []
    return JSON.parse(fs.readFileSync(enabledModelsFile, 'utf-8')).enabledModels || []
  } catch { return [] }
}

function saveEnabledModels(ids: string[]): void {
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(enabledModelsFile, JSON.stringify({ enabledModels: ids }, null, 2))
}

export function isModelEnabled(id: string): boolean {
  return getEnabledModels().includes(id)
}

export function setModelEnabled(id: string, enabled: boolean): void {
  const current = new Set(getEnabledModels())
  if (enabled) current.add(id)
  else current.delete(id)
  saveEnabledModels([...current])
}

// ====== 路径工具 ======

export function getModelDir(): string {
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true })
  return modelDir
}

function modelPath(id: string): string {
  return path.join(getModelDir(), `${id}.gguf`)
}

// ====== 查询 ======

export function getModelStatus(): Array<ModelInfo & { installed: boolean; enabled: boolean; progress?: number }> {
  const enabled = new Set(getEnabledModels())
  return AVAILABLE_MODELS.map(m => ({
    ...m,
    installed: fs.existsSync(modelPath(m.id)),
    enabled: enabled.has(m.id),
    progress: downloading === m.id ? getDownloadProgress(m) : undefined,
  }))
}

export function isModelInstalled(id: string): boolean {
  return fs.existsSync(modelPath(id))
}

// ====== 下载 ======

/** 下载进度追踪 */
const downloadProgress = new Map<string, { total: number; loaded: number }>()

function getDownloadProgress(m: ModelInfo): number | undefined {
  const dp = downloadProgress.get(m.id)
  if (!dp || dp.total === 0) return undefined
  return Math.round((dp.loaded / dp.total) * 100)
}

function makeRequest(url: string, maxRedirects = 5): Promise<https.IncomingMessage> {
  return new Promise((resolve, reject) => {
    function doRequest(u: string, remaining: number) {
      https.get(u, { timeout: 600000, headers: { 'User-Agent': 'BrainPlus/1.0' } }, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && remaining > 0) {
          const next = new URL(res.headers.location, u).href
          res.resume() // 销毁当前响应
          doRequest(next, remaining - 1)
        } else {
          resolve(res)
        }
      }).on('error', reject)
        .on('timeout', function(this: any) { this.destroy(); reject(new Error('连接超时')) })
    }
    doRequest(url, maxRedirects)
  })
}

export async function downloadModel(id: string): Promise<{ success: boolean; error?: string }> {
  const model = AVAILABLE_MODELS.find(m => m.id === id)
  if (!model) return { success: false, error: '未知模型' }

  const dest = modelPath(id)
  if (fs.existsSync(dest)) return { success: true }

  downloading = id
  downloadProgress.set(id, { total: 0, loaded: 0 })

  try {
    console.log('[model:download] URL:', model.url)
    const res = await makeRequest(model.url)
    console.log('[model:download] 最终状态:', res.statusCode, 'content-length:', res.headers['content-length'])

    if (res.statusCode !== 200) {
      downloading = null
      downloadProgress.delete(id)
      emitter.emit('download:done', id, false, `HTTP ${res.statusCode}`)
      return { success: false, error: `HTTP ${res.statusCode}` }
    }

    const total = parseInt(res.headers['content-length'] || '0', 10)
    if (total > 0) downloadProgress.set(id, { total, loaded: 0 })

    const file = fs.createWriteStream(dest)
    let loaded = 0

    return new Promise((resolve) => {
      res.on('data', (chunk: Buffer) => {
        loaded += chunk.length
        downloadProgress.set(id, { total: total || loaded, loaded })
        emitter.emit('download:progress', id, loaded, total || loaded)
      })

      res.pipe(file)
      file.on('finish', () => {
        console.log('[model:download] 文件写入完成，大小:', fs.statSync(dest).size)
        downloading = null
        downloadProgress.delete(id)
        emitter.emit('download:done', id, true, '')
        resolve({ success: true })
      })
      file.on('error', (e) => {
        console.error('[model:download] 写入错误:', e.message)
        downloading = null
        downloadProgress.delete(id)
        try { fs.unlinkSync(dest) } catch {}
        emitter.emit('download:done', id, false, e.message)
        resolve({ success: false, error: e.message })
      })
    })
  } catch (e: any) {
    downloading = null
    downloadProgress.delete(id)
    try { if (fs.existsSync(dest)) fs.unlinkSync(dest) } catch {}
    emitter.emit('download:done', id, false, e.message)
    return { success: false, error: e.message }
  }
}

export function cancelDownload(): void {
  // 简单的取消：标记为完成（实际上下次启动会检查文件完整性）
  downloading = null
}

// ====== 删除 ======

export function deleteModel(id: string): boolean {
  const dest = modelPath(id)
  if (!fs.existsSync(dest)) return false
  try { fs.unlinkSync(dest); return true } catch { return false }
}

// ====== 事件监听 ======

export function onModelEvent(
  event: 'download:progress' | 'download:done',
  cb: (...args: any[]) => void,
): () => void {
  emitter.on(event, cb)
  return () => emitter.off(event, cb)
}
