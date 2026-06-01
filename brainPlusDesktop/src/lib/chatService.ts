import { streamText, stepCountIs, jsonSchema, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { getAIModels, type AIModelConfig } from './config'
import { getAllTools } from './mcpClient'

function getProvider(model: AIModelConfig) {
  const apiKey = model.apiKey || 'dummy'
  const baseURL = model.baseUrl || undefined

  switch (model.id) {
    case 'openai':
      return createOpenAI({ apiKey, baseURL })
    case 'anthropic':
      return createAnthropic({ apiKey, baseURL })
    case 'google':
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey, baseURL })
    case 'deepseek':
      return createDeepSeek({ apiKey, baseURL })
    default:
      return createOpenAI({ apiKey, baseURL: baseURL || undefined })
  }
}

export function getChatModel() {
  const models = getAIModels()
  const enabled = models.find((m) => m.enabled && m.apiKey)
  if (!enabled) return null

  const provider = getProvider(enabled)
  const modelId = enabled.selectedModel || 'gpt-4o'
  return { instance: provider(modelId), config: enabled }
}

/** 从 MCP 服务器获取工具 */
export async function getMCPSdkTools(): Promise<Record<string, any>> {
  if (!window.electronAPI?.mcp) return {}

  try {
    const { tools } = await getAllTools()
    const sdkTools: Record<string, any> = {}

    for (const t of tools) {
      // 工具名只允许 [a-zA-Z0-9_-]，替换非法字符
      const safeName = (t.serverName + '__' + t.name).replace(/[^a-zA-Z0-9_-]/g, '_')
      // 确保 inputSchema 是合法的 JSON Schema (type: object)
      const schema = t.inputSchema && t.inputSchema.type === 'object'
        ? t.inputSchema
        : { type: 'object', properties: {}, additionalProperties: true }
      sdkTools[safeName] = {
        description: t.description || `MCP tool: ${t.name} (${t.serverName})`,
        inputSchema: jsonSchema(schema as any),
        execute: async (args: any) => {
          const { callTool } = await import('./mcpClient')
          const result = await callTool(t.serverId, t.name, args)
          return result.success
            ? JSON.stringify(result.content)
            : `Error: ${result.error}`
        },
      }
    }

    return sdkTools
  } catch {
    return {}
  }
}

export interface ChatStreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'done'
  text?: string
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown
}

export async function chat(
  messages: ModelMessage[],
  onEvent?: (event: ChatStreamEvent) => void,
) {
  const model = getChatModel()
  if (!model) throw new Error('请先在设置中启用一个 AI 模型')

  const mcpTools = await getMCPSdkTools()

  const result = streamText({
    model: model.instance,
    messages,
    tools: Object.keys(mcpTools).length > 0 ? mcpTools : undefined,
    stopWhen: stepCountIs(5),
  })

  let fullText = ''

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta') {
      fullText += chunk.text
      onEvent?.({ type: 'text-delta', text: chunk.text })
    } else if (chunk.type === 'tool-call') {
      onEvent?.({
        type: 'tool-call',
        toolName: (chunk as any).toolName,
        toolInput: (chunk as any).args || (chunk as any).input,
      })
    } else if (chunk.type === 'tool-result') {
      onEvent?.({
        type: 'tool-result',
        toolName: (chunk as any).toolName,
        toolOutput: (chunk as any).result || (chunk as any).output,
      })
    }
  }

  onEvent?.({ type: 'done' })
  return fullText
}
