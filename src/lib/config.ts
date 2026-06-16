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
  if (Array.isArray(saved) && saved.length > 0) {
    aiModelsCache = saved
  }
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

/** 可用的 Provider 模板（添加连接时选择） */
export const PROVIDER_TEMPLATES: Array<{ id: string; name: string; displayName: string; defaultBaseUrl: string }> = [
  { id: 'openai', name: 'OpenAI', displayName: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic', name: 'Claude', displayName: 'Claude', defaultBaseUrl: 'https://api.anthropic.com' },
  { id: 'deepseek', name: 'DeepSeek', displayName: '深度求索', defaultBaseUrl: 'https://api.deepseek.com' },
  { id: 'qwen', name: '通义千问', displayName: '通义千问', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'gemini', name: 'Gemini', displayName: 'Gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com' },
  { id: 'azure', name: 'Azure', displayName: 'Azure OpenAI', defaultBaseUrl: '' },
  { id: 'openrouter', name: 'OpenRouter', displayName: 'OpenRouter', defaultBaseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'ollama', name: 'Ollama', displayName: 'Ollama', defaultBaseUrl: 'http://localhost:11434' },
  { id: 'lmstudio', name: 'LM Studio', displayName: 'LM Studio', defaultBaseUrl: 'http://localhost:1234' },
  { id: 'groq', name: 'Groq', displayName: 'Groq', defaultBaseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'together', name: 'Together AI', displayName: 'Together AI', defaultBaseUrl: 'https://api.together.xyz/v1' },
  { id: 'perplexity', name: 'Perplexity', displayName: 'Perplexity', defaultBaseUrl: 'https://api.perplexity.ai' },
  { id: 'mistral', name: 'Mistral', displayName: 'Mistral', defaultBaseUrl: 'https://api.mistral.ai/v1' },
  { id: 'fireworks', name: 'Fireworks AI', displayName: 'Fireworks AI', defaultBaseUrl: 'https://api.fireworks.ai/inference/v1' },
]

/** 生成唯一模型 ID */
export function generateModelId(): string {
  return 'model_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

let aiModelsCache: AIModelConfig[] | null = null

function loadAIModels(): AIModelConfig[] {
  return aiModelsCache || []
}

export function getAIModels(): AIModelConfig[] {
  return loadAIModels()
}

export async function saveAIModels(models: AIModelConfig[]): Promise<void> {
  aiModelsCache = models
  await api()?.saveAIModels(models)
}

export async function deleteAIModel(id: string): Promise<void> {
  const models = (aiModelsCache || []).filter(m => m.id !== id)
  await saveAIModels(models)
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

// ========== Agent 最大任务步数 ==========

const AGENT_MAX_STEPS_KEY = 'brainplus_agent_max_steps'
const DEFAULT_MAX_STEPS = 25

export function getAgentMaxSteps(): number {
  try {
    const v = localStorage.getItem(AGENT_MAX_STEPS_KEY)
    if (v) { const n = parseInt(v); if (n >= 5 && n <= 100) return n }
  } catch {}
  return DEFAULT_MAX_STEPS
}

export function saveAgentMaxSteps(steps: number): void {
  const n = Math.max(5, Math.min(100, Math.round(steps)))
  localStorage.setItem(AGENT_MAX_STEPS_KEY, String(n))
}

// ========== 记忆功能开关 ==========

const MEMORY_ENABLED_KEY = 'brainplus_memory_enabled'

export function getMemoryEnabled(): boolean {
  try {
    const v = localStorage.getItem(MEMORY_ENABLED_KEY)
    if (v !== null) return v === 'true'
  } catch {}
  return false  // 默认关闭
}

export function saveMemoryEnabled(enabled: boolean): void {
  localStorage.setItem(MEMORY_ENABLED_KEY, String(enabled))
}

// ========== A2A Server ==========

const A2A_ENABLED_KEY = 'brainplus_a2a_enabled'
const A2A_PORT_KEY = 'brainplus_a2a_port'

export function getA2AEnabled(): boolean {
  return localStorage.getItem(A2A_ENABLED_KEY) !== 'false'  // 默认开启
}

export function saveA2AEnabled(enabled: boolean): void {
  localStorage.setItem(A2A_ENABLED_KEY, String(enabled))
}

export function getA2APort(): number {
  try {
    const v = localStorage.getItem(A2A_PORT_KEY)
    if (v) { const n = parseInt(v); if (n >= 1024 && n <= 65535) return n }
  } catch {}
  return 9090
}

export function saveA2APort(port: number): void {
  localStorage.setItem(A2A_PORT_KEY, String(port))
}

const A2A_TOKEN_KEY = 'brainplus_a2a_token'

export function getA2AToken(): string {
  return localStorage.getItem(A2A_TOKEN_KEY) || ''
}

export function saveA2AToken(token: string): void {
  localStorage.setItem(A2A_TOKEN_KEY, token)
}

// ========== 上下文压缩阈值 ==========

const COMPRESS_THRESHOLD_KEY = 'brainplus_compress_threshold'

export function getCompressThreshold(): number {
  try {
    const v = localStorage.getItem(COMPRESS_THRESHOLD_KEY)
    if (v) { const n = parseInt(v); if (n >= 30 && n <= 95) return n }
  } catch {}
  return 80  // 默认 80%
}

export function saveCompressThreshold(pct: number): void {
  localStorage.setItem(COMPRESS_THRESHOLD_KEY, String(Math.max(30, Math.min(95, pct))))
}

const TOKEN_LIMIT_KEY = 'brainplus_token_limit'

export function getTokenLimit(): number {
  try {
    const v = localStorage.getItem(TOKEN_LIMIT_KEY)
    if (v) { const n = parseInt(v); if (n >= 1024) return n }
  } catch {}
  return 0  // 0 = 自动（用模型默认）
}

export function saveTokenLimit(limit: number): void {
  localStorage.setItem(TOKEN_LIMIT_KEY, String(limit))
}

// ========== 智能路由层级配置 ==========

const TIER_MAP_KEY = 'brainplus_tier_map'

export type ModelTier = 'fast' | 'balanced' | 'powerful'

/** 默认层级映射：根据模型名关键词推断 */
export function getDefaultTier(modelId: string): ModelTier {
  const fast = ['haiku', 'gpt-4o-mini', 'gemini-flash', 'deepseek-chat', 'flash', 'mini', 'lite']
  const powerful = ['opus', 'gpt-4o', 'gpt-4-turbo', 'gpt-5', 'gemini-pro', 'deepseek-v3', 'pro', 'ultra', 'preview']
  for (const kw of fast) if (modelId.toLowerCase().includes(kw)) return 'fast'
  for (const kw of powerful) if (modelId.toLowerCase().includes(kw)) return 'powerful'
  return 'balanced'
}

/** 获取用户自定义的层级映射 */
export function getTierMap(): Record<string, ModelTier> {
  try {
    const v = localStorage.getItem(TIER_MAP_KEY)
    if (v) return JSON.parse(v)
  } catch {}
  return {}
}
export function saveTierMap(map: Record<string, ModelTier>): void {
  localStorage.setItem(TIER_MAP_KEY, JSON.stringify(map))
}

/** 获取某个模型的层级（用户设定优先，否则默认推断） */
export function getModelTier(modelId: string): ModelTier {
  const map = getTierMap()
  return map[modelId] || getDefaultTier(modelId)
}
export function setModelTier(modelId: string, tier: ModelTier): void {
  const map = getTierMap()
  map[modelId] = tier
  saveTierMap(map)
}

// ========== 系统提示词 ==========

const SYSTEM_PROMPT_KEY = 'brainplus_system_prompt'

export const DEFAULT_SYSTEM_PROMPT =
  '你是一个编程 Agent，用工具直接操作代码。\n\n' +
  '模式识别：\n' +
  '- 用户说"写/实现/创建/改/修复/加" → 编码模式：直接动手，只输出代码或操作结果\n' +
  '- 用户说"为什么/解释/区别/怎么/是什么" → 对话模式：可以解释\n' +
  '- 其他情况 → 默认编码模式，判断用户意图，能动手就不说话\n\n' +
  '工具链：workspace_read_file → workspace_grep → workspace_edit_file → run_terminal\n' +
  '改完跑检查（tsc/pyright/go vet），改到干净。结果一句话报告。'

export function getSystemPrompt(): string {
  try { const v = localStorage.getItem(SYSTEM_PROMPT_KEY); if (v != null) return v } catch {}
  return DEFAULT_SYSTEM_PROMPT
}
export function saveSystemPrompt(v: string): void { localStorage.setItem(SYSTEM_PROMPT_KEY, v) }

// ========== 终端开关 ==========

const TERMINAL_KEY = 'brainplus_terminal_enabled'

export function getTerminalEnabled(): boolean {
  try { const v = localStorage.getItem(TERMINAL_KEY); if (v !== null) return v === 'true' } catch {}
  return false
}
export function saveTerminalEnabled(v: boolean): void { localStorage.setItem(TERMINAL_KEY, String(v)) }

// ========== 沙箱开关（JS / Python 独立） ==========

const SANDBOX_JS_KEY = 'brainplus_sandbox_js'
const SANDBOX_PYTHON_KEY = 'brainplus_sandbox_python'

export function getJSSandboxEnabled(): boolean {
  try { const v = localStorage.getItem(SANDBOX_JS_KEY); if (v !== null) return v === 'true' } catch {}
  return true
}
export function saveJSSandboxEnabled(v: boolean): void { localStorage.setItem(SANDBOX_JS_KEY, String(v)) }

export function getPythonSandboxEnabled(): boolean {
  try { const v = localStorage.getItem(SANDBOX_PYTHON_KEY); if (v !== null) return v === 'true' } catch {}
  return true
}
export function savePythonSandboxEnabled(v: boolean): void { localStorage.setItem(SANDBOX_PYTHON_KEY, String(v)) }

/** 沙箱权限：至少有一个引擎可用时才授予 */
export function isAnySandboxEnabled(): boolean {
  return getJSSandboxEnabled() || getPythonSandboxEnabled()
}

// ========== DuckDuckGo 搜索开关 ==========

const DUCKDUCKGO_ENABLED_KEY = 'brainplus_duckduckgo_enabled'

export function getDuckDuckGoEnabled(): boolean {
  try {
    const v = localStorage.getItem(DUCKDUCKGO_ENABLED_KEY)
    if (v !== null) return v === 'true'
  } catch {}
  return true  // 默认开启
}

export function saveDuckDuckGoEnabled(enabled: boolean): void {
  localStorage.setItem(DUCKDUCKGO_ENABLED_KEY, String(enabled))
}

const DDG_RESULT_COUNT_KEY = 'brainplus_ddg_result_count'
const DDG_TIMEOUT_KEY = 'brainplus_ddg_timeout'

export function getDDGResultCount(): number {
  try {
    const v = localStorage.getItem(DDG_RESULT_COUNT_KEY)
    if (v) { const n = parseInt(v); if (n >= 1 && n <= 20) return n }
  } catch {}
  return 5
}

export function saveDDGResultCount(count: number): void {
  localStorage.setItem(DDG_RESULT_COUNT_KEY, String(Math.max(1, Math.min(20, count))))
}

export function getDDGTimeout(): number {
  try {
    const v = localStorage.getItem(DDG_TIMEOUT_KEY)
    if (v) { const n = parseInt(v); if (n >= 3 && n <= 60) return n }
  } catch {}
  return 10
}

export function saveDDGTimeout(sec: number): void {
  localStorage.setItem(DDG_TIMEOUT_KEY, String(Math.max(3, Math.min(60, sec))))
}

// ========== Bing 搜索开关 ==========

const BING_ENABLED_KEY = 'brainplus_bing_enabled'
const BING_RESULT_COUNT_KEY = 'brainplus_bing_result_count'
const BING_TIMEOUT_KEY = 'brainplus_bing_timeout'

export function getBingEnabled(): boolean {
  try { const v = localStorage.getItem(BING_ENABLED_KEY); if (v !== null) return v === 'true' } catch {}
  return true
}
export function saveBingEnabled(v: boolean): void { localStorage.setItem(BING_ENABLED_KEY, String(v)) }

export function getBingResultCount(): number {
  try { const v = localStorage.getItem(BING_RESULT_COUNT_KEY); if (v) { const n = parseInt(v); if (n >= 1 && n <= 20) return n } } catch {}
  return 5
}
export function saveBingResultCount(count: number): void {
  localStorage.setItem(BING_RESULT_COUNT_KEY, String(Math.max(1, Math.min(20, count))))
}

export function getBingTimeout(): number {
  try { const v = localStorage.getItem(BING_TIMEOUT_KEY); if (v) { const n = parseInt(v); if (n >= 3 && n <= 60) return n } } catch {}
  return 10
}
export function saveBingTimeout(sec: number): void {
  localStorage.setItem(BING_TIMEOUT_KEY, String(Math.max(3, Math.min(60, sec))))
}

// ========== 图数据库开关 ==========

const GRAPH_ENABLED_KEY = 'brainplus_graph_enabled'

export function getGraphEnabled(): boolean {
  try { const v = localStorage.getItem(GRAPH_ENABLED_KEY); if (v !== null) return v === 'true' } catch {}
  return false  // 默认关闭
}

export function saveGraphEnabled(v: boolean): void { localStorage.setItem(GRAPH_ENABLED_KEY, String(v)) }
