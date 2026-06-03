/**
 * Agent CRUD — Supabase
 * A2A v1.0 Agent Card 对齐
 */
import { getSupabaseClient } from './supabase'

// ====== 类型 ======

export interface AgentSkill {
  id?: string
  name: string
  description: string
  tags: string[]              // ['code-review', 'python']
  examples: string[]
  inputModes: ('text' | 'file' | 'image')[]
  outputModes: ('text' | 'file')[]
  sortOrder: number
}

export interface AgentCapabilities {
  streaming: boolean
  pushNotifications: boolean
}

export interface Agent {
  id?: string
  name: string
  description: string
  systemPrompt: string        // 自定义系统提示词
  url: string                 // remote endpoint
  type: 'local' | 'remote'
  version: string
  capabilities: AgentCapabilities
  status: 'draft' | 'active' | 'paused'
  skills: AgentSkill[]
  createdAt?: number
}

export interface AgentTask {
  id?: string
  agentId: string
  conversationId?: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  input?: string
  output?: string
  error?: string
  metadata?: Record<string, any>
  startedAt?: number
  completedAt?: number
}

// ====== 工具函数 ======

function mapAgent(a: any): Agent {
  return {
    id: a.id,
    name: a.name,
    description: a.description || '',
    url: a.url || '',
    systemPrompt: a.system_prompt || '',
    type: a.type || 'remote',
    version: a.version || '1.0.0',
    capabilities: a.capabilities || { streaming: true, pushNotifications: false },
    status: a.status || 'draft',
    skills: (a.agent_skills || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description || '',
      tags: s.tags || [],
      examples: s.examples || [],
      inputModes: s.input_modes || ['text'],
      outputModes: s.output_modes || ['text'],
      sortOrder: s.sort_order || 0,
    })),
    createdAt: new Date(a.created_at).getTime(),
  }
}

// ====== CRUD ======

export async function listAgents(userId: string): Promise<Agent[]> {
  const sb = getSupabaseClient()
  if (!sb || !userId) return []

  const { data, error } = await sb
    .from('agents')
    .select('*, agent_skills(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error || !data) { console.warn('[agentStore] listAgents error:', error?.message); return [] }

  return data.map(mapAgent)
}

export async function getAgent(id: string, userId: string): Promise<Agent | null> {
  const sb = getSupabaseClient()
  if (!sb || !userId) return null

  const { data, error } = await sb
    .from('agents')
    .select('*, agent_skills(*)')
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  if (error || !data) return null

  return mapAgent(data)
}

export async function saveAgent(agent: Agent, userId: string): Promise<Agent | null> {
  const sb = getSupabaseClient()
  if (!sb || !userId) return null

  if (agent.id) {
    const { error } = await sb.from('agents').update({
      name: agent.name,
      description: agent.description,
      url: agent.url,
      type: agent.type,
      version: agent.version,
      capabilities: agent.capabilities,
      status: agent.status,
      system_prompt: agent.systemPrompt,
      updated_at: new Date().toISOString(),
    }).eq('id', agent.id).eq('user_id', userId)
    if (error) { console.warn('[agentStore] update failed:', error.message); return null }

    await sb.from('agent_skills').delete().eq('agent_id', agent.id)
  } else {
    const { data, error } = await sb.from('agents').insert({
      user_id: userId,
      name: agent.name,
      description: agent.description,
      url: agent.url,
      type: agent.type,
      version: agent.version,
      capabilities: agent.capabilities,
      status: agent.status,
      system_prompt: agent.systemPrompt,
    }).select('id').single()
    if (error || !data) { console.warn('[agentStore] create failed:', error?.message); return null }
    agent.id = data.id
  }

  // 同步 skills
  for (const s of agent.skills) {
    await sb.from('agent_skills').insert({
      agent_id: agent.id,
      name: s.name,
      description: s.description,
      tags: s.tags,
      examples: s.examples,
      input_modes: s.inputModes,
      output_modes: s.outputModes,
      sort_order: s.sortOrder,
    })
  }

  return agent
}

export async function deleteAgent(id: string, userId: string): Promise<boolean> {
  const sb = getSupabaseClient()
  if (!sb || !userId) return false
  const { error } = await sb.from('agents').delete().eq('id', id).eq('user_id', userId)
  return !error
}

export async function listTasks(agentId: string, userId: string): Promise<AgentTask[]> {
  const sb = getSupabaseClient()
  if (!sb || !userId) return []

  const { data } = await sb
    .from('agent_tasks')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(20)

  return (data || []).map((t: any) => ({
    id: t.id,
    agentId: t.agent_id,
    conversationId: t.conversation_id,
    status: t.status,
    input: t.input,
    output: t.output,
    error: t.error,
    metadata: t.metadata,
    startedAt: t.started_at ? new Date(t.started_at).getTime() : undefined,
    completedAt: t.completed_at ? new Date(t.completed_at).getTime() : undefined,
  }))
}
