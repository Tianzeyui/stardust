// ========== 配置存储 — 磁盘文件（userData/config/），IPC + 内存缓存 ==========

// ========== 内存缓存 ==========

interface CloudinaryConfig {
  cloudName: string
  uploadPreset: string
}

let cloudinaryCache: CloudinaryConfig = { cloudName: '', uploadPreset: '' }

const api = () => window.electronAPI?.config

/** 启动时调用，从磁盘加载到内存 */
export async function initConfig() {
  if (!api()) return
  const [cc, models] = await Promise.all([
    api()!.getCloudinary().catch(() => null),
    loadAIModelsFromDiskInternal(),
  ])
  if (cc) cloudinaryCache = cc
}

async function loadAIModelsFromDiskInternal(): Promise<void> {
  if (!api()) return
  const saved = await api()!.getAIModels()
  const defaults = defaultModels()
  aiModelsCache = defaults.map((d) => {
    const existing = Array.isArray(saved) ? saved.find((s: any) => s.id === d.id) : undefined
    return existing ? { ...d, ...existing, availableModels: existing.availableModels || [], defaultBaseUrl: d.defaultBaseUrl } : d
  })
}

export async function loadAIModelsFromDisk(): Promise<void> {
  await loadAIModelsFromDiskInternal()
}

// ========== Cloudinary ==========

export function getCloudinaryConfig(): CloudinaryConfig {
  return { ...cloudinaryCache }
}

export async function saveCloudinaryConfig(config: CloudinaryConfig): Promise<void> {
  cloudinaryCache = config
  await api()?.saveCloudinary(config)
}

export async function clearCloudinaryConfig(): Promise<void> {
  cloudinaryCache = { cloudName: '', uploadPreset: '' }
  await api()?.clearCloudinary()
}

export function isCloudinaryConfigured(): boolean {
  return !!(cloudinaryCache.cloudName && cloudinaryCache.uploadPreset)
}

export async function uploadToCloudinary(file: File): Promise<string> {
  const { cloudName, uploadPreset } = cloudinaryCache
  if (!cloudName || !uploadPreset) throw new Error('请先在设置中配置 Cloudinary')
  const fd = new FormData(); fd.append('file', file); fd.append('upload_preset', uploadPreset)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`上传失败 (${res.status})`)
  const data = await res.json()
  if (!data.secure_url) throw new Error(data.error?.message || '上传失败')
  return data.secure_url
}

// ========== AI 模型 ==========

export interface AIModelConfig {
  id: string; name: string; displayName: string; defaultBaseUrl: string
  apiKey: string; baseUrl: string; enabled: boolean
  availableModels: Array<{ id: string; contextWindow?: number; capabilities?: string[] }>
  selectedModel: string; modelsFetched: boolean
}

function defaultModels(): AIModelConfig[] {
  return [
    { id: 'openai', name: 'OpenAI', displayName: 'OpenAI', defaultBaseUrl: '', apiKey: '', baseUrl: '', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'anthropic', name: 'Claude', displayName: 'Claude', defaultBaseUrl: 'https://api.anthropic.com', apiKey: '', baseUrl: 'https://api.anthropic.com', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'deepseek', name: 'DeepSeek', displayName: '深度求索', defaultBaseUrl: 'https://api.deepseek.com', apiKey: '', baseUrl: 'https://api.deepseek.com', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'qwen', name: '通义千问', displayName: '通义千问', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'gemini', name: 'Gemini', displayName: 'Gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com', apiKey: '', baseUrl: 'https://generativelanguage.googleapis.com', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'azure', name: 'Azure', displayName: 'Azure OpenAI', defaultBaseUrl: '', apiKey: '', baseUrl: '', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'openrouter', name: 'OpenRouter', displayName: 'OpenRouter', defaultBaseUrl: 'https://openrouter.ai/api/v1', apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'ollama', name: 'Ollama', displayName: 'Ollama', defaultBaseUrl: 'http://localhost:11434', apiKey: '', baseUrl: 'http://localhost:11434', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'lmstudio', name: 'LM Studio', displayName: 'LM Studio', defaultBaseUrl: 'http://localhost:1234', apiKey: '', baseUrl: 'http://localhost:1234', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'groq', name: 'Groq', displayName: 'Groq', defaultBaseUrl: 'https://api.groq.com/openai/v1', apiKey: '', baseUrl: 'https://api.groq.com/openai/v1', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'together', name: 'Together AI', displayName: 'Together AI', defaultBaseUrl: 'https://api.together.xyz/v1', apiKey: '', baseUrl: 'https://api.together.xyz/v1', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'perplexity', name: 'Perplexity', displayName: 'Perplexity', defaultBaseUrl: 'https://api.perplexity.ai', apiKey: '', baseUrl: 'https://api.perplexity.ai', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'mistral', name: 'Mistral', displayName: 'Mistral', defaultBaseUrl: 'https://api.mistral.ai/v1', apiKey: '', baseUrl: 'https://api.mistral.ai/v1', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'fireworks', name: 'Fireworks AI', displayName: 'Fireworks AI', defaultBaseUrl: 'https://api.fireworks.ai/inference/v1', apiKey: '', baseUrl: 'https://api.fireworks.ai/inference/v1', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
  ]
}

let aiModelsCache: AIModelConfig[] | null = null

function loadAIModels(): AIModelConfig[] {
  const defaults = defaultModels()
  if (!api()) return defaults
  // 同步加载回退（首次渲染时可能还没从 IPC 加载完）
  return defaults
}

export function getAIModels(): AIModelConfig[] {
  if (aiModelsCache) return aiModelsCache
  return loadAIModels()
}

export async function saveAIModels(models: AIModelConfig[]): Promise<void> {
  aiModelsCache = models
  await api()?.saveAIModels(models)
}

export function getEnabledModel(): AIModelConfig | null {
  return getAIModels().find((m) => m.enabled && m.apiKey) || null
}

// ========== MCP 服务器（沿用 localStorage，Electron 主进程有独立存储）==========

export interface MCPServerConfig {
  id: string; name: string; url: string
  type: 'sse' | 'stdio' | 'streamableHttp'
  command: string; args: string[]; enabled: boolean
}

export function getMCPServers(): MCPServerConfig[] {
  try {
    const raw = localStorage.getItem('brainplus_mcp_servers')
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

export function saveMCPServers(servers: MCPServerConfig[]): void {
  localStorage.setItem('brainplus_mcp_servers', JSON.stringify(servers))
}

// ========== 渐进式披露阈值 ==========

const DISCLOSURE_THRESHOLD_KEY = 'brainplus_disclosure_threshold'
const DEFAULT_THRESHOLD = 8

export function getDisclosureThreshold(): number {
  try {
    const v = localStorage.getItem(DISCLOSURE_THRESHOLD_KEY)
    if (v) { const n = parseInt(v); if (n >= 1 && n <= 50) return n }
  } catch {}
  return DEFAULT_THRESHOLD
}

export function saveDisclosureThreshold(threshold: number): void {
  const n = Math.max(1, Math.min(50, Math.round(threshold)))
  localStorage.setItem(DISCLOSURE_THRESHOLD_KEY, String(n))
}
