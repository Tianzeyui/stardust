// ========== Cloudinary ==========

const STORAGE_KEY_CLOUD_NAME = 'brainplus_cloudinary_cloud_name'
const STORAGE_KEY_UPLOAD_PRESET = 'brainplus_cloudinary_upload_preset'

export interface CloudinaryConfig {
  cloudName: string
  uploadPreset: string
}

export function getCloudinaryConfig(): CloudinaryConfig {
  return {
    cloudName: localStorage.getItem(STORAGE_KEY_CLOUD_NAME) || '',
    uploadPreset: localStorage.getItem(STORAGE_KEY_UPLOAD_PRESET) || '',
  }
}

export function saveCloudinaryConfig(config: CloudinaryConfig): void {
  localStorage.setItem(STORAGE_KEY_CLOUD_NAME, config.cloudName)
  localStorage.setItem(STORAGE_KEY_UPLOAD_PRESET, config.uploadPreset)
}

export function clearCloudinaryConfig(): void {
  localStorage.removeItem(STORAGE_KEY_CLOUD_NAME)
  localStorage.removeItem(STORAGE_KEY_UPLOAD_PRESET)
}

export function isCloudinaryConfigured(): boolean {
  const c = getCloudinaryConfig()
  return !!(c.cloudName && c.uploadPreset)
}

export async function uploadToCloudinary(file: File): Promise<string> {
  const { cloudName, uploadPreset } = getCloudinaryConfig()
  if (!cloudName || !uploadPreset) throw new Error('请先在设置中配置 Cloudinary')
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', uploadPreset)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error(`上传失败 (${res.status})`)
  const data = await res.json()
  if (!data.secure_url) throw new Error(data.error?.message || '上传失败')
  return data.secure_url as string
}

// ========== AI 模型配置（localStorage）==========

const STORAGE_KEY_AI_MODELS = 'brainplus_ai_models'

export interface AIModelConfig {
  id: string
  name: string
  displayName: string
  defaultBaseUrl: string
  apiKey: string
  baseUrl: string
  enabled: boolean
  availableModels: Array<{ id: string; contextWindow?: number; capabilities?: string[] }>
  selectedModel: string
  modelsFetched: boolean
}

/** 默认模型提供商列表 */
export function getDefaultModelProviders(): AIModelConfig[] {
  return [
    { id: 'openai', name: 'OpenAI', displayName: 'OpenAI', defaultBaseUrl: '', apiKey: '', baseUrl: '', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'anthropic', name: 'Claude', displayName: 'Claude', defaultBaseUrl: 'https://api.anthropic.com', apiKey: '', baseUrl: 'https://api.anthropic.com', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'deepseek', name: 'DeepSeek', displayName: '深度求索', defaultBaseUrl: 'https://api.deepseek.com', apiKey: '', baseUrl: 'https://api.deepseek.com', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'qwen', name: '通义千问', displayName: '通义千问', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'gemini', name: 'Gemini', displayName: 'Gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com', apiKey: '', baseUrl: 'https://generativelanguage.googleapis.com', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
    { id: 'azure', name: 'Azure', displayName: 'Azure OpenAI', defaultBaseUrl: 'https://YOUR_RESOURCE.openai.azure.com', apiKey: '', baseUrl: 'https://YOUR_RESOURCE.openai.azure.com', enabled: false, availableModels: [], selectedModel: '', modelsFetched: false },
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

export function getAIModels(): AIModelConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AI_MODELS)
    if (raw) {
      const saved = JSON.parse(raw) as AIModelConfig[]
      // 合并默认列表，确保新增的模型也会出现
      const defaults = getDefaultModelProviders()
      return defaults.map((d) => {
        const existing = saved.find((s) => s.id === d.id)
        return existing ? { ...d, ...existing, availableModels: existing.availableModels || [], defaultBaseUrl: d.defaultBaseUrl } : d
      })
    }
  } catch { /* ignore */ }
  return getDefaultModelProviders()
}

export function saveAIModels(models: AIModelConfig[]): void {
  localStorage.setItem(STORAGE_KEY_AI_MODELS, JSON.stringify(models))
}

export function getEnabledModel(): AIModelConfig | null {
  return getAIModels().find((m) => m.enabled && m.apiKey) || null
}

// ========== MCP 服务器配置（localStorage）==========

const STORAGE_KEY_MCP_SERVERS = 'brainplus_mcp_servers'

export interface MCPServerConfig {
  id: string
  name: string
  url: string
  type: 'sse' | 'stdio' | 'streamableHttp'
  command: string
  args: string[]
  enabled: boolean
}

export function getMCPServers(): MCPServerConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MCP_SERVERS)
    if (raw) return JSON.parse(raw) as MCPServerConfig[]
  } catch { /* ignore */ }
  return []
}

export function saveMCPServers(servers: MCPServerConfig[]): void {
  localStorage.setItem(STORAGE_KEY_MCP_SERVERS, JSON.stringify(servers))
}
