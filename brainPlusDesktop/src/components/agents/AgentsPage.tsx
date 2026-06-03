import { useState, useEffect, useCallback } from 'react'
import { Plus, ArrowLeft, Trash2, Save, Play, Bot, Zap, Globe, Wifi, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { listAgents, saveAgent, deleteAgent, type Agent, type AgentSkill } from '@/lib/agentStore'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'

function emptySkill(): AgentSkill {
  return { name: '', description: '', tags: [], examples: [], inputModes: ['text'], outputModes: ['text'], sortOrder: 0 }
}

function emptyAgent(): Agent {
  return {
    name: '', description: '', systemPrompt: '', url: '', type: 'remote', version: '1.0.0',
    capabilities: { streaming: true, pushNotifications: false },
    status: 'draft', skills: [],
  }
}

export function AgentsPage() {
  const { user } = useAuth()
  const uid = user?.id ?? ''
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Agent | null>(null)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    setAgents(await listAgents(uid))
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleSave = async () => {
    if (!editing || !editing.name.trim()) return
    setSaving(true)
    console.log('[AgentsPage] saving:', editing.name)
    const saved = await saveAgent(editing, uid)
    console.log('[AgentsPage] saved:', saved)
    if (saved) {
      await refresh()
      setEditing(null)
    } else {
      alert('保存失败，请确认已登录 Supabase 且在 SQL Editor 中执行了 agents.sql 建表')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除？')) return
    await deleteAgent(id, uid)
    refresh()
  }

  const addSkill = () => {
    if (!editing) return
    setEditing({ ...editing, skills: [...editing.skills, emptySkill()] })
  }

  const updateSkill = (idx: number, patch: Partial<AgentSkill>) => {
    if (!editing) return
    const skills = [...editing.skills]
    skills[idx] = { ...skills[idx], ...patch }
    setEditing({ ...editing, skills })
  }

  const removeSkill = (idx: number) => {
    if (!editing) return
    setEditing({ ...editing, skills: editing.skills.filter((_, i) => i !== idx) })
  }

  // ====== 编辑模式 ======
  if (editing) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 h-11">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">{editing.id ? '编辑 Agent' : '新建 Agent'}</span>
            {editing.id && (
              <Badge variant="secondary" className="text-[10px] h-5 font-normal">
                {editing.status === 'active' ? '运行中' : editing.status === 'paused' ? '已暂停' : '草稿'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => {
              const newStatus = editing.status === 'active' ? 'paused' : 'active'
              const updated = { ...editing, status: newStatus as Agent['status'] }
              setEditing(updated)
              await saveAgent(updated, uid)
              await refresh()
            }}>
              {editing.status === 'active' ? '暂停' : '激活'}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled><Play className="mr-1 h-3 w-3" />测试</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving || !editing.name.trim()}>
              <Save className="mr-1 h-3 w-3" />{saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* 基础信息 */}
          <fieldset className="rounded-lg border border-border p-4">
            <legend className="px-2 text-xs font-semibold flex items-center gap-1"><Bot className="h-3 w-3" />基础信息</legend>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">名称 *</Label>
                  <Input className="h-8 text-sm" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="如: 代码助手" />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">版本</Label>
                  <Input className="h-8 text-sm" value={editing.version} onChange={e => setEditing({ ...editing, version: e.target.value })} placeholder="1.0.0" />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">描述</Label>
                <Input className="h-8 text-sm" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="如: 擅长Python代码审查和优化" />
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">System Prompt</Label>
                  <textarea
                    className="h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    value={editing.systemPrompt}
                    onChange={e => setEditing({ ...editing, systemPrompt: e.target.value })}
                    placeholder="自定义 Agent 的系统提示词（选填）。留空则自动从 Skills 生成。"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">类型</Label>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant={editing.type === 'local' ? 'default' : 'outline'}
                      className="h-7 text-xs" onClick={() => setEditing({ ...editing, type: 'local' })}>
                      <WifiOff className="h-3 w-3 mr-1" />本地
                    </Button>
                    <Button
                      size="sm" variant={editing.type === 'remote' ? 'default' : 'outline'}
                      className="h-7 text-xs" onClick={() => setEditing({ ...editing, type: 'remote' })}>
                      <Globe className="h-3 w-3 mr-1" />远程
                    </Button>
                  </div>
                </div>
                {editing.type === 'remote' && (
                  <div className="grid gap-1.5">
                    <Label className="text-xs">远程端点 URL</Label>
                    <Input className="h-8 text-sm font-mono" value={editing.url} onChange={e => setEditing({ ...editing, url: e.target.value })} placeholder="https://agent.example.com" />
                  </div>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">能力 (Capabilities)</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Switch checked={editing.capabilities.streaming} onCheckedChange={v => setEditing({ ...editing, capabilities: { ...editing.capabilities, streaming: v } })} />
                    流式响应 (Streaming)
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Switch checked={editing.capabilities.pushNotifications} onCheckedChange={v => setEditing({ ...editing, capabilities: { ...editing.capabilities, pushNotifications: v } })} />
                    推送通知 (Push)
                  </label>
                </div>
              </div>
            </div>
          </fieldset>

          {/* 能力配置 */}
          <fieldset className="rounded-lg border border-border p-4">
            <legend className="px-2 text-xs font-semibold flex items-center gap-1"><Zap className="h-3 w-3" />能力 (Skills)</legend>
            <div className="space-y-3">
              {editing.skills.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">暂无能力定义，点击下方按钮添加</p>
              )}
              {editing.skills.map((skill, idx) => (
                <div key={idx} className="rounded border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Skill {idx + 1}</span>
                    <button className="text-muted-foreground hover:text-destructive" onClick={() => removeSkill(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">名称</Label>
                      <Input className="h-7 text-xs" value={skill.name} onChange={e => updateSkill(idx, { name: e.target.value })} placeholder="如: code_review" />
                    </div>
                    <div>
                      <Label className="text-[10px]">标签 (逗号分隔)</Label>
                      <Input className="h-7 text-xs" value={skill.tags.join(', ')} onChange={e => updateSkill(idx, { tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="如: python, review" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px]">描述</Label>
                    <Input className="h-7 text-xs" value={skill.description} onChange={e => updateSkill(idx, { description: e.target.value })} placeholder="审查 Python 代码质量与规范" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">输入模式</Label>
                      <div className="flex gap-1 mt-0.5">
                        {(['text', 'file', 'image'] as const).map(mode => (
                          <Button key={mode} size="sm"
                            variant={skill.inputModes.includes(mode) ? 'default' : 'outline'}
                            className="h-6 text-[10px] px-2"
                            onClick={() => {
                              const modes = skill.inputModes.includes(mode)
                                ? skill.inputModes.filter(m => m !== mode)
                                : [...skill.inputModes, mode]
                              updateSkill(idx, { inputModes: modes })
                            }}>
                            {mode}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px]">输出模式</Label>
                      <div className="flex gap-1 mt-0.5">
                        {(['text', 'file'] as const).map(mode => (
                          <Button key={mode} size="sm"
                            variant={skill.outputModes.includes(mode) ? 'default' : 'outline'}
                            className="h-6 text-[10px] px-2"
                            onClick={() => {
                              const modes = skill.outputModes.includes(mode)
                                ? skill.outputModes.filter(m => m !== mode)
                                : [...skill.outputModes, mode]
                              updateSkill(idx, { outputModes: modes })
                            }}>
                            {mode}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px]">示例问题 (分号分隔)</Label>
                    <Input className="h-7 text-xs" value={skill.examples.join('; ')} onChange={e => updateSkill(idx, { examples: e.target.value.split(';').map(s => s.trim()).filter(Boolean) })} placeholder="如: 审查这段代码是否符合规范; 找出潜在的性能问题" />
                  </div>
                </div>
              ))}
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addSkill}>
                <Plus className="mr-1 h-3 w-3" />添加 Skill
              </Button>
            </div>
          </fieldset>
        </div>
      </div>
    )
  }

  // ====== 卡片列表 ======
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 h-11">
        <span className="text-sm font-medium">Agents</span>
        <Button size="sm" className="h-7 text-xs" onClick={() => setEditing(emptyAgent())}>
          <Plus className="mr-1 h-3 w-3" />新建 Agent
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <p className="text-xs text-muted-foreground py-8 text-center">加载中...</p>
        ) : agents.length === 0 ? (
          <div className="py-16 text-center">
            <Bot className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">暂无 Agent</p>
            <p className="text-xs text-muted-foreground/50 mt-1">创建你的第一个 AI Agent</p>
          </div>
        ) : (
	          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
	            {agents.map(agent => (
	              <Card
	                key={agent.id}
	                className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group relative"
	                onClick={() => setEditing({ ...agent })}
	              >
	                <div className="flex justify-center mt-2 mb-2">
	                  <div className="w-8 h-2 rounded-sm border border-border bg-background group-hover:border-primary/40 transition-colors" />
	                </div>
	                <CardHeader className="pb-3 pt-0">
	                  <div className="flex items-start justify-between">
	                    <div className="flex items-center gap-2 min-w-0">
	                      <div className={`shrink-0 rounded-md p-1.5 ${agent.type === 'remote' ? 'bg-blue-500/10 text-blue-500' : 'bg-primary/10 text-primary'}`}>
	                        {agent.type === 'remote' ? <Globe className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
	                      </div>
	                      <div className="min-w-0">
	                        <CardTitle className="text-base truncate">{agent.name}</CardTitle>
	                        <CardDescription className="text-xs mt-0.5">v{agent.version}</CardDescription>
	                      </div>
	                    </div>
	                    <div className="flex items-center gap-1 shrink-0">
		                      <Badge variant="secondary" className="text-[10px] h-5 font-normal">{agent.status === 'active' ? '运行中' : agent.status === 'paused' ? '已暂停' : '草稿'}</Badge>
	                      <button
	                        className="text-muted-foreground/30 hover:text-destructive"
	                        onClick={e => { e.stopPropagation(); handleDelete(agent.id!) }}
	                      >
	                        <Trash2 className="h-3.5 w-3.5" />
	                      </button>
	                    </div>
	                  </div>
	                </CardHeader>

	                <CardContent className="pb-3">
	                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2.5em]">
	                    {agent.description || '暂无描述'}
	                  </p>
	                  {agent.url && (
	                    <p className="text-[10px] text-muted-foreground/50 font-mono truncate mt-1.5">{agent.url}</p>
	                  )}
	                </CardContent>

	                <CardFooter className="flex items-center gap-1.5 flex-wrap pt-0">
	                  <Badge variant="secondary" className="text-[10px] h-5 font-normal">
	                    {agent.type === 'remote' ? <Globe className="h-2.5 w-2.5 mr-1" /> : <WifiOff className="h-2.5 w-2.5 mr-1" />}
	                    {agent.type === 'remote' ? '远程API' : '本地脚本'}
	                  </Badge>
	                  {agent.skills.slice(0, 3).map((s, i) => (
	                    <Badge key={i} variant="outline" className="text-[10px] h-5 font-normal text-muted-foreground">{s.name}</Badge>
	                  ))}
	                  {agent.skills.length > 3 && (
	                    <span className="text-[10px] text-muted-foreground/50">+{agent.skills.length - 3}</span>
	                  )}
	                  {agent.capabilities.streaming && (
	                    <Badge variant="outline" className="text-[10px] h-5 font-normal">streaming</Badge>
	                  )}
	                </CardFooter>
	              </Card>
	            ))}
	          </div>
        )}
      </div>
    </div>
  )
}
