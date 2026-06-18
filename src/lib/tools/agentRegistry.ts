/**
 * Agent Registry — 将活跃 Agent 注册为 AI 可调用工具
 */
import { jsonSchema } from '../api'
import { listAgents, type Agent } from '../agentStore'
import type { ToolMap } from './registry'

let cachedAgents: Agent[] = []
let lastFetch = 0
const CACHE_TTL = 60_000 // 1分钟缓存

/** 工具名 → 原始 Agent 名称映射（供 ChatPage 显示用） */
export const agentDisplayNames = new Map<string, string>()

async function getActiveAgents(userId: string): Promise<Agent[]> {
  const now = Date.now()
  if (now - lastFetch < CACHE_TTL) return cachedAgents
  cachedAgents = (await listAgents(userId)).filter(a => a.status === 'active')
  lastFetch = now
  return cachedAgents
}

export async function registerAgentTools(tools: ToolMap, userId: string) {
  if (!userId) return
  const agents = await getActiveAgents(userId)
  if (agents.length === 0) return

  for (const agent of agents) {
    // API 要求 ^[a-zA-Z0-9_-]+$，全中文名称会导致空字符串
    const sanitized = agent.name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    const safeName = 'agent__' + (sanitized || agent.id!.replace(/-/g, '').slice(0, 8))

    // 构建技能提示
    const skillDesc = agent.skills.length > 0
      ? '\n\n能力列表:\n' + agent.skills.map(s =>
          `- ${s.name}: ${s.description}${s.tags.length ? ' [标签: ' + s.tags.join(', ') + ']' : ''}`
        ).join('\n')
      : ''

    tools[safeName] = {
      description: `${agent.name}: ${agent.description}${skillDesc}`,
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          task: { type: 'string', description: `向 ${agent.name} 提出的任务或问题` },
        },
        required: ['task'],
      }),
      _agentId: agent.id,
      _agentDisplayName: agent.name,
      execute: async ({ task }: { task: string }) => {
        try {
          const { runAgent } = await import('../agentRunner')
          const systemPrompt = agent.systemPrompt
            || `You are "${agent.name}", a coding agent.\n${agent.description}${skillDesc}\n\nUse tools directly. Report in one sentence.`
          const { getAgentStreamHandler } = await import('./agent')
          const handler = getAgentStreamHandler()
          const result = await runAgent(systemPrompt, task, agent.name, { onEvent: handler || undefined })
          if (!result.success) return `[${agent.name}] 执行失败: ${result.error}`
          const toolInfo = result.toolCalls.length > 0 ? `\n(调用工具: ${result.toolCalls.join(', ')})` : ''
          return `[${agent.name}]\n${result.text}${toolInfo}`
        } catch (e: any) {
          return `Agent ${agent.name} 执行失败: ${e.message}`
        }
      },
    }
    // 建立工具名 → 原始名称映射（供 ChatPage 显示用）
    agentDisplayNames.set(safeName, agent.name)
  }
}
