/**
 * AgentRunner — Agent 独立执行引擎
 * 流式运行 Agent，支持工具调用，可将执行过程"开窗"到主对话
 */
import { streamChatWithTools, type ChatMessage } from './api'
import { getChatModel } from './chatService'

export interface AgentRunOpts {
  maxSteps?: number
  abortSignal?: AbortSignal
  tools?: Record<string, any>
  onEvent?: (event: { type: string; text?: string; toolName?: string; toolInput?: unknown; toolOutput?: unknown; agentName?: string }) => void
}

export interface AgentRunResult {
  success: boolean
  text: string
  toolCalls: string[]
  error?: string
}

export async function runAgent(
  systemPrompt: string,
  task: string,
  agentName: string,
  opts?: AgentRunOpts,
): Promise<AgentRunResult> {
  const config = getChatModel()
  if (!config) return { success: false, text: '', toolCalls: [], error: '没有可用的 AI 模型' }

  const messages: ChatMessage[] = [{ role: 'user', content: task }]
  const toolCalls: string[] = []

  try {
    const { getMCPSdkTools } = await import('./chatService')
    const allTools = await getMCPSdkTools(false)
    const availableTools = opts?.tools || allTools

    const stream = streamChatWithTools({
      config,
      messages,
      tools: Object.keys(availableTools).length > 0 ? availableTools : {},
      systemPrompt,
      abortSignal: opts?.abortSignal,
      maxSteps: opts?.maxSteps ?? 25,
    })

    let fullText = ''
    const toolOutputs: string[] = []
    for await (const event of stream) {
      if (opts?.abortSignal?.aborted) break
      if (event.type === 'reasoning-delta') {
        opts?.onEvent?.({ type: 'agent-reasoning-delta', text: event.text, agentName })
      } else if (event.type === 'text-delta') {
        fullText += event.text
        opts?.onEvent?.({ type: 'agent-text-delta', text: event.text, agentName })
      } else if (event.type === 'tool-call') {
        const name = event.toolName
        toolCalls.push(name)
        opts?.onEvent?.({ type: 'agent-tool-call', toolName: name, toolInput: event.toolInput, agentName })
      } else if (event.type === 'tool-result') {
        const name = event.toolName
        const output = String(event.toolOutput ?? '')
        toolOutputs.push(`${name}: ${output.slice(0, 800)}`)
        opts?.onEvent?.({ type: 'agent-tool-result', toolName: name, toolOutput: output, agentName })
      }
    }

    opts?.onEvent?.({ type: 'agent-done', agentName })
    const outputs = toolOutputs.length > 0 ? '\n\n' + toolOutputs.join('\n') : ''
    const resultText = fullText + outputs || (toolCalls.length > 0 ? `通过 ${toolCalls.join(', ')} 完成任务` : '(无输出)')
    return { success: true, text: resultText, toolCalls }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      return { success: false, text: '', toolCalls, error: '执行被中断' }
    }
    return { success: false, text: '', toolCalls, error: e.message }
  }
}
