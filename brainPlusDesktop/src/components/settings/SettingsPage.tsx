import { useState, useEffect, useCallback } from 'react'
import { Settings, Cpu, Server, Eye, EyeOff, Trash2, Plus, RefreshCw, Check, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig,
} from '@/lib/supabase'
import {
  getCloudinaryConfig, saveCloudinaryConfig, clearCloudinaryConfig,
  getAIModels, saveAIModels, getMCPServers, saveMCPServers,
  type AIModelConfig, type MCPServerConfig,
} from '@/lib/config'

type Tab = 'general' | 'ai' | 'mcp'

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('general')
  const [saved, setSaved] = useState(false)

  // 通用
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [cloudName, setCloudName] = useState('')
  const [uploadPreset, setUploadPreset] = useState('')

  // AI 模型
  const [models, setModels] = useState<AIModelConfig[]>([])
  const [expandedModel, setExpandedModel] = useState<string | null>(null)

  // MCP
  const [servers, setServers] = useState<MCPServerConfig[]>([])

  useEffect(() => {
    // 通用
    const sc = getSupabaseConfig()
    if (sc) { setSupabaseUrl(sc.url); setSupabaseKey(sc.anonKey) }
    const cc = getCloudinaryConfig()
    setCloudName(cc.cloudName)
    setUploadPreset(cc.uploadPreset)
    // AI
    setModels(getAIModels())
    // MCP
    setServers(getMCPServers())
  }, [])

  const flashSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 1500) }

  // ===== 通用保存 =====
  const saveGeneral = () => {
    if (supabaseUrl.trim() && supabaseKey.trim()) {
      saveSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim())
    }
    saveCloudinaryConfig({ cloudName: cloudName.trim(), uploadPreset: uploadPreset.trim() })
    flashSaved()
  }

  const clearAll = () => {
    clearSupabaseConfig(); clearCloudinaryConfig()
    setSupabaseUrl(''); setSupabaseKey(''); setCloudName(''); setUploadPreset('')
    flashSaved()
  }

  // ===== AI 模型 =====
  const updateModel = (id: string, patch: Partial<AIModelConfig>) => {
    setModels((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
      saveAIModels(next)
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
      saveAIModels(next)
      return next
    })
  }

  const fetchModels = async (modelId: string) => {
    const model = models.find((m) => m.id === modelId)
    if (!model || !model.apiKey) return
    updateModel(modelId, { modelsFetched: false })
    try {
      let url = ''
      const id = model.id
      if (id === 'openai') url = `${model.baseUrl || 'https://api.openai.com/v1'}/models`
      else if (id === 'anthropic') url = `${model.baseUrl || 'https://api.anthropic.com/v1'}/models`
      else url = `${model.baseUrl}/models`

      const headers: Record<string, string> = {}
      if (id === 'anthropic') headers['x-api-key'] = model.apiKey
      else headers['Authorization'] = `Bearer ${model.apiKey}`

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
  const addServer = () => {
    const s: MCPServerConfig = { id: `srv_${Date.now()}`, name: '新服务器', url: '', type: 'sse', command: '', args: [], enabled: false }
    const next = [...servers, s]
    setServers(next)
    saveMCPServers(next)
  }

  const updateServer = (id: string, patch: Partial<MCPServerConfig>) => {
    setServers((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
      saveMCPServers(next)
      return next
    })
  }

  const deleteServer = (id: string) => {
    if (!confirm('确定删除？')) return
    const next = servers.filter((s) => s.id !== id)
    setServers(next)
    saveMCPServers(next)
  }

  const toggleServer = (id: string) => {
    setServers((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
      saveMCPServers(next)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏：标签切换 */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {([
            { id: 'general' as const, label: '通用', icon: Settings },
            { id: 'ai' as const, label: 'AI 模型', icon: Cpu },
            { id: 'mcp' as const, label: 'MCP 服务器', icon: Server },
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
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-600">✓ 已保存</span>}
          <Button size="sm" onClick={tab === 'general' ? saveGeneral : undefined}>
            {tab === 'general' ? '保存' : '自动保存'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
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

            <Button variant="ghost" size="sm" onClick={clearAll}>清除全部配置</Button>
          </div>
        )}

        {/* ===== AI 模型设置 ===== */}
        {tab === 'ai' && (
          <div className="w-full space-y-3">
            <p className="text-xs text-muted-foreground rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 border border-blue-200 dark:border-blue-900">
              同时只能启用一个模型。配置好的 API Key 仅存储在本地浏览器中。
            </p>
            {models.map((model) => (
              <div key={model.id} className={`rounded-lg border transition-colors ${model.enabled ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => setExpandedModel(expandedModel === model.id ? null : model.id)}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{model.displayName}</span>
                    {model.enabled && <span className="rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-[10px] text-green-700 dark:text-green-300">已启用</span>}
                    {!model.enabled && model.apiKey && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">已配置</span>}
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${model.enabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'} ${!model.apiKey ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => model.apiKey && toggleModel(model.id)}
                      disabled={!model.apiKey}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${model.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                    <svg className={`h-4 w-4 text-muted-foreground transition-transform ${expandedModel === model.id ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>

                {expandedModel === model.id && (
                  <div className="border-t border-border px-4 py-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Input
                        type="password"
                        className="flex-1"
                        placeholder="API Key"
                        value={model.apiKey}
                        onChange={(e) => updateModel(model.id, { apiKey: e.target.value })}
                      />
                      <Input
                        className="flex-1"
                        placeholder="Base URL（可选）"
                        value={model.baseUrl}
                        onChange={(e) => updateModel(model.id, { baseUrl: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => fetchModels(model.id)} disabled={!model.apiKey}>
                        <RefreshCw className={`mr-1 h-3.5 w-3.5 ${!model.modelsFetched && model.apiKey ? 'animate-spin' : ''}`} />
                        {model.modelsFetched ? '刷新模型' : '获取模型'}
                      </Button>
                      {model.modelsFetched && model.availableModels.length > 0 && (
                        <span className="text-xs text-muted-foreground">{model.availableModels.length} 个模型可用</span>
                      )}
                    </div>
                    {model.availableModels.length > 0 && (
                      <div className="max-h-48 overflow-auto space-y-1 rounded border border-border p-2">
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
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ===== MCP 服务器设置 ===== */}
        {tab === 'mcp' && (
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">MCP (Model Context Protocol) 服务器配置，用于扩展 AI 工具能力。</p>
              <Button size="sm" variant="outline" onClick={addServer}><Plus className="mr-1 h-3.5 w-3.5" />新增</Button>
            </div>
            {servers.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">暂无 MCP 服务器</p>
            ) : (
              servers.map((srv) => (
                <div key={srv.id} className={`rounded-lg border transition-colors ${srv.enabled ? 'border-green-500 bg-green-50/50 dark:bg-green-950/10' : 'border-border'}`}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{srv.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{srv.url || srv.command || '未配置'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${srv.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                        onClick={() => toggleServer(srv.id)}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${srv.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                      <button className="rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => deleteServer(srv.id)}>
                        <Trash2 className="h-4 w-4" />
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
                      <Label className="text-[11px]">URL</Label>
                      <Input className="h-8 text-xs" placeholder="http://localhost:3000" value={srv.url} onChange={(e) => updateServer(srv.id, { url: e.target.value })} />
                    </div>
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
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
