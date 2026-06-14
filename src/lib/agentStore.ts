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
  providerOrg: string         // A2A: provider.organization
  providerUrl: string         // A2A: provider.url
  documentationUrl: string    // A2A: documentationUrl
  inputModes: string[]        // A2A: defaultInputModes
  outputModes: string[]       // A2A: defaultOutputModes
  securitySchemes: Record<string, any>  // A2A: securitySchemes
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
    providerOrg: a.provider_organization || '',
    providerUrl: a.provider_url || '',
    documentationUrl: a.documentation_url || '',
    inputModes: a.input_modes || ['text'],
    outputModes: a.output_modes || ['text'],
    securitySchemes: a.security_schemes || {},
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

export async function listAgents(userId?: string): Promise<Agent[]> {
  const sb = getSupabaseClient()
  let uid = userId || ''
  if (!uid && sb) {
    try { uid = (await sb.auth.getSession()).data.session?.user?.id || '' } catch {}
  }
  if (!sb || !uid) return []

  const { data, error } = await sb
    .from('agents')
    .select('*, agent_skills(*)')
    .eq('user_id', uid)
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
      provider_organization: agent.providerOrg,
      provider_url: agent.providerUrl,
      documentation_url: agent.documentationUrl,
      input_modes: agent.inputModes,
      output_modes: agent.outputModes,
      security_schemes: agent.securitySchemes,
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
      provider_organization: agent.providerOrg,
      provider_url: agent.providerUrl,
      documentation_url: agent.documentationUrl,
      input_modes: agent.inputModes,
      output_modes: agent.outputModes,
      security_schemes: agent.securitySchemes,
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

/** 生成标准 A2A Agent Card JSON */
export function buildAgentCard(agent: Agent): Record<string, any> {
  return {
    name: agent.name,
    description: agent.description,
    url: agent.url || undefined,
    version: agent.version,
    provider: {
      organization: agent.providerOrg || undefined,
      url: agent.providerUrl || undefined,
    },
    documentationUrl: agent.documentationUrl || undefined,
    capabilities: {
      streaming: agent.capabilities.streaming ?? true,
      pushNotifications: agent.capabilities.pushNotifications ?? false,
    },
    defaultInputModes: agent.inputModes || ['text'],
    defaultOutputModes: agent.outputModes || ['text'],
    skills: agent.skills.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      tags: s.tags,
      examples: s.examples,
      inputModes: s.inputModes,
      outputModes: s.outputModes,
    })),
    securitySchemes: agent.securitySchemes || undefined,
  }
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
