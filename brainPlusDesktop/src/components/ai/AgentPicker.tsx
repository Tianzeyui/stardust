import { useState, useEffect, useCallback } from 'react'
import { Bot, Loader2 } from 'lucide-react'
import { listAgents, type Agent } from '@/lib/agentStore'
import { useAuth } from '@/contexts/AuthContext'

export function AgentPicker({ projectAgentIds }: { projectAgentIds?: string[] }) {
  const { user } = useAuth()
  const [show, setShow] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setAgents(await listAgents(user.id))
    setLoading(false)
  }, [user?.id])

  useEffect(() => { if (show) load() }, [show, load])
  // 打开聊天时自动获取 agents 数量
  useEffect(() => { load() }, [load])

  // 项目限定模式下过滤
  const displayAgents = projectAgentIds ? agents.filter(a => projectAgentIds.includes(a.id!)) : agents
  const activeCount = displayAgents.filter(a => a.status === 'active').length

  return (
    <div className="relative shrink-0">
      <button
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground transition-colors"
        onClick={() => setShow(!show)}
        title="Agents"
      >
        <Bot className="h-3 w-3" />
        <span>Agents{activeCount > 0 ? ` ${activeCount}` : ''}</span>
      </button>

      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)} />
          <div className="absolute left-0 bottom-full z-50 mb-1 w-56 rounded-lg border border-border bg-card shadow-lg">
            <div className="border-b border-border px-3 py-2 flex items-center justify-between">
              <span className="text-xs font-medium">Agents</span>
              <span className="text-[10px] text-muted-foreground/50">{activeCount}/{displayAgents.length} 活跃</span>
            </div>
            <div className="max-h-56 overflow-auto p-1">
              {loading ? (
                <p className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />加载中...
                </p>
              ) : displayAgents.length === 0 ? (
                <p className="px-3 py-6 text-xs text-muted-foreground text-center">
                  {projectAgentIds ? '项目未配置 Agent' : '暂无 Agent'}<br />
                  <span className="text-[10px]">去 Agents 页面创建，在项目设置中配置</span>
                </p>
              ) : (
                displayAgents.map(agent => (
                  <div key={agent.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
                  >
                    <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{agent.name}</span>
                    <span className="text-[10px] text-muted-foreground/50 shrink-0">{agent.skills.length} skills</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
