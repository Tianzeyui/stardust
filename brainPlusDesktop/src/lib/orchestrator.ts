/**
 * Agent Orchestrator — 管理主 AI 与子 Agent 的协同
 *
 * 职责：
 * 1. 主 AI 调用 delegate_task → 子 Agent 独立运行
 * 2. 子 Agent 流式输出到 UI
 * 3. 子 Agent 完成后，返回完整结果给主 AI
 * 4. 全链路日志输出到 Chrome console
 */
import { streamText, type ModelMessage } from 'ai'
import { getChatModel } from './chatService'
import { getAgentStreamHandler } from './tools/agent'
import type { Agent } from './agentStore'

function log(msg: string, ...args: any[]) {
  console.log(`[orchestrator] ${msg}`, ...args)
}

export interface DelegateResult {
  agentName: string
  success: boolean
  html: string
  plainText: string
  error?: string
}

export async function delegateToAgent(
  agent: Agent,
  task: string,
): Promise<DelegateResult> {
  const model = getChatModel()
  if (!model) return { agentName: agent.name, success: false, html: '', plainText: '', error: '没有可用模型' }

  const skillDesc = agent.skills.length > 0
    ? '\n能力:\n' + agent.skills.map(s => `- ${s.name}: ${s.description}`).join('\n')
    : ''
  const systemPrompt = agent.systemPrompt
    || `你是"${agent.name}"。${agent.description}${skillDesc}\n\n你有沙箱、文件系统、MCP等全套工具。收到任务后直接调用工具执行，用实际结果回复，不要只描述方案。`

  const streamHandler = getAgentStreamHandler()
  const messages: ModelMessage[] = [{ role: 'user', content: task }]
  const toolCalls: string[] = []

  try {
    const { getMCPSdkTools } = await import('./chatService')
    const allTools = await getMCPSdkTools(false)
    const toolNames = Object.keys(allTools)
    log(`开始执行 "${agent.name}"，工具 ${toolNames.length} 个: ${toolNames.slice(0, 10).join(', ')}${toolNames.length > 10 ? '...' : ''}`)

    const result = streamText({
      model: model.instance,
      system: systemPrompt,
      messages,
      tools: toolNames.length > 0 ? allTools : undefined,
    })

    let fullText = ''
    for await (const chunk of result.fullStream) {
      if (chunk.type === 'text-delta') {
        fullText += chunk.text
        streamHandler?.({ type: 'agent-text-delta', text: chunk.text, agentName: agent.name })
      } else if (chunk.type === 'tool-call') {
        const c = chunk as any
        const name = c.toolName || 'unknown'
        toolCalls.push(name)
        log(`Agent "${agent.name}" ▶ ${name}`)
        streamHandler?.({ type: 'agent-tool-call', toolName: name, toolInput: c.args, agentName: agent.name })
      } else if (chunk.type === 'tool-result') {
        const c = chunk as any
        const name = c.toolName || 'unknown'
        const output = String(c.output ?? c.result ?? '')
        log(`Agent "${agent.name}" ✔ ${name} (${output.length}字)`)
        streamHandler?.({ type: 'agent-tool-result', toolName: name, toolOutput: output, agentName: agent.name })
      }
    }

    streamHandler?.({ type: 'agent-done', agentName: agent.name })
    log(`完成 "${agent.name}": 输出${fullText.length}字, 工具${toolCalls.length}次`)

    const plainText = [fullText.trim(), toolCalls.length > 0 ? `\n(调用: ${toolCalls.join(', ')})` : ''].filter(Boolean).join('\n') || '(无输出)'

    return {
      agentName: agent.name,
      success: true,
      plainText,
      html: `✅ Agent ${agent.name} 完成:\n\n${plainText}`,
    }
  } catch (e: any) {
    streamHandler?.({ type: 'agent-done', agentName: agent.name })
    log(`失败 "${agent.name}": ${e.message}`)
    return { agentName: agent.name, success: false, html: '', plainText: '', error: e.message }
  }
}
