import { useState, useEffect, useCallback } from 'react'
import { Bot, Loader2 } from 'lucide-react'
import { listAgents, saveAgent, type Agent } from '@/lib/agentStore'
import { useAuth } from '@/contexts/AuthContext'

export function AgentPicker() {
  const { user } = useAuth()
  const [show, setShow] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setAgents(await listAgents(user.id))
    setLoading(false)
  }, [user?.id])

  useEffect(() => { if (show) load() }, [show, load])

  // 打开聊天时自动获取 agents 数量
  useEffect(() => { load() }, [load])

  const toggleStatus = async (agent: Agent) => {
    if (!user?.id) return
    setToggling(agent.id!)
    const updated = { ...agent, status: agent.status === 'active' ? 'paused' as const : 'active' as const }
    await saveAgent(updated, user.id)
    setAgents(prev => prev.map(a => a.id === agent.id ? updated : a))
    setToggling(null)
  }

  const activeCount = agents.filter(a => a.status === 'active').length

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
              <span className="text-[10px] text-muted-foreground/50">{activeCount}/{agents.length} 活跃</span>
            </div>
            <div className="max-h-56 overflow-auto p-1">
              {loading ? (
                <p className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />加载中...
                </p>
              ) : agents.length === 0 ? (
                <p className="px-3 py-6 text-xs text-muted-foreground text-center">
                  暂无 Agent<br />
                  <span className="text-[10px]">去 Agents 页面创建</span>
                </p>
              ) : (
                agents.map(agent => (
                  <div key={agent.id}
                    className="flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors"
                  >
                    <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1 mx-2">
                      <span className="truncate block">{agent.name}</span>
                      <span className="text-[10px] text-muted-foreground/50">{agent.skills.length} skills</span>
                    </div>
                    {toggling === agent.id ? (
                      <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    ) : (
                      <button
                        className={`relative inline-flex h-4 w-7 items-center rounded-full shrink-0 transition-colors ${agent.status === 'active' ? 'bg-primary' : 'bg-muted'}`}
                        onClick={(e) => { e.stopPropagation(); toggleStatus(agent) }}
                        title={agent.status === 'active' ? '停用' : '启用'}
                      >
                        <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${agent.status === 'active' ? 'translate-x-3' : 'translate-x-0.5'}`} />
                      </button>
                    )}
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
