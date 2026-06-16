import { useState, useEffect, useCallback } from 'react'
import { Cable, Loader2, ChevronRight, ChevronDown, AlertCircle, Check, Minus, Plus, BarChart3, X, Zap } from 'lucide-react'
import type { MCPServerConfig, MCPTool } from '@/types/electron'
import type { DisclosureResult, ToolScore } from '@/lib/toolDisclosure'
import { getServers, getAllTools } from '@/lib/mcpClient'

interface MCPToolPickerProps {
  selectedTools?: Set<string> | null  // v2: 可选，拉取模式下不再需要手动选择
  onSelectionChange?: (selected: Set<string> | null) => void
  disclosureResult?: DisclosureResult | null
  threshold?: number
  onThresholdChange?: (n: number) => void
  activatedToolNames?: Set<string>
  projectMCPServerIds?: string[]
  projectMCPTools?: string[]
  projectPluginTools?: string[]
  pluginTools?: Array<{ name: string; description: string }>
}

/** 组合工具全名，与 getMCPSdkTools 中格式一致: {serverName}__{toolName} */
function toolFullName(serverName: string, toolName: string) {
  return (serverName + '__' + toolName).replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function MCPToolPicker({
  selectedTools = null, onSelectionChange,
  disclosureResult = null, threshold = 8, onThresholdChange,
  activatedToolNames = new Set(),
  projectMCPServerIds,
  projectMCPTools,
  projectPluginTools,
  pluginTools,
}: MCPToolPickerProps) {
  const [show, setShow] = useState(false)
  const [servers, setServers] = useState<MCPServerConfig[]>([])
  const [toolsByServer, setToolsByServer] = useState<Record<string, MCPTool[]>>({})
  const [loading, setLoading] = useState(false)
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Array<{ serverName: string; error: string }>>([])
  const [showIndex, setShowIndex] = useState(false)

  // 打开面板时加载全部数据
  const loadData = useCallback(async () => {
    setLoading(true)
    setErrors([])
    try {
      const allServers = await getServers()
      setServers(allServers)

      const enabled = allServers.filter(s => s.enabled)
      if (enabled.length > 0) {
        const result = await getAllTools()
        const byServer: Record<string, MCPTool[]> = {}
        for (const t of result.tools) {
          if (!byServer[t.serverId]) byServer[t.serverId] = []
          byServer[t.serverId].push(t)
        }
        setToolsByServer(byServer)
        if (result.errors.length > 0) setErrors(result.errors)
      } else {
        setToolsByServer({})
      }
    } catch (e: any) {
      console.warn('[MCPToolPicker] 加载工具失败:', e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (show) { loadData(); setShowIndex(false) }
  }, [show, loadData])

  // ====== 工具选择逻辑（仅针对已启用服务器）======

  const getEnabledServers = () => servers.filter(s => s.enabled)

  const allToolFullNames = (): string[] => {
    const names: string[] = []
    for (const srv of getEnabledServers()) {
      const tools = toolsByServer[srv.id] || []
      for (const t of tools) names.push(toolFullName(t.serverName, t.name))
    }
    // 包含插件工具
    for (const t of (pluginTools || [])) names.push(t.name)
    return names
  }

  const isToolAvailable = (fullName: string, isPlugin = false) => {
    if (isPlugin) {
      if (projectPluginTools && projectPluginTools.length > 0) return projectPluginTools.includes(fullName)
      return true
    }
    if (projectMCPTools && projectMCPTools.length > 0) return projectMCPTools.includes(fullName)
    return true
  }
  const isToolSelected = (fullName: string) => selectedTools === null || selectedTools.has(fullName)

  const handleToggleTool = (fullName: string) => {
    if (selectedTools === null) {
      const all = allToolFullNames()
      onSelectionChange?.(new Set(all.filter(n => n !== fullName)))
    } else {
      const next = new Set(selectedTools)
      if (next.has(fullName)) next.delete(fullName)
      else next.add(fullName)
      const all = allToolFullNames()
      if (all.length > 0 && all.every(n => next.has(n))) onSelectionChange?.(null)
      else onSelectionChange?.(next)
    }
  }

  // ====== 统计 ======

  const allNames = allToolFullNames()
  const enabledServers = getEnabledServers()
  // 项目限定模式下过滤服务器
  const displayServers = projectMCPServerIds ? servers.filter(s => projectMCPServerIds.includes(s.id)) : servers
  const selectedCount = selectedTools === null ? allNames.length : selectedTools.size
  const isAllSelected = selectedTools === null || (allNames.length > 0 && allNames.every(n => selectedTools.has(n)))

  return (
    <div className="relative shrink-0">
      <button
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground transition-colors"
        onClick={() => setShow(!show)}
        title="MCP 工具选择"
      >
        <Cable className="h-3 w-3" />
        <span>工具{selectedTools !== null ? ` ${selectedCount}` : ''}</span>
      </button>

      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)} />
          <div className="absolute left-0 bottom-full z-50 mb-1 w-72 rounded-lg border border-border bg-card shadow-lg">
            {/* 标题栏 */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-medium">工具</span>
              {selectedTools !== null ? (
                <span className="text-[10px] text-primary">手动选择 {selectedCount}</span>
              ) : (
                <span className="text-[10px] text-muted-foreground/50">自动模式</span>
              )}
            </div>

            {/* 插件工具副标题 */}
            <div className="px-3 py-1 text-[10px] text-muted-foreground/50 border-b border-border/30">
              插件工具
            </div>

            {/* 插件工具 —— 单栏平铺，与 MCP 服务器平级 */}
            <div className={`flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer hover:bg-muted/50 transition-colors`}
              onClick={() => {
                setExpandedServers(prev => {
                  const next = new Set(prev)
                  if (next.has('__plugins__')) next.delete('__plugins__')
                  else next.add('__plugins__')
                  return next
                })
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <ChevronRight className={`h-3 w-3 transition-transform shrink-0 ${expandedServers.has('__plugins__') ? 'rotate-90' : ''}`} />
                <span className="truncate">插件工具</span>
              </div>
              <span className="text-[10px] text-muted-foreground/50 shrink-0 ml-2">{(pluginTools || []).length} 工具</span>
            </div>

            {expandedServers.has('__plugins__') && (
              <div className="ml-5 border-l border-border pl-2">
                {pluginTools && pluginTools.length > 0 ? (
                  pluginTools.map(t => {
                    const selected = isToolSelected(t.name)
                    return (
                      <div key={t.name}
                        className="flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-muted/30 cursor-pointer"
                        onClick={() => handleToggleTool(t.name)}
                      >
                        <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'}`}>
                          {selected && <Check className="h-2.5 w-2.5" />}
                        </span>
                        <span className="font-mono text-[10px]">{t.name.replace(/^plugin__[^_]+_/, '')}</span>
                        <span className="text-[10px] text-muted-foreground/50 truncate">{t.description}</span>
                      </div>
                    )
                  })
                ) : (
                  <p className="px-2 py-2 text-[10px] text-muted-foreground/50">暂无注册工具的插件</p>
                )}
              </div>
            )}

            {/* 分隔 + MCP 服务器 */}
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground/70 font-medium border-b border-border">
              MCP 服务器
            </div>

            {/* 服务器/工具列表 */}
            <div className="max-h-64 overflow-auto p-1">
              {loading ? (
                <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载中...
                </p>
              ) : displayServers.length === 0 ? (
                <p className="px-3 py-8 text-xs text-muted-foreground text-center">
                  暂无已配置的 MCP 服务器<br />
                  <span className="text-[10px]">去设置页面添加</span>
                </p>
              ) : (
                displayServers.map(srv => {
                  const tools = toolsByServer[srv.id] || []
                  const expanded = expandedServers.has(srv.id)
                  const srvError = errors.find(e => e.serverName === srv.name)
                  return (
                    <div key={srv.id}>
                      {/* 服务器行 */}
                      <div className={`flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${srv.enabled ? 'hover:bg-muted/50 cursor-pointer' : 'opacity-50'}`}>
                        <div className="flex items-center gap-1.5 min-w-0 flex-1"
                          onClick={() => {
                            if (!srv.enabled) return
                            setExpandedServers(prev => {
                              const next = new Set(prev)
                              if (next.has(srv.id)) next.delete(srv.id)
                              else next.add(srv.id)
                              return next
                            })
                          }}
                        >
                          {/* 展开箭头（仅已启用服务器可展开） */}
                          <button
                            className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-20"
                            disabled={!srv.enabled}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!srv.enabled) return
                              setExpandedServers(prev => {
                                const next = new Set(prev)
                                if (next.has(srv.id)) next.delete(srv.id)
                                else next.add(srv.id)
                                return next
                              })
                            }}
                          >
                            <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                          </button>
                          <div className="min-w-0 flex-1">
                            <span className="truncate block">{srv.name}</span>
                            {!srv.enabled && (
                              <span className="text-[9px] text-muted-foreground/50">未启用</span>
                            )}
                            {srvError && srv.enabled && (
                              <span className="text-[9px] text-red-500 flex items-center gap-0.5">
                                <AlertCircle className="h-2.5 w-2.5" />{srvError.error.slice(0, 40)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {/* 工具计数 */}
                          {srv.enabled && (toolsByServer[srv.id] || []).length > 0 && (
                            <span className="text-[10px] text-muted-foreground/50">{(toolsByServer[srv.id] || []).length} 工具</span>
                          )}
                          {!srv.enabled && <span className="text-[10px] text-muted-foreground/50">未启用</span>}
                        </div>
                      </div>

                      {/* 展开的工具列表（仅已启用） */}
                      {srv.enabled && expanded && (
                        <div className="ml-5 border-l border-border pl-2">
                          {tools.length === 0 ? (
                            <p className="px-2 py-2 text-[10px] text-muted-foreground">暂无工具</p>
                          ) : (
                            tools.map(t => {
                              const fName = toolFullName(t.serverName, t.name)
                              const selected = isToolSelected(fName)
                              return (
                                <div
                                  key={fName}
                                  className="flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-muted/30 cursor-pointer"
                                  onClick={() => handleToggleTool(fName)}
                                >
                                  <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'}`}>
                                    {selected && <Check className="h-2.5 w-2.5" />}
                                  </span>
                                  <span className="truncate text-[11px]" title={t.description || t.name}>{t.name}</span>
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

            {/* 全选 / 取消全选（仅针对已启用服务器） */}
            {enabledServers.length > 0 && !loading && (
              <div className="flex items-center gap-2 border-t border-border px-3 py-1.5">
                <button className="text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                  onClick={() => onSelectionChange?.(null)} disabled={isAllSelected}>全选</button>
                <button className="text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                  onClick={() => onSelectionChange?.(new Set())}
                  disabled={selectedTools !== null && selectedTools.size === 0}>取消全选</button>
                {selectedTools !== null && (
                  <span className="ml-auto text-[10px] text-muted-foreground/50">{selectedCount}/{allNames.length}</span>
                )}
              </div>
            )}

            {/* 阈值调节 */}
            {enabledServers.length > 0 && !loading && (
              <div className="flex items-center justify-between border-t border-border px-3 py-1.5">
                <span className="text-[10px] text-muted-foreground">渐进式披露阈值</span>
                <div className="flex items-center gap-1">
                  <button className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                    onClick={() => onThresholdChange?.(threshold - 1)} disabled={threshold <= 1}
                    title="减少">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-[11px] font-mono font-medium">{threshold}</span>
                  <button className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                    onClick={() => onThresholdChange?.(threshold + 1)} disabled={threshold >= 50}
                    title="增加">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}

            {/* 查看工具索引 —— 始终显示入口，无数据时给出提示 */}
            {!loading && (
              <div className="border-t border-border">
                <button
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  onClick={() => setShowIndex(!showIndex)}
                >
                  <BarChart3 className="h-3 w-3" />
                  <span>查看会话披露</span>
                  <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${showIndex ? 'rotate-180' : ''}`} />
                </button>

                {showIndex && (
                  <div className="border-t border-border/50 px-3 py-2 max-h-48 overflow-auto space-y-1.5">
                    {disclosureResult ? (
                      <>
                        <p className="text-[10px] text-muted-foreground/70">
                          阈值 {threshold} · {Object.keys(disclosureResult.scores).length} 工具 → {disclosureResult.tools.length} 发送
                          {activatedToolNames.size > 0 && (
                            <span className="ml-2 text-primary"><Zap className="inline h-2.5 w-2.5" /> 本轮激活 {activatedToolNames.size} 个</span>
                          )}
                        </p>

                        {/* 得分排序列表 */}
                        {Object.entries(disclosureResult.scores)
                          .sort(([, a], [, b]) => b.score - a.score)
                          .map(([name, info]: [string, ToolScore]) => (
                            <div key={name} className="flex items-start gap-1.5">
                              {info.matched
                              ? <Check className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                              : <X className="h-3 w-3 text-muted-foreground/30 shrink-0 mt-0.5" />
                            }
                              <div className="min-w-0 flex-1">
                                <span className="text-[10px] font-mono truncate block">
                                  {name}
                                  {activatedToolNames.has(name) && (
                                    <span className="ml-1 text-[9px] text-primary font-medium">本轮激活</span>
                                  )}
                                </span>
                                <span className="text-[9px] text-muted-foreground/50">
                                  得分: {info.score}{info.reason ? ` · ${info.reason}` : ''}
                                </span>
                              </div>
                            </div>
                          ))}
                      </>
                    ) : (
                      <div className="py-3 text-center text-[10px] text-muted-foreground/60">
                        <BarChart3 className="mx-auto h-4 w-4 text-muted-foreground/30 mb-1" />
                        <p className="text-center text-[10px] text-muted-foreground/60">发送消息后将在此显示工具的智能筛选结果</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
