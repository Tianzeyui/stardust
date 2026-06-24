/**
 * Orchestrator — 模型自主委托（tier-based delegation）
 * 子 Agent 拥有完整工具能力，支持流式输出到主对话 UI
 */
import { streamChatWithTools } from './api'
import { getChatModel } from './chatService'
import { getAgentMaxSteps } from './config'

export interface DelegateStream {
  text: (delta: string) => void
  toolCall: (name: string) => void
  done: () => void
}

export async function delegateByTier(
  tier: 'fast' | 'balanced' | 'powerful',
  task: string,
  systemContext?: string,
  stream?: DelegateStream,
): Promise<string> {
  const config = getChatModel()
  if (!config) throw new Error('没有可用的模型')

  let modelId = config.modelId
  try {
    const { getAIModels, getModelTier } = await import('./config')
    const models = getAIModels()
    const enabled = models.find((m) => m.enabled && m.apiKey)
    if (enabled) {
      const matched = (enabled.availableModels || []).filter(
        (m: any) => getModelTier(m.id) === tier
      )
      if (matched.length > 0) {
        modelId = tier === 'fast'
          ? matched[0].id
          : matched[matched.length - 1].id
      }
    }
  } catch {}

  let tools: Record<string, any> = {}
  try {
    const { getMCPSdkTools } = await import('./chatService')
    tools = await getMCPSdkTools(false)
  } catch {}

  const streamResult = streamChatWithTools({
    config: { ...config, modelId },
    messages: [{ role: 'user', content: task }],
    tools,
    systemPrompt: systemContext || 'You are a coding agent. Use tools directly. Be concise.',
    maxSteps: getAgentMaxSteps(),
  })

  let fullText = ''
  const toolCalls: string[] = []
  for await (const event of streamResult) {
    if (event.type === 'text-delta') {
      fullText += event.text
      stream?.text(event.text)
    } else if (event.type === 'tool-call') {
      toolCalls.push(event.toolName)
      stream?.toolCall(event.toolName)
    }
  }

  stream?.done()
  const modelName = modelId

  const toolInfo = toolCalls.length > 0
    ? `\n\n_调用工具: ${toolCalls.join(', ')}_`
    : ''

  return `[${modelName} (${tier})]\n${fullText}${toolInfo}`
}
