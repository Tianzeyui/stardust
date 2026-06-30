import { useState, useEffect, useCallback } from 'react'
import {
  FolderKanban, Plus, Trash2, ExternalLink, Terminal,
  Settings2, ChevronRight, FolderSearch, ArrowRight, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirmDialog'
import { MdEditor } from '@/components/editor/MdEditor'
import { projectStore } from '@/lib/projectStore'
import type { Project } from '@/types/project'
import type { Agent } from '@/lib/agentStore'
import { getServers, getAllTools } from '@/lib/mcpClient'
import type { MCPServerConfig } from '@/types/electron'
import { pluginSystem } from '@/lib/pluginSystem'
import { useAuth } from '@/contexts/AuthContext'

export function ProjectsPage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPath, setNewPath] = useState('')
  const [createRules, setCreateRules] = useState(true)
  const [migrateTarget, setMigrateTarget] = useState<Project | null>(null)
  const [migratePath, setMigratePath] = useState('')
  const [migrateCopy, setMigrateCopy] = useState(true)
  const [migrating, setMigrating] = useState(false)
  const [editingName, setEditingName] = useState('')

  // Settings
  const [mcpServers, setMcpServers] = useState<MCPServerConfig[]>([])
  const [mcpServerTools, setMcpServerTools] = useState<Record<string, Array<{ name: string; description: string }>>>({})
  const [pluginToolList, setPluginToolList] = useState<Array<{ name: string; description: string }>>([])
  const [expandedMcp, setExpandedMcp] = useState<Set<string>>(new Set())

  const refresh = useCallback(() => {
    setProjects(projectStore.getAll())
    getServers().then(setMcpServers)
    // 加载 MCP 工具列表
    getAllTools().then(result => {
      const byServer: Record<string, Array<{ name: string; description: string }>> = {}
      for (const t of result.tools) {
        if (!byServer[t.serverId]) byServer[t.serverId] = []
        byServer[t.serverId].push({ name: t.name, description: t.description })
      }
      setMcpServerTools(byServer)
    }).catch(() => {})
    // 加载插件工具
    const pTools = pluginSystem.getPluginTools()
    setPluginToolList(Object.entries(pTools).map(([name, t]: [string, any]) => ({
      name,
      description: t.description || '',
    })))
  }, [user?.id])

  useEffect(() => {
    projectStore.init().then(() => {
      refresh()
    })
    return projectStore.onChange(refresh)
  }, [refresh])

  const selected = projects.find(p => p.id === selectedId)

  const handleCreate = async () => {
    if (!newName.trim()) return
    const p = await projectStore.create(newName.trim(), newDesc.trim(), newPath.trim() || undefined)
    if (p) {
      // 自动创建 .stardust/rules.md
      if (createRules && window.electronAPI?.fs) {
        const content = `# ${newName.trim()}\n\n${newDesc.trim() || '项目规则文件。AI 每次对话自动读取。'}`
        await window.electronAPI.fs.writeFile(`${p.path}/.stardust/rules.md`, content).catch(() => {})
      }
      setNewName(''); setNewDesc(''); setNewPath(''); setShowCreate(false)
      setSelectedId(p.id)
    }
  }

  const browseProjectPath = async () => {
    const result = await window.electronAPI?.dialog?.openDirectory()
    if (result?.success && result.path) {
      setNewPath(result.path)
    }
  }

  const browseMigratePath = async () => {
    const result = await window.electronAPI?.dialog?.openDirectory()
    if (result?.success && result.path) {
      setMigratePath(result.path)
    }
  }

  const handleMigrate = async () => {
    if (!migrateTarget || !migratePath.trim()) return
    setMigrating(true)
    const ok = await projectStore.migratePath(migrateTarget.id, migratePath.trim(), migrateCopy)
    setMigrating(false)
    if (ok) {
      setMigrateTarget(null); setMigratePath(''); setMigrateCopy(true)
      refresh()
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await projectStore.delete(deleteTarget)
    if (selectedId === deleteTarget) setSelectedId(null)
    setDeleteTarget(null)
  }

  const openInExplorer = (p: Project) => {
    window.electronAPI?.shell?.openInExplorer(p.path)
  }
  const openInTerminal = (p: Project) => {
    window.electronAPI?.shell?.openInTerminal(p.path)
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏 — 全宽，对齐插件/Skills 页位置 */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className="text-sm font-semibold">项目</h2>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 ml-auto" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* 左侧列表 */}
        <div className="w-52 shrink-0 overflow-auto flex flex-col">
          <div className="flex-1 overflow-auto pt-0.5">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-12 text-muted-foreground">
              <FolderKanban className="h-6 w-6 opacity-20" />
              <p className="text-[11px]">暂无项目</p>
            </div>
          ) : (
            projects.map(p => (
              <button
                key={p.id}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs transition-colors ${
                  selectedId === p.id ? 'bg-muted' : 'hover:bg-muted/30'
                }`}
                onClick={() => { setSelectedId(p.id); setShowCreate(false) }}
              >
                <FolderKanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate block">{p.name}</span>
              </button>
            ))
          )}
        </div>
        </div>

        {/* 右侧详情 / 新建 */}
        <div className="flex-1 overflow-auto p-4">
          {showCreate ? (
            <div className="max-w-md space-y-3">
              <h3 className="text-xs font-semibold">新建项目</h3>
              <div>
                <Label className="text-[11px]">名称</Label>
                <Input className="h-8 text-sm" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="我的项目" onKeyDown={e => e.key === 'Enter' && handleCreate()} />
              </div>
              <div>
                <Label className="text-[11px]">描述（可选）</Label>
                <Input className="h-8 text-sm" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="项目用途说明" onKeyDown={e => e.key === 'Enter' && handleCreate()} />
              </div>
              <div>
                <Label className="text-[11px]">工作区目录（可选，留空自动生成）</Label>
                <div className="flex gap-2">
                  <Input className="h-8 text-xs font-mono flex-1" value={newPath} onChange={e => setNewPath(e.target.value)}
                    placeholder="留空自动创建到 ~/Stardust/projects/ 下" onKeyDown={e => e.key === 'Enter' && handleCreate()} />
                  <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={browseProjectPath}>
                    <FolderSearch className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${createRules ? 'bg-primary' : 'bg-muted'}`}
                  onClick={() => setCreateRules(!createRules)}
                >
                  <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${createRules ? 'translate-x-3' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-[10px] text-muted-foreground">自动创建 .stardust/rules.md</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>创建</Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNewName(''); setNewDesc('') }}>取消</Button>
              </div>
            </div>
          ) : selected ? (
            <div className="space-y-4">
              {/* 基本信息 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FolderKanban className="h-4 w-4 text-muted-foreground" />
                  {editingName ? (
                    <Input
                      className="h-7 w-48 text-sm font-semibold"
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const t = editingName.trim()
                          if (t && t !== selected.name) projectStore.update(selected.id, { name: t })
                          setEditingName('')
                        }
                        if (e.key === 'Escape') setEditingName('')
                      }}
                      onBlur={() => setEditingName('')}
                      autoFocus
                    />
                  ) : (
                    <h3
                      className="text-sm font-semibold cursor-pointer hover:text-primary transition-colors"
                      onClick={() => setEditingName(selected.name)}
                      title="点击修改名称"
                    >
                      {selected.name}
                    </h3>
                  )}
                </div>
                {selected.description && (
                  <p className="text-xs text-muted-foreground mb-1.5">{selected.description}</p>
                )}
                <div className="flex items-center gap-2">
                  <p className="text-[11px] text-muted-foreground/50 font-mono truncate flex-1">{selected.path}</p>
                  <button
                    className="shrink-0 text-[10px] text-muted-foreground/50 hover:text-primary transition-colors"
                    onClick={() => { setMigrateTarget(selected); setMigratePath(''); setMigrateCopy(true) }}
                  >
                    更换
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground/40 mt-1">
                  创建于 {new Date(selected.createdAt).toLocaleDateString('zh-CN')}
                </p>

                {/* 迁移面板 */}
                {migrateTarget && migrateTarget.id === selected.id && (
                  <div className="rounded-lg border border-border/50 p-3 mt-2 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      更换工作区目录
                    </div>
                    <div className="flex gap-2">
                      <Input
                        className="h-7 text-xs font-mono flex-1"
                        value={migratePath}
                        onChange={e => setMigratePath(e.target.value)}
                        placeholder="选择或输入新目录路径"
                      />
                      <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={browseMigratePath}>
                        <FolderSearch className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${migrateCopy ? 'bg-primary' : 'bg-muted'}`}
                        onClick={() => setMigrateCopy(!migrateCopy)}
                      >
                        <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${migrateCopy ? 'translate-x-3' : 'translate-x-0.5'}`} />
                      </button>
                      <span className="text-[10px] text-muted-foreground">将现有文件复制到新目录</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={handleMigrate}
                        disabled={!migratePath.trim() || migrating}>
                        {migrating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        确认迁移
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => { setMigrateTarget(null); setMigratePath('') }}>
                        取消
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* 快捷操作 */}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                  onClick={() => openInExplorer(selected)}>
                  <ExternalLink className="h-3 w-3" /> 打开文件目录
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                  onClick={() => openInTerminal(selected)}>
                  <Terminal className="h-3 w-3" /> 打开终端
                </Button>
                <div className="flex-1" />
                <Button size="sm" variant="ghost" className="h-7 text-destructive/50 hover:text-destructive"
                  onClick={() => setDeleteTarget(selected.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <hr className="border-border/50" />

              {/* 项目设置 */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <h4 className="text-xs font-semibold">项目设置</h4>
                </div>

                {/* MCP 服务器 + 工具 */}
                <div className="mb-3">
                  <Label className="text-[11px] mb-1 block">MCP 服务器</Label>
                  <div className="space-y-0.5">
                    {mcpServers.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground/50">暂无已配置 MCP 服务器</p>
                    ) : (
                      mcpServers.map(srv => {
                        const serverEnabled = selected.settings.mcpServers.includes(srv.id)
                        const tools = mcpServerTools[srv.id] || []
                        const expanded = expandedMcp.has(srv.id)
                        return (
                          <div key={srv.id}>
                            <div
                              className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/50 cursor-pointer text-xs"
                              onClick={() => {
                                const next = serverEnabled
                                  ? selected.settings.mcpServers.filter(id => id !== srv.id)
                                  : [...selected.settings.mcpServers, srv.id]
                                projectStore.updateSettings(selected.id, { mcpServers: next })
                              }}
                            >
                              <div className="flex items-center gap-1 min-w-0 flex-1"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setExpandedMcp(prev => {
                                    const next = new Set(prev)
                                    if (next.has(srv.id)) next.delete(srv.id)
                                    else next.add(srv.id)
                                    return next
                                  })
                                }}
                              >
                                <ChevronRight className={`h-3 w-3 transition-transform shrink-0 text-muted-foreground ${expanded ? 'rotate-90' : ''}`} />
                                <span className="truncate">{srv.name}</span>
                                <span className={`text-[9px] ml-1 ${srv.enabled ? 'text-muted-foreground/50' : 'text-destructive/50'}`}>
                                  {srv.enabled ? `(${tools.length})` : '未启用'}
                                </span>
                              </div>
                              <span className={`relative inline-flex h-4 w-7 items-center rounded-full shrink-0 ml-2 transition-colors ${serverEnabled ? 'bg-primary' : 'bg-muted'}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const next = serverEnabled
                                    ? selected.settings.mcpServers.filter(id => id !== srv.id)
                                    : [...selected.settings.mcpServers, srv.id]
                                  projectStore.updateSettings(selected.id, { mcpServers: next })
                                }}
                              >
                                <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${serverEnabled ? 'translate-x-3' : 'translate-x-0.5'}`} />
                              </span>
                            </div>
                            {/* 展开的工具列表 */}
                            {expanded && srv.enabled && serverEnabled && (
                              <div className="ml-6 border-l border-border/50 pl-3 space-y-0.5">
                                {tools.length === 0 ? (
                                  <p className="text-[10px] text-muted-foreground/50 py-1">暂无工具</p>
                                ) : (
                                  tools.map(t => {
                                    const fullName = `${(srv.name).replace(/[^a-zA-Z0-9_-]/g, '_')}__${t.name}`
                                    const currentMCPTools = selected.settings.mcpTools || []
                                    const toolEnabled = currentMCPTools.length === 0 ? true
                                      : currentMCPTools[0] === '' ? false
                                      : currentMCPTools.includes(fullName)
                                    return (
                                      <div key={t.name}
                                        className="flex items-center justify-between py-0.5 px-1 rounded hover:bg-muted/30 cursor-pointer text-[11px]"
                                        onClick={() => {
                                          let next: string[]
                                          if (toolEnabled) {
                                            if (currentMCPTools.length === 0) {
                                              // 首次操作：先建全集（排除哨兵），再移除
                                              const all: string[] = []
                                              for (const tt of tools) all.push(`${(srv.name).replace(/[^a-zA-Z0-9_-]/g, '_')}__${tt.name}`)
                                              next = all.filter(n => n !== fullName)
                                              if (next.length === 0) next = ['']
                                            } else {
                                              next = currentMCPTools.filter(n => n !== fullName)
                                              if (next.length === 0) next = ['']
                                            }
                                          } else {
                                            // 勾选：若为哨兵则替换，否则追加
                                            if (currentMCPTools.length === 1 && currentMCPTools[0] === '') {
                                              next = [fullName]
                                            } else {
                                              next = [...currentMCPTools, fullName]
                                            }
                                          }
                                          projectStore.updateSettings(selected.id, { mcpTools: next })
                                        }}
                                      >
                                        <span className="text-muted-foreground truncate">{t.name}</span>
                                        <span className={`relative inline-flex h-3.5 w-6 items-center rounded-full shrink-0 ml-2 transition-colors ${toolEnabled ? 'bg-primary' : 'bg-muted'}`}>
                                          <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white transition-transform ${toolEnabled ? 'translate-x-2.5' : 'translate-x-0.5'}`} />
                                        </span>
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* 插件工具 */}
                <div className="mb-3">
                  <Label className="text-[11px] mb-1 block">插件工具</Label>
                  <div className="space-y-0.5">
                    {pluginToolList.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground/50">暂无注册工具的插件</p>
                    ) : (
                      pluginToolList.map(t => {
                        const pluginTools = selected.settings.pluginTools || []
                        const enabled = pluginTools.length === 0 ? true
                          : pluginTools[0] === '' ? false
                          : pluginTools.includes(t.name)
                        // 检查是否仍存在
                        return (
                          <div key={t.name}
                            className="flex items-center justify-between py-0.5 px-2 rounded hover:bg-muted/50 cursor-pointer text-[11px]"
                            onClick={() => {
                              let next: string[]
                              if (enabled) {
                                if (pluginTools.length === 0) {
                                  next = pluginToolList.map(p => p.name).filter(n => n !== t.name)
                                  if (next.length === 0) next = ['']
                                } else {
                                  next = pluginTools.filter(n => n !== t.name)
                                  if (next.length === 0) next = ['']
                                }
                              } else {
                                if (pluginTools.length === 1 && pluginTools[0] === '') {
                                  next = [t.name]
                                } else {
                                  next = [...pluginTools, t.name]
                                }
                              }
                              projectStore.updateSettings(selected.id, { pluginTools: next })
                            }}
                          >
                            <div className="min-w-0 flex-1 flex items-center gap-2">
                              <span className="font-mono text-[10px] text-primary/60 shrink-0">{t.name.replace(/^plugin__[^_]+_/, '')}</span>
                              <span className="text-muted-foreground/50 truncate">{t.description}</span>
                            </div>
                            <span className={`relative inline-flex h-3.5 w-6 items-center rounded-full shrink-0 ml-2 transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`}>
                              <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-2.5' : 'translate-x-0.5'}`} />
                            </span>
                          </div>
                        )
                      })
                    )}
                  </div>
                    {/* 过期插件工具引用 */}
                    {(selected.settings.pluginTools || []).filter(t => t && !pluginToolList.some(p => p.name === t)).length > 0 && (
                      <div className="mt-1.5">
                        {(selected.settings.pluginTools || []).filter(t => t && !pluginToolList.some(p => p.name === t)).map(stale => (
                          <div key={stale} className="flex items-center gap-2 py-0.5 px-2 text-[10px] text-muted-foreground/30 line-through">
                            <span>{stale.replace(/^plugin__[^_]+_/, '')}（插件已卸载）</span>
                            <button className="text-[9px] text-destructive/50 hover:text-destructive shrink-0"
                              onClick={() => projectStore.updateSettings(selected.id, { pluginTools: (selected.settings.pluginTools || []).filter(t => t !== stale) })}>
                              清除
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                </div>

              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <FolderKanban className="h-8 w-8 opacity-20" />
              <p className="text-xs">选择项目或新建一个</p>
              <Button size="sm" variant="outline" className="h-7 text-xs mt-1" onClick={() => setShowCreate(true)}>
                <Plus className="h-3 w-3 mr-1" />新建项目
              </Button>
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="删除项目"
          description="确定要删除此项目吗？项目工作区内的文件不会被删除。"
          confirmLabel="删除"
          variant="destructive"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
