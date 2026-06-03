/**
 * AgentRunner — Agent 独立执行引擎
 * 流式运行 Agent，支持工具调用，可将执行过程"开窗"到主对话
 */
import { streamText, stepCountIs, type ModelMessage } from 'ai'
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
  const model = getChatModel()
  if (!model) return { success: false, text: '', toolCalls: [], error: '没有可用的 AI 模型' }

  const messages: ModelMessage[] = [{ role: 'user', content: task }]
  const toolCalls: string[] = []

  try {
    const { getMCPSdkTools } = await import('./chatService')
    const allTools = await getMCPSdkTools(false)
    const availableTools = opts?.tools || allTools

    const result = streamText({
      model: model.instance,
      system: systemPrompt,
      messages,
      tools: Object.keys(availableTools).length > 0 ? availableTools : undefined,
      stopWhen: opts?.maxSteps ? stepCountIs(opts.maxSteps) : undefined,
      abortSignal: opts?.abortSignal,
    })

    let fullText = ''
    const toolOutputs: string[] = []
    for await (const chunk of result.fullStream) {
      if (opts?.abortSignal?.aborted) break
      if (chunk.type === 'text-delta') {
        fullText += chunk.text
        opts?.onEvent?.({ type: 'agent-text-delta', text: chunk.text, agentName })
      } else if (chunk.type === 'tool-call') {
        const name = (chunk as any).toolName || 'unknown'
        toolCalls.push(name)
        opts?.onEvent?.({ type: 'agent-tool-call', toolName: name, toolInput: (chunk as any).args, agentName })
      } else if (chunk.type === 'tool-result') {
        const c = chunk as any
        const name = c.toolName || 'unknown'
        const output = String(c.output ?? c.result ?? '')
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
