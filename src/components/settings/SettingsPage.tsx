import { useState, useEffect, useCallback, useRef } from 'react'
import { Settings, Cpu, Server, Trash2, Plus, RefreshCw, Check, Wrench, FolderOpen, MessageSquare, Play, ChevronDown, Loader2, X, ArrowLeft, Info, Bot, Globe, Zap, Search, Code, Pencil } from 'lucide-react'
import { APP_VERSION } from '@/lib/version'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig,
} from '@/lib/supabase'
import {
  getCloudinaryConfig, saveCloudinaryConfig, clearCloudinaryConfig,
  getAIModels, saveAIModels, deleteAIModel, generateModelId, PROVIDER_TEMPLATES,
  type AIModelConfig, type MCPServerConfig,
  getDisclosureThreshold, saveDisclosureThreshold,
  getAgentMaxSteps, saveAgentMaxSteps,
  getMemoryEnabled, saveMemoryEnabled,
  getCompressThreshold, saveCompressThreshold, getTokenLimit, saveTokenLimit,
  getA2AEnabled, saveA2AEnabled, getA2APort, saveA2APort, getA2AToken, saveA2AToken,
  getJSSandboxEnabled, saveJSSandboxEnabled,
  getPythonSandboxEnabled, savePythonSandboxEnabled,
  getDuckDuckGoEnabled, saveDuckDuckGoEnabled,
  getDDGResultCount, saveDDGResultCount,
  getDDGTimeout, saveDDGTimeout,
  getBingEnabled, saveBingEnabled,
  getBingResultCount, saveBingResultCount,
  getBingTimeout, saveBingTimeout,
} from '@/lib/config'
import { listTools, listResources, listPrompts, callTool, readResource, getPrompt, connect, disconnect, addServer as addMcpServer, updateServer as updateMcpServer, removeServer as removeMcpServer } from '@/lib/mcpClient'
import type { MCPTool, MCPResource, MCPPrompt } from '@/types/electron'
import { MemoryPanel } from './MemoryPanel'
import { MemoryManager } from '@/lib/memory/manager'
import { createSupabaseMemoryStore } from '@/lib/memory/store-supabase'
import { createLocalMemoryStore } from '@/lib/memory/store-local'
import { useAuth } from '@/contexts/AuthContext'

function NumberField({ label, value, setValue, min, max, unit }: {
  label: string; value: number; setValue: (n: number) => void; min: number; max: number; unit: string
}) {
  return (
    <div>
      <Label className="text-[11px]">{label}</Label>
      <div className="flex items-center gap-1 mt-0.5">
        <Button variant="outline" size="icon" className="h-7 w-7"
          onClick={() => setValue(Math.max(min, value - 1))} disabled={value <= min}>−</Button>
        <Input type="number" min={min} max={max} value={value}
          onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= min && v <= max) setValue(v) }}
          className="h-8 w-14 text-center text-sm" />
        <Button variant="outline" size="icon" className="h-7 w-7"
          onClick={() => setValue(Math.min(max, value + 1))} disabled={value >= max}>+</Button>
        <span className="text-[10px] text-muted-foreground ml-1">{unit}</span>
      </div>
    </div>
  )
}

type Tab = 'general' | 'ai' | 'mcp' | 'capabilities' | 'agent' | 'a2a' | 'about'

export function SettingsPage({ onClose, initialTab }: { onClose?: () => void; initialTab?: Tab }) {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>(initialTab || 'general')
  const [saved, setSaved] = useState(false)

  // 通用
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [cloudName, setCloudName] = useState('')
  const [uploadPreset, setUploadPreset] = useState('')

  // AI 模型
  const [models, setModels] = useState<AIModelConfig[]>([])
  const [expandedModel, setExpandedModel] = useState<string | null>(null)
  const [showAddModel, setShowAddModel] = useState(false)
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [newModel, setNewModel] = useState({ providerId: 'openai', customName: '', apiKey: '', baseUrl: '' })

  // MCP
  const [servers, setServers] = useState<MCPServerConfig[]>([])
  const [expandedSrv, setExpandedSrv] = useState<string | null>(null)
  const [srvDetailTab, setSrvDetailTab] = useState<'tools' | 'resources' | 'prompts'>('tools')
  const [srvTools, setSrvTools] = useState<MCPTool[]>([])
  const [srvResources, setSrvResources] = useState<MCPResource[]>([])
  const [srvPrompts, setSrvPrompts] = useState<MCPPrompt[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [callModal, setCallModal] = useState<{ type: 'tool' | 'resource' | 'prompt'; target: any } | null>(null)
  const [callArgs, setCallArgs] = useState('{}')
  const [callResult, setCallResult] = useState<string | null>(null)
  const [callLoading, setCallLoading] = useState(false)
  const [disclosureThreshold, setDisclosureThreshold] = useState(getDisclosureThreshold)
  const [maxSteps, setMaxSteps] = useState(getAgentMaxSteps)
  const [memoryEnabled, setMemoryEnabled] = useState(getMemoryEnabled)
  const [compressThreshold, setCompressThreshold] = useState(getCompressThreshold)
  const [tokenLimit, setTokenLimit] = useState(getTokenLimit)
  const [a2aEnabled, setA2AEnabled] = useState(getA2AEnabled)
  const [a2aPort, setA2APortState] = useState(getA2APort)
  const [a2aToken, setA2AToken] = useState(getA2AToken)
  const [sandboxJS, setSandboxJS] = useState(getJSSandboxEnabled)
  const [sandboxPython, setSandboxPython] = useState(getPythonSandboxEnabled)
  const [ddgEnabled, setDdgEnabled] = useState(getDuckDuckGoEnabled)
  const [ddgResultCount, setDdgResultCount] = useState(getDDGResultCount)
  const [ddgTimeout, setDdgTimeout] = useState(getDDGTimeout)
  const [bingEnabled, setBingEnabledState] = useState(getBingEnabled)
  const [bingResultCount, setBingResultCount] = useState(getBingResultCount)
  const [bingTimeout, setBingTimeout] = useState(getBingTimeout)
  const [capExpanded, setCapExpanded] = useState<Record<string, boolean>>({ sandbox: true, search: true })

  // 更新日志（优先本地，CDN 备用）
  const [changelog, setChangelog] = useState<Array<{ version: string; date: string; items: string[] }>>([])
  useEffect(() => {
    const CDN_URL = 'https://cdn.jsdelivr.net/gh/Tianzeyui/brainPlus@main/CHANGELOG.md'
    const parseChangelog = (text: string) => {
      const entries: Array<{ version: string; date: string; items: string[] }> = []
      const sections = text.split(/\n## /).slice(1)
      for (const sec of sections) {
        const lines = sec.trim().split('\n')
        const headerMatch = lines[0].match(/^v([\d.]+)\s*(?:\((.+?)\))?/)
        if (!headerMatch) continue
        const items = lines.slice(1).filter(l => l.trim().startsWith('- ')).map(l => l.replace(/^-\s*/, ''))
        entries.push({ version: `v${headerMatch[1]}`, date: headerMatch[2] || '', items })
      }
      return entries
    }
    const fetchChangelog = async () => {
      // 1. 先尝试本地文件（打包时在 public/ 目录）
      try {
        const res = await fetch('/CHANGELOG.md')
        if (res.ok) {
          const text = await res.text()
          setChangelog(parseChangelog(text))
          return
        }
      } catch {}
      // 2. CDN 备用
      try {
        const api = (window as any).electronAPI?.http
        if (!api) return
        const result = await api.fetch(CDN_URL)
        if (!result.success || result.status !== 200) return
        setChangelog(parseChangelog(result.data))
      } catch {}
    }
    fetchChangelog()
  }, [])

  const memoryManagerRef = useRef(new MemoryManager(
    // 短期记忆只读 —— 设置页无法确定当前 convId，仅展示长期记忆
    createLocalMemoryStore('settings'),
    createSupabaseMemoryStore(() => user?.id ?? null),
  ))

  useEffect(() => {
    // 通用
    const sc = getSupabaseConfig()
    if (sc) { setSupabaseUrl(sc.url); setSupabaseKey(sc.anonKey) }
    const cc = getCloudinaryConfig()
    setCloudName(cc.cloudName)
    setUploadPreset(cc.uploadPreset)
    // AI
    setModels(getAIModels())
    // MCP 服务器：从 Electron 主进程加载
    if (window.electronAPI?.mcp) {
      window.electronAPI.mcp.getServers().then(s => setServers(s as MCPServerConfig[])).catch(() => {})
    }
  }, [])

  const flashSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 1500) }

  // ===== 通用保存 =====
  const saveGeneral = async () => {
    if (supabaseUrl.trim() && supabaseKey.trim()) {
      await saveSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim())
    }
    await saveCloudinaryConfig({ cloudName: cloudName.trim(), uploadPreset: uploadPreset.trim() })
    flashSaved()
  }

  const clearAll = async () => {
    await clearSupabaseConfig(); await clearCloudinaryConfig()
    setSupabaseUrl(''); setSupabaseKey(''); setCloudName(''); setUploadPreset('')
    flashSaved()
  }

  // ===== AI 模型 =====
  const updateModel = (id: string, patch: Partial<AIModelConfig>) => {
    setModels((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
      saveAIModels(next).catch(() => {})
      return next
    })
  }

  const toggleModel = (id: string) => {
    setModels((prev) => {
      const model = prev.find((m) => m.id === id)
      if (!model || !model.apiKey) return prev
      const next = prev.map((m) => ({
        ...m,
        enabled: m.id === id ? !model.enabled : false,
      }))
      saveAIModels(next).catch(() => {})
      return next
    })
  }

  const handleDeleteModel = async (id: string) => {
    setModels(prev => prev.filter(m => m.id !== id))
    await deleteAIModel(id)
  }

  const handleAddModel = async () => {
    if (!newModel.apiKey.trim()) return
    const tpl = PROVIDER_TEMPLATES.find(t => t.id === newModel.providerId)
    const providerName = tpl?.name || newModel.providerId || 'Custom'
    const name = newModel.customName.trim() || tpl?.displayName || newModel.providerId || '自定义连接'
    const id = generateModelId()
    const model: AIModelConfig = {
      id,
      name: providerName,
      displayName: name,
      defaultBaseUrl: tpl?.defaultBaseUrl || newModel.baseUrl,
      apiKey: newModel.apiKey.trim(),
      baseUrl: newModel.baseUrl || tpl?.defaultBaseUrl || '',
      enabled: false,
      availableModels: [],
      selectedModel: '',
      modelsFetched: false,
    }
    setModels(prev => [...prev, model])
    await saveAIModels([...models, model])
    setShowAddModel(false)
    setEditingModelId(null)
    setNewModel({ providerId: 'openai', customName: '', apiKey: '', baseUrl: '' })
  }

  const openEditDialog = (model: AIModelConfig) => {
    const tpl = PROVIDER_TEMPLATES.find(t => t.name === model.name || model.id.includes(t.id))
    setNewModel({
      providerId: tpl?.id || 'openai',
      customName: model.displayName !== (tpl?.displayName || '') ? model.displayName : '',
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
    })
    setEditingModelId(model.id)
    setShowAddModel(true)
  }

  const fetchModels = async (modelId: string) => {
    const model = models.find((m) => m.id === modelId)
    if (!model || !model.apiKey) return
    updateModel(modelId, { modelsFetched: false })
    try {
      let url = ''
      const id = model.id
      const tpl = PROVIDER_TEMPLATES.find(t => model.name === t.name || model.id.includes(t.id))
      if (id.startsWith('model_')) {
        url = `${model.baseUrl}/models`
      } else if (id === 'openai') {
        url = `${model.baseUrl || 'https://api.openai.com/v1'}/models`
      } else if (id === 'anthropic') {
        url = `${model.baseUrl || 'https://api.anthropic.com/v1'}/models`
      } else {
        url = `${model.baseUrl}/models`
      }

      const headers: Record<string, string> = {}
      if (model.name === 'Claude' || id === 'anthropic') {
        headers['x-api-key'] = model.apiKey
      } else {
        headers['Authorization'] = `Bearer ${model.apiKey}`
      }

      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const list = (data.data || data.models || []).map((m: any) => ({
        id: m.id || m.name || '',
        contextWindow: m.context_window || m.inputTokenLimit,
      })).filter((m: any) => m.id).slice(0, 30)
      updateModel(modelId, { availableModels: list, selectedModel: list[0]?.id || '', modelsFetched: true })
    } catch (e: any) {
      updateModel(modelId, { modelsFetched: true })
      alert(`获取模型列表失败: ${e.message}`)
    }
  }

  // ===== MCP =====
  const addServer = async () => {
    const s: MCPServerConfig = { id: `srv_${Date.now()}`, name: '新服务器', description: '', url: '', type: 'sse', command: '', args: [], enabled: false }
    await addMcpServer(s)
    setServers(await window.electronAPI!.mcp.getServers() as MCPServerConfig[])
  }

  const updateServer = async (id: string, patch: Partial<MCPServerConfig>) => {
    await updateMcpServer(id, patch)
    setServers(await window.electronAPI!.mcp.getServers() as MCPServerConfig[])
  }

  const deleteServer = async (id: string) => {
    if (!confirm('确定删除？')) return
    await removeMcpServer(id)
    setServers(await window.electronAPI!.mcp.getServers() as MCPServerConfig[])
  }

  const toggleServer = async (id: string) => {
    const srv = servers.find((s) => s.id === id)
    if (!srv) return
    const newEnabled = !srv.enabled
    setServers(prev => prev.map(s => s.id === id ? { ...s, enabled: newEnabled } : s))
    try {
      if (!newEnabled) {
        // 关闭时：断开连接并收起展开面板
        await disconnect(id).catch(() => {})
        if (expandedSrv === id) setExpandedSrv(null)
      }
      await updateMcpServer(id, { enabled: newEnabled })
    } catch (e: any) {
      setServers(prev => prev.map(s => s.id === id ? { ...s, enabled: !newEnabled } : s))
      alert(`操作失败：${e.message || '未知错误'}`)
    }
  }

  const loadServerDetail = async (serverId: string) => {
    const srv = servers.find(s => s.id === serverId)
    // 服务器未启用时不允许展开
    if (!srv?.enabled) return
    if (expandedSrv === serverId) { setExpandedSrv(null); return }
    setExpandedSrv(serverId)
    setLoadingDetail(true)
    setSrvTools([])
    setSrvResources([])
    setSrvPrompts([])
    try {
      const connResult = await connect(serverId)
      if (connResult.error) {
        console.error('MCP connect error:', connResult.error)
      }
      const [tools, resources, prompts] = await Promise.all([
        listTools(serverId).catch((e) => { console.error('listTools error:', e); return [] as MCPTool[] }),
        listResources(serverId).catch((e) => { console.error('listResources error:', e); return [] as MCPResource[] }),
        listPrompts(serverId).catch((e) => { console.error('listPrompts error:', e); return [] as MCPPrompt[] }),
      ])
      setSrvTools(tools)
      setSrvResources(resources)
      setSrvPrompts(prompts)
      setSrvDetailTab('tools')
    } catch (e: any) { console.error('loadServerDetail error:', e.message) }
    finally { setLoadingDetail(false) }
  }

  /** 根据 inputSchema 生成参数模板 JSON */
  const generateArgsTemplate = (target: any): string => {
    if (!target?.inputSchema?.properties) return '{}'
    const props = target.inputSchema.properties as Record<string, any>
    const entries = Object.entries(props).map(([name, schema]: [string, any]) => {
      let defaultVal: any = ''
      switch (schema.type) {
        case 'number': case 'integer': defaultVal = 0; break
        case 'boolean': defaultVal = false; break
        case 'array': defaultVal = []; break
        case 'object': defaultVal = {}; break
        default: defaultVal = ''
      }
      return [name, defaultVal]
    })
    return JSON.stringify(Object.fromEntries(entries), null, 2)
  }

  const openCallModal = (type: 'tool' | 'resource' | 'prompt', target: any) => {
    setCallModal({ type, target })
    if (type === 'resource') {
      setCallArgs('')
    } else if (type === 'prompt') {
      const tmpl = target.arguments?.length
        ? JSON.stringify(Object.fromEntries(target.arguments.map((a: any) => [a.name, a.default ?? ''])), null, 2)
        : '{}'
      setCallArgs(tmpl)
    } else {
      setCallArgs(generateArgsTemplate(target))
    }
    setCallResult(null)
  }

  const executeCall = async () => {
    if (!callModal || !expandedSrv) return
    setCallLoading(true)
    setCallResult(null)
    try {
      let result: any
      if (callModal.type === 'tool') {
        const args = JSON.parse(callArgs || '{}')
        result = await callTool(expandedSrv, callModal.target.name, args)
        setCallResult(JSON.stringify(result, null, 2))
      } else if (callModal.type === 'resource') {
        result = await readResource(expandedSrv, callModal.target.uri)
        setCallResult(JSON.stringify(result, null, 2))
      } else if (callModal.type === 'prompt') {
        const args = JSON.parse(callArgs || '{}')
        result = await getPrompt(expandedSrv, callModal.target.name, args)
        setCallResult(JSON.stringify(result, null, 2))
      }
    } catch (e: any) {
      setCallResult(`错误: ${e.message}`)
    } finally { setCallLoading(false) }
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏：标签切换 */}
      <div className="flex h-11 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="返回">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {([
            { id: 'general' as const, label: '通用', icon: Settings },
            { id: 'ai' as const, label: 'AI模型', icon: Cpu },
            { id: 'mcp' as const, label: 'MCP 服务器', icon: Server },
            { id: 'capabilities' as const, label: '能力', icon: Zap },
            { id: 'agent' as const, label: 'Agent', icon: Bot },
            { id: 'a2a' as const, label: 'A2A', icon: Globe },
            { id: 'about' as const, label: '关于', icon: Info },
          ]).map((t) => (
            <button
              key={t.id}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setTab(t.id)}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* ===== 通用设置 ===== */}
        {tab === 'general' && (
          <div className="w-full space-y-6">
            <fieldset className="rounded-lg border border-border p-4">
              <legend className="px-2 text-sm font-semibold">Supabase</legend>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label>Project URL</Label>
                  <Input placeholder="https://xxxxx.supabase.co" value={supabaseUrl} onChange={(e) => setSupabaseUrl(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Anon Key</Label>
                  <Input placeholder="eyJhbGciOiJIUzI1NiIs..." value={supabaseKey} onChange={(e) => setSupabaseKey(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Dashboard → Settings → API，使用 anon/public 密钥</p>
                </div>
              </div>
            </fieldset>

            <fieldset className="rounded-lg border border-border p-4">
              <legend className="px-2 text-sm font-semibold">Cloudinary（图片上传）</legend>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label>Cloud Name</Label>
                  <Input placeholder="your-cloud-name" value={cloudName} onChange={(e) => setCloudName(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Upload Preset</Label>
                  <Input placeholder="ml_default" value={uploadPreset} onChange={(e) => setUploadPreset(e.target.value)} />
                </div>
              </div>
            </fieldset>

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={clearAll}>清除全部配置</Button>
              <div className="flex items-center gap-2">
                {saved && <span className="text-xs text-muted-foreground">已保存</span>}
                <Button size="sm" onClick={saveGeneral}>保存</Button>
              </div>
            </div>
          </div>
        )}

        {/* ===== 能力设置 ===== */}
        {tab === 'capabilities' && (
          <div className="w-full space-y-3">
            <p className="text-xs text-muted-foreground rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 border border-blue-200 dark:border-blue-900">
              在此管理 BrainPlus 的各项扩展能力。关闭某项后，AI 和插件将无法使用对应功能。
            </p>

            {/* ====== 执行环境 ====== */}
            <div className="rounded-lg border border-border">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setCapExpanded(prev => ({ ...prev, sandbox: !prev.sandbox }))}
              >
                <div className="flex items-center gap-3">
                  <Code className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">执行环境</p>
                    <p className="text-[10px] text-muted-foreground">JavaScript / Python 沙箱</p>
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${capExpanded.sandbox ? '' : '-rotate-90'}`} />
              </div>
              {capExpanded.sandbox && (
                <div className="border-t border-border px-4 py-3 space-y-2">
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-foreground">JavaScript 沙箱</p>
                      <p className="text-[10px] text-muted-foreground">Node.js + npm 包，Worker 线程隔离执行</p>
                    </div>
                    <button
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${sandboxJS ? 'bg-primary' : 'bg-muted'}`}
                      onClick={() => { const v = !sandboxJS; setSandboxJS(v); saveJSSandboxEnabled(v) }}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${sandboxJS ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-foreground">Python 沙箱</p>
                      <p className="text-[10px] text-muted-foreground">Python 3 / uv + pip 包，进程隔离执行</p>
                    </div>
                    <button
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${sandboxPython ? 'bg-primary' : 'bg-muted'}`}
                      onClick={() => { const v = !sandboxPython; setSandboxPython(v); savePythonSandboxEnabled(v) }}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${sandboxPython ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ====== 外部搜索 ====== */}
            <div className="rounded-lg border border-border">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setCapExpanded(prev => ({ ...prev, search: !prev.search }))}
              >
                <div className="flex items-center gap-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">外部搜索</p>
                    <p className="text-[10px] text-muted-foreground">互联网搜索引擎</p>
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${capExpanded.search ? '' : '-rotate-90'}`} />
              </div>
              {capExpanded.search && (
                <div className="border-t border-border px-4 py-3 space-y-2">
                  {/* Bing 搜索 */}
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-foreground">Bing</p>
                        <p className="text-[10px] text-muted-foreground">网页搜索，中文支持好，全球可用</p>
                      </div>
                      <button
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${bingEnabled ? 'bg-primary' : 'bg-muted'}`}
                        onClick={() => { const v = !bingEnabled; setBingEnabledState(v); saveBingEnabled(v) }}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${bingEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    {bingEnabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <NumberField label="搜索结果数" value={bingResultCount} setValue={(n: number) => { setBingResultCount(n); saveBingResultCount(n) }} min={1} max={20} unit="条" />
                        <NumberField label="超时" value={bingTimeout} setValue={(n: number) => { setBingTimeout(n); saveBingTimeout(n) }} min={3} max={60} unit="秒" />
                      </div>
                    )}
                  </div>

                  {/* DuckDuckGo */}
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-foreground">DuckDuckGo</p>
                        <p className="text-[10px] text-muted-foreground">Instant Answer API，英文效果好，隐私优先</p>
                      </div>
                      <button
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${ddgEnabled ? 'bg-primary' : 'bg-muted'}`}
                        onClick={() => { const v = !ddgEnabled; setDdgEnabled(v); saveDuckDuckGoEnabled(v) }}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${ddgEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    {ddgEnabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <NumberField label="搜索结果数" value={ddgResultCount} setValue={(n: number) => { setDdgResultCount(n); saveDDGResultCount(n) }} min={1} max={20} unit="条" />
                        <NumberField label="超时" value={ddgTimeout} setValue={(n: number) => { setDdgTimeout(n); saveDDGTimeout(n) }} min={3} max={60} unit="秒" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== Agent 设置 ===== */}
        {tab === 'agent' && (
          <div className="w-full space-y-6">
            <fieldset className="rounded-lg border border-border p-4">
              <legend className="px-2 text-sm font-semibold">记忆功能</legend>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                开启后 AI 自动从对话中提取关键信息（偏好/技能/项目等），下次对话时记住。
                短期记忆仅限本次会话，长期记忆存云端跨设备同步。
              </p>
              <div className="flex items-center gap-2">
                <button
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${memoryEnabled ? 'bg-primary' : 'bg-muted'}`}
                  onClick={() => { const v = !memoryEnabled; setMemoryEnabled(v); saveMemoryEnabled(v) }}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${memoryEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
                <span className="text-xs text-muted-foreground">{memoryEnabled ? '已开启' : '已关闭'}</span>
              </div>
            </fieldset>

            <fieldset className="rounded-lg border border-border p-4">
              <legend className="px-2 text-sm font-semibold">最大任务步数</legend>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                AI 在一次对话中最多执行多少步工具调用（包括读取文档、调用技能、沙箱执行等）。
                步数决定 AI 能完成多复杂的任务。建议值 10-50，简单任务 10 步足够，PPT 等复杂任务建议 30+。
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => { const n = Math.max(5, maxSteps - 5); setMaxSteps(n); saveAgentMaxSteps(n) }}
                  disabled={maxSteps <= 5}>
                  −
                </Button>
                <Input
                  type="number" min={5} max={100}
                  value={maxSteps}
                  onChange={(e) => {
                    const v = parseInt(e.target.value)
                    if (!isNaN(v) && v >= 5 && v <= 100) { setMaxSteps(v); saveAgentMaxSteps(v) }
                  }}
                  className="h-8 w-20 text-center text-sm"
                />
                <Button variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => { const n = Math.min(100, maxSteps + 5); setMaxSteps(n); saveAgentMaxSteps(n) }}
                  disabled={maxSteps >= 100}>
                  +
                </Button>
                <span className="ml-3 text-xs text-muted-foreground">默认 25 步</span>
              </div>
            </fieldset>

            <fieldset className="rounded-lg border border-border p-4">
            <legend className="px-2 text-sm font-semibold">上下文压缩</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Token 上限</Label>
                <p className="text-[10px] text-muted-foreground/50 mb-1">0=自动，用模型默认值</p>
                <div className="flex items-center gap-1">
                  <Input type="number" min={0} step={1024} value={tokenLimit}
                    onChange={e => { const v = parseInt(e.target.value) || 0; setTokenLimit(v); saveTokenLimit(v) }}
                    className="h-8 w-24 text-center text-sm" />
                  <span className="text-xs text-muted-foreground">tok</span>
                </div>
              </div>
              <div>
                <Label className="text-xs">压缩阈值</Label>
                <p className="text-[10px] text-muted-foreground/50 mb-1">达到上限的%时触发</p>
                <div className="flex items-center gap-1">
                  <Input type="number" min={30} max={95} value={compressThreshold}
                    onChange={e => { const v = parseInt(e.target.value); if (v >= 30 && v <= 95) { setCompressThreshold(v); saveCompressThreshold(v) } }}
                    className="h-8 w-20 text-center text-sm" />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </fieldset>

          <MemoryPanel manager={memoryManagerRef.current} />
          </div>
        )}

        {/* ===== A2A 设置 ===== */}
        {tab === 'a2a' && (
          <div className="w-full space-y-6">
            <fieldset className="rounded-lg border border-border p-4">
              <legend className="px-2 text-sm font-semibold">A2A Server</legend>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                开启后 BrainPlus 作为 A2A Agent 服务端，外部可通过 HTTP 调用你的 Agent。
                访问 http://localhost:{a2aPort}/.well-known/agent-card.json 查看 Agent Card。
              </p>
              <div className="flex items-center gap-2 mb-3">
                <button
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${a2aEnabled ? 'bg-primary' : 'bg-muted'}`}
                  onClick={() => { const v = !a2aEnabled; setA2AEnabled(v); saveA2AEnabled(v); v ? window.electronAPI?.a2a?.start(a2aPort) : window.electronAPI?.a2a?.stop() }}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${a2aEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
                <span className="text-xs text-muted-foreground">{a2aEnabled ? '运行中' : '已关闭'}</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <Label className="text-xs">端口</Label>
                <Input type="number" min={1024} max={65535} value={a2aPort}
                  onChange={e => { const p = parseInt(e.target.value) || 9090; setA2APortState(p); saveA2APort(p) }}
                  className="h-8 w-24 text-center text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Token</Label>
                <Input value={a2aToken}
                  onChange={e => { setA2AToken(e.target.value); saveA2AToken(e.target.value); window.electronAPI?.a2a?.setToken?.(e.target.value) }}
                  placeholder="留空不鉴权"
                  className="h-8 text-sm flex-1 font-mono" />
                <Button variant="outline" size="sm" className="h-8 text-xs shrink-0"
                  onClick={() => {
                    const t = 'a2a_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24)
                    setA2AToken(t); saveA2AToken(t); window.electronAPI?.a2a?.setToken?.(t)
                  }}>
                  <RefreshCw className="mr-1 h-3 w-3" />生成
                </Button>
              </div>
            </fieldset>
          </div>
        )}

        {/* ===== AI 模型设置 ===== */}
        {tab === 'ai' && (
          <div className="w-full space-y-3">
            <p className="text-xs text-muted-foreground rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 border border-blue-200 dark:border-blue-900">
              添加模型连接，支持同一供应商多个连接。数据仅存储在本机。
            </p>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setEditingModelId(null); setNewModel({ providerId: 'openai', customName: '', apiKey: '', baseUrl: '' }); setShowAddModel(true) }}>
                <Plus className="mr-1 h-3 w-3" />添加连接
              </Button>
            </div>

            {/* 添加/编辑弹窗 */}
            {showAddModel && (
              <div className="rounded-lg border border-primary/30 p-4 space-y-3">
                <p className="text-xs font-medium">{editingModelId ? '编辑连接' : '新建连接'}</p>
                <Input
                  className="h-8 text-xs"
                  placeholder="连接名称（如：我的 OpenAI、公司 Claude）"
                  value={newModel.customName}
                  onChange={e => setNewModel(p => ({ ...p, customName: e.target.value }))}
                />
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">供应商</label>
                  <div className="flex gap-1">
                    <select
                      className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={PROVIDER_TEMPLATES.some(t => t.id === newModel.providerId) ? newModel.providerId : '__custom__'}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setNewModel(p => ({ ...p, providerId: '', baseUrl: '' }))
                        } else {
                          setNewModel(p => ({ ...p, providerId: e.target.value, baseUrl: PROVIDER_TEMPLATES.find(t => t.id === e.target.value)?.defaultBaseUrl || '' }))
                        }
                      }}
                    >
                      {PROVIDER_TEMPLATES.map(t => (
                        <option key={t.id} value={t.id}>{t.displayName}</option>
                      ))}
                      <option value="__custom__">自定义…</option>
                    </select>
                    {!PROVIDER_TEMPLATES.some(t => t.id === newModel.providerId) && (
                      <Input
                        className="flex-1 h-8 text-xs"
                        placeholder="供应商名称（如：硅基流动）"
                        value={newModel.providerId}
                        onChange={e => setNewModel(p => ({ ...p, providerId: e.target.value }))}
                      />
                    )}
                  </div>
                </div>
                <Input
                  type="password"
                  className="h-8 text-xs"
                  placeholder="API Key"
                  value={newModel.apiKey}
                  onChange={e => setNewModel(p => ({ ...p, apiKey: e.target.value }))}
                />
                <Input
                  className="h-8 text-xs"
                  placeholder="Base URL（可选，留空用默认）"
                  value={newModel.baseUrl}
                  onChange={e => setNewModel(p => ({ ...p, baseUrl: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={handleAddModel} disabled={!newModel.apiKey.trim()}>
                    <Check className="mr-1 h-3 w-3" />{editingModelId ? '保存' : '添加'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowAddModel(false); setEditingModelId(null) }}>
                    <X className="mr-1 h-3 w-3" />取消
                  </Button>
                </div>
              </div>
            )}

            {/* 已添加的连接 — 只显示已配置的 */}
            {models.filter(m => m.apiKey).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">暂无模型连接，点击上方添加</p>
            ) : (
              models.filter(m => m.apiKey).map((model) => (
                <div key={model.id} className={`rounded-lg border transition-colors ${model.enabled ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer" onClick={() => setExpandedModel(expandedModel === model.id ? null : model.id)}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{model.displayName}</span>
                          {model.enabled && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary shrink-0">启用</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                          {model.name}{model.baseUrl ? ` · ${model.baseUrl}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button className="p-1 text-muted-foreground/30 hover:text-foreground transition-colors" onClick={() => openEditDialog(model)} title="编辑">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button className="p-1 text-muted-foreground/30 hover:text-destructive transition-colors"
                        onClick={() => { if (confirm(`确定删除「${model.displayName}」连接？`)) handleDeleteModel(model.id) }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${model.enabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
                        onClick={() => toggleModel(model.id)}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${model.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                      <svg className={`h-3.5 w-3.5 text-muted-foreground/30 shrink-0 transition-transform cursor-pointer ${expandedModel === model.id ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        onClick={(e) => { e.stopPropagation(); setExpandedModel(expandedModel === model.id ? null : model.id) }}><path d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>

                  {/* 展开：获取模型列表 */}
                  {expandedModel === model.id && (
                    <div className="border-t border-border px-4 py-3 space-y-3">
                      <Input
                        className="h-7 text-xs"
                        placeholder="连接名称"
                        value={model.displayName}
                        onChange={e => updateModel(model.id, { displayName: e.target.value })}
                      />
                      <div className="flex items-center justify-between">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fetchModels(model.id)} disabled={!model.apiKey}>
                          <RefreshCw className={`mr-1 h-3 w-3 ${!model.modelsFetched && model.apiKey ? 'animate-spin' : ''}`} />
                          {model.modelsFetched ? '刷新模型列表' : '获取模型列表'}
                        </Button>
                        {model.modelsFetched && model.availableModels.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">{model.availableModels.length} 个模型可用</span>
                        )}
                      </div>
                      {model.modelsFetched && model.availableModels.length > 0 && (
                        <details className="group">
                          <summary className="cursor-pointer text-[10px] text-muted-foreground/50 hover:text-muted-foreground select-none flex items-center justify-between">
                            <span>模型列表</span>
                            <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="max-h-48 overflow-auto space-y-1 rounded border border-border p-2 mt-2">
                            {model.availableModels.map((sm) => (
                              <div
                                key={sm.id}
                                className={`flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs transition-colors ${model.selectedModel === sm.id ? 'bg-accent font-medium' : 'hover:bg-muted'}`}
                                onClick={() => updateModel(model.id, { selectedModel: sm.id })}
                              >
                                <span className="font-mono">{sm.id}</span>
                                {model.selectedModel === sm.id && <Check className="h-3.5 w-3.5 text-primary" />}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      {model.modelsFetched && model.availableModels.length === 0 && (
                        <p className="text-[10px] text-muted-foreground/50">未能获取模型列表，请检查 API Key 和 Base URL</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            {/* ====== Neo4j 图数据库 ====== */}
            <GraphDatabaseSection />
          </div>
        )}

        {tab === 'mcp' && (
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">MCP (Model Context Protocol) 服务器配置，用于扩展 AI 工具能力。</p>
              <Button size="sm" variant="outline" onClick={addServer}><Plus className="mr-1 h-3.5 w-3.5" />新增</Button>
            </div>

            {/* 渐进式披露阈值 */}
            <fieldset className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <legend className="text-sm font-semibold mb-1">渐进式披露阈值</legend>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    当可用 MCP 工具数量超过此值时，系统会自动根据当前对话内容智能筛选最相关的工具发送给 AI 模型。
                    筛选可节省 token 消耗并提升响应质量。建议值 5-12，工具数量越多可适当调高。
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7"
                    onClick={() => { const n = Math.max(1, disclosureThreshold - 1); setDisclosureThreshold(n); saveDisclosureThreshold(n) }}
                    disabled={disclosureThreshold <= 1}>
                    <span className="text-xs">−</span>
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={disclosureThreshold}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v) && v >= 1 && v <= 50) { setDisclosureThreshold(v); saveDisclosureThreshold(v) }
                    }}
                    className="h-8 w-16 text-center text-sm"
                  />
                  <Button variant="outline" size="icon" className="h-7 w-7"
                    onClick={() => { const n = Math.min(50, disclosureThreshold + 1); setDisclosureThreshold(n); saveDisclosureThreshold(n) }}
                    disabled={disclosureThreshold >= 50}>
                    <span className="text-xs">+</span>
                  </Button>
                </div>
              </div>
            </fieldset>

            {servers.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">暂无 MCP 服务器</p>
            ) : (
              servers.map((srv) => (
                <div key={srv.id} className="rounded-lg border border-border transition-colors">
                  <div className={`flex items-center justify-between px-4 py-3 ${srv.enabled ? 'cursor-pointer' : ''}`} onClick={() => loadServerDetail(srv.id)}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{srv.name}</p>
                      {srv.description && <p className="text-[10px] text-muted-foreground/60 truncate">{srv.description}</p>}
                      <p className="text-xs text-muted-foreground truncate">{srv.url || srv.command || '未配置'}</p>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${srv.enabled ? 'bg-primary' : 'bg-muted'}`}
                        onClick={() => toggleServer(srv.id)}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${srv.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                      <button className="rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => deleteServer(srv.id)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors" onClick={() => loadServerDetail(srv.id)} title={srv.enabled ? (expandedSrv === srv.id ? '收起' : '展开') : '请先启用服务器'}>
                        <ChevronDown className={`h-4 w-4 transition-transform ${expandedSrv === srv.id ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>
                  {/* 详情编辑 */}
                  <div className="border-t border-border px-4 py-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px]">名称</Label>
                        <Input className="h-8 text-xs" value={srv.name} onChange={(e) => updateServer(srv.id, { name: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-[11px]">连接模式</Label>
                        <select
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                          value={srv.type} onChange={(e) => updateServer(srv.id, { type: e.target.value as MCPServerConfig['type'] })}
                        >
                          <option value="sse">SSE</option>
                          <option value="stdio">Stdio</option>
                          <option value="streamableHttp">HTTP</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[11px]">描述</Label>
                      <Input className="h-8 text-xs" placeholder="服务器用途说明（可选）" value={srv.description || ''} onChange={(e) => updateServer(srv.id, { description: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-[11px]">URL</Label>
                      <Input className="h-8 text-xs" placeholder="http://localhost:3000" value={srv.url} onChange={(e) => updateServer(srv.id, { url: e.target.value })} />
                    </div>
                    {(srv.type === 'sse' || srv.type === 'streamableHttp') && (
                      <div>
                        <Label className="text-[11px]">请求头 (Headers)</Label>
                        <textarea
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                          rows={3}
                          placeholder='{"Authorization": "Bearer xxx", "X-API-Key": "yyy"}'
                          value={srv.headers ? JSON.stringify(srv.headers, null, 2) : ''}
                          onChange={(e) => {
                            const raw = e.target.value.trim()
                            if (!raw) { updateServer(srv.id, { headers: undefined }); return }
                            try {
                              const parsed = JSON.parse(raw)
                              if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                                updateServer(srv.id, { headers: parsed as Record<string, string> })
                              }
                            } catch { /* 输入中的 JSON 不合法，不更新 */ }
                          }}
                          spellCheck={false}
                        />
                        <p className="text-[9px] text-muted-foreground/50 mt-1">JSON 格式，如鉴权 Token。仅对 SSE / HTTP 模式生效。</p>
                      </div>
                    )}
                    {srv.type === 'stdio' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px]">命令</Label>
                          <Input className="h-8 text-xs" placeholder="npx / uvx" value={srv.command} onChange={(e) => updateServer(srv.id, { command: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-[11px]">参数（逗号分隔）</Label>
                          <Input className="h-8 text-xs" placeholder="arg1, arg2" value={srv.args.join(', ')} onChange={(e) => updateServer(srv.id, { args: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 工具/资源/提示 查看和测试 */}
                  {expandedSrv === srv.id && (
                    <div className="border-t border-border px-4 py-3">
                      <div className="flex items-center gap-1 mb-3 border-b border-border pb-2">
                        {(['tools', 'resources', 'prompts'] as const).map((t) => (
                          <button
                            key={t}
                            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${srvDetailTab === t ? 'bg-accent' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => setSrvDetailTab(t)}
                          >
                            {t === 'tools' && <Wrench className="h-3 w-3" />}
                            {t === 'resources' && <FolderOpen className="h-3 w-3" />}
                            {t === 'prompts' && <MessageSquare className="h-3 w-3" />}
                            {t === 'tools' ? `工具 (${srvTools.length})` : t === 'resources' ? `资源 (${srvResources.length})` : `提示 (${srvPrompts.length})`}
                          </button>
                        ))}
                      </div>

                      {loadingDetail ? (
                        <p className="py-8 text-center text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />加载中...</p>
                      ) : (
                        <>
                          {srvDetailTab === 'tools' && (
                            srvTools.length === 0 ? (
                              <p className="py-8 text-center text-xs text-muted-foreground">未发现工具</p>
                            ) : (
                              <div className="space-y-2 max-h-64 overflow-auto">
                                {srvTools.map((tool) => {
                                  const props = (tool.inputSchema?.properties || {}) as Record<string, any>
                                  const required = (tool.inputSchema?.required || []) as string[]
                                  const propEntries = Object.entries(props)
                                  return (
                                  <div key={tool.name} className="rounded border border-border p-2 space-y-1">
                                    <div className="flex items-start justify-between">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium">{tool.name}</p>
                                        <p className="text-[10px] text-muted-foreground line-clamp-2">{tool.description || '无描述'}</p>
                                      </div>
                                      <Button size="sm" variant="outline" className="ml-2 h-6 text-[10px] shrink-0" onClick={() => openCallModal('tool', tool)}>
                                        <Play className="mr-1 h-2.5 w-2.5" />调用
                                      </Button>
                                    </div>
                                    {propEntries.length > 0 && (
                                      <div className="border-t border-border/50 pt-1">
                                        <p className="text-[10px] text-muted-foreground/70 mb-0.5">参数:</p>
                                        {propEntries.map(([name, schema]: [string, any]) => (
                                          <div key={name} className="flex items-baseline gap-1 text-[10px] ml-1">
                                            <span className="font-mono text-primary/80">{name}{required.includes(name) ? '*' : ''}</span>
                                            <span className="text-muted-foreground/50">{schema.type || 'any'}</span>
                                            {schema.description && <span className="text-muted-foreground/60">{schema.description}</span>}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )})}
                              </div>
                            )
                          )}
                          {srvDetailTab === 'resources' && (
                            srvResources.length === 0 ? (
                              <p className="py-8 text-center text-xs text-muted-foreground">未发现资源</p>
                            ) : (
                              <div className="space-y-2 max-h-64 overflow-auto">
                                {srvResources.map((res) => (
                                  <div key={res.uri} className="flex items-start justify-between rounded border border-border p-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium truncate">{res.name || res.uri}</p>
                                      <p className="text-[10px] text-muted-foreground font-mono truncate">{res.uri}</p>
                                    </div>
                                    <Button size="sm" variant="outline" className="ml-2 h-6 text-[10px] shrink-0" onClick={() => openCallModal('resource', res)}>
                                      <Play className="mr-1 h-2.5 w-2.5" />读取
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )
                          )}
                          {srvDetailTab === 'prompts' && (
                            srvPrompts.length === 0 ? (
                              <p className="py-8 text-center text-xs text-muted-foreground">未发现提示</p>
                            ) : (
                              <div className="space-y-2 max-h-64 overflow-auto">
                                {srvPrompts.map((prompt) => (
                                  <div key={prompt.name} className="flex items-start justify-between rounded border border-border p-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium">{prompt.name}</p>
                                      <p className="text-[10px] text-muted-foreground line-clamp-2">{prompt.description || '无描述'}</p>
                                    </div>
                                    <Button size="sm" variant="outline" className="ml-2 h-6 text-[10px] shrink-0" onClick={() => openCallModal('prompt', prompt)}>
                                      <Play className="mr-1 h-2.5 w-2.5" />执行
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ===== 关于 ===== */}
        {tab === 'about' && (
          <div className="flex flex-col items-center text-center flex-1 overflow-auto">
            {/* 头部 */}
            <div className="flex flex-col items-center pt-10 pb-8">
              <img src="/assets/icons/icon2.png" alt="BrainPlus" className="w-16 h-16 rounded-2xl mb-4 shadow-sm" />
              <h2 className="text-lg font-bold text-foreground">BrainPlus</h2>
              <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                v{APP_VERSION}
              </span>
              <p className="text-xs text-muted-foreground/50 mt-3">
                开源自由的 AI Agent 平台
              </p>
            </div>

            {/* 更新日志 — 时间线样式 */}
            {changelog.length > 0 && (
              <div className="w-full max-w-[260px] text-left mb-8">
                <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider mb-3 text-center">
                  更新日志
                </p>
                <div className="relative pl-5 space-y-4 max-h-56 overflow-auto">
                  {/* 时间线竖线 */}
                  <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
                  {changelog.map((entry, i) => (
                    <div key={entry.version} className="relative">
                      {/* 圆点 */}
                      <div className={`absolute -left-5 top-1.5 w-[15px] h-[15px] rounded-full border-2 flex items-center justify-center
                        ${i === 0 ? 'border-primary bg-primary/10' : 'border-muted-foreground/20 bg-card'}`}>
                        <div className={`w-[5px] h-[5px] rounded-full ${i === 0 ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold">{entry.version}</span>
                        {entry.date && (
                          <span className="text-[9px] text-muted-foreground/40">{entry.date}</span>
                        )}
                      </div>
                      <ul className="space-y-0.5">
                        {entry.items.map((item, j) => (
                          <li key={j} className="text-[10px] text-muted-foreground/50 leading-relaxed">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 底部 */}
            <div className="mt-auto pb-8">
              <a href="https://immersionvoid.cc/" target="_blank"
                className="inline-block hover:opacity-75 transition-opacity"
                title="沉浸位工作室官网">
                <img src="/assets/logo/immersionBitLogo.svg" alt="沉浸位工作室" className="w-24" />
              </a>
              <p className="text-[10px] text-muted-foreground/30 mt-2">
                © {__BUILD_YEAR__} 沉浸位工作室 · Apache 2.0
              </p>
            </div>
          </div>
        )}

        {/* 调用弹窗 */}
        {callModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setCallModal(null)}>
            <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-sm">
                  {callModal.type === 'tool' ? `调用工具: ${callModal.target.name}` :
                   callModal.type === 'resource' ? `读取资源: ${callModal.target.name || callModal.target.uri}` :
                   `执行提示: ${callModal.target.name}`}
                </h3>
                <button className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setCallModal(null)}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 工具参数提示 */}
              {callModal.type === 'tool' && callModal.target?.inputSchema?.properties && (
                <div className="mb-3 rounded-md bg-muted/50 p-2 space-y-0.5">
                  <p className="text-[10px] text-muted-foreground mb-1">参数说明：</p>
                  {Object.entries(callModal.target.inputSchema.properties as Record<string, any>).map(([name, schema]: [string, any]) => {
                    const req = (callModal.target.inputSchema.required as string[] || []).includes(name)
                    return (
                      <div key={name} className="flex items-baseline gap-1.5 text-[10px]">
                        <span className="font-mono text-primary font-medium">{name}{req ? '*' : ''}</span>
                        <span className="text-muted-foreground/50">{schema.type || 'any'}</span>
                        {schema.description && <span className="text-muted-foreground/70">— {schema.description}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
              {/* Prompt 参数提示 */}
              {callModal.type === 'prompt' && callModal.target?.arguments?.length > 0 && (
                <div className="mb-3 rounded-md bg-muted/50 p-2 space-y-0.5">
                  <p className="text-[10px] text-muted-foreground mb-1">参数说明：</p>
                  {callModal.target.arguments.map((a: any) => (
                    <div key={a.name} className="flex items-baseline gap-1.5 text-[10px]">
                      <span className="font-mono text-primary font-medium">{a.name}{a.required ? '*' : ''}</span>
                      {a.description && <span className="text-muted-foreground/70">— {a.description}</span>}
                    </div>
                  ))}
                </div>
              )}
              {callModal.type !== 'resource' && (
                <div className="mb-4">
                  <Label className="text-xs">参数 (JSON)</Label>
                  <textarea
                    className="mt-1 h-24 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    value={callArgs}
                    onChange={(e) => setCallArgs(e.target.value)}
                  />
                </div>
              )}

              <div className="flex items-center gap-2 mb-4">
                <Button size="sm" onClick={executeCall} disabled={callLoading}>
                  {callLoading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  执行
                </Button>
              </div>

              {callResult !== null && (
                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">{callResult}</pre>
              )}
            </div>
          </div>
        )}
        {/* end of call modal */}
      </div>
    </div>
  )
}

/** Neo4j 图数据库配置 */
function GraphDatabaseSection() {
  const [uri, setUri] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')

  useEffect(() => {
    const api = (window as any).electronAPI?.graph
    if (!api) return
    api.getConfig().then((cfg: any) => {
      if (cfg) { setUri(cfg.uri || ''); setUsername(cfg.username || '') }
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    const api = (window as any).electronAPI?.graph
    if (!api) return
    await api.configure(uri, username, password)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const handleTest = async () => {
    setTesting(true); setTestMsg('')
    const api = (window as any).electronAPI?.graph
    if (!api) { setTestMsg('API 不可用'); setTesting(false); return }
    try {
      await api.configure(uri, username, password)
      const r = await api.testConnection()
      setTestMsg(r.success ? '连接成功' : '连接失败: ' + (r.error || '未知错误'))
    } catch (e: any) { setTestMsg(e.message) }
    setTesting(false)
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <span className="text-sm font-medium">Neo4j 图数据库</span>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">接入 Neo4j AuraDB，为插件提供图数据库能力</p>
        </div>
      </div>
      <div className="border-t border-border px-4 py-3 space-y-2">
        <Input className="h-7 text-xs" placeholder="bolt://localhost:7687" value={uri}
          onChange={e => setUri(e.target.value)} />
        <div className="flex gap-2">
          <Input className="flex-1 h-7 text-xs" placeholder="用户名" value={username}
            onChange={e => setUsername(e.target.value)} />
          <Input className="flex-1 h-7 text-xs" type="password" placeholder="密码" value={password}
            onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-7 text-xs" onClick={handleSave}>
            {saved ? <Check className="mr-1 h-3 w-3" /> : null}{saved ? '已保存' : '保存'}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleTest} disabled={testing}>
            <RefreshCw className={`mr-1 h-3 w-3 ${testing ? 'animate-spin' : ''}`} />测试连接
          </Button>
          {testMsg && (
            <span className={`text-[10px] ${testMsg.startsWith('连接成功') ? 'text-green-500' : 'text-destructive'}`}>{testMsg}</span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/40">
          密码加密存储。插件通过 ctx.api.graph.query() 调用。
        </p>
      </div>
    </div>
  )
}
