/**
 * Orchestrator — 模型自主委托（tier-based delegation）
 * 子 Agent 拥有完整工具能力（workspace/sandbox/terminal/git 等）
 */
import { streamChatWithTools } from './api'
import { getChatModel } from './chatService'
import { getAgentMaxSteps } from './config'

export async function delegateByTier(
  tier: 'fast' | 'balanced' | 'powerful',
  task: string,
  systemContext?: string,
): Promise<string> {
  // 选择层级对应的模型
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

  // 获取工具（与主对话相同的工具集）
  let tools: Record<string, any> = {}
  try {
    const { getMCPSdkTools } = await import('./chatService')
    tools = await getMCPSdkTools(false)
  } catch {}

  // 用 streamChatWithTools 执行（子 Agent 拥有完整工具能力）
  const stream = streamChatWithTools({
    config: { ...config, modelId },
    messages: [{ role: 'user', content: task }],
    tools,
    systemPrompt: systemContext || 'You are a coding agent. Use tools directly. Be concise.',
    maxSteps: getAgentMaxSteps(),
  })

  let fullText = ''
  const toolCalls: string[] = []
  for await (const event of stream) {
    if (event.type === 'text-delta') {
      fullText += event.text
    } else if (event.type === 'tool-call') {
      toolCalls.push(event.toolName)
    }
  }

  const toolInfo = toolCalls.length > 0
    ? `\n(调用工具: ${toolCalls.join(', ')})`
    : ''
  const modelName = config.provider === 'deepseek'
    ? `deepseek-${modelId.split('-').slice(-2).join('-')}`
    : modelId.split('/').pop() || modelId

  return `[${modelName} (${tier})]\n${fullText}${toolInfo}`
}
