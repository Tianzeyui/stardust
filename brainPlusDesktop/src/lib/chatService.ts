import { streamText, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { getAIModels, type AIModelConfig } from './config'

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
      // OpenAI compatible (qwen, groq, together, perplexity, mistral, fireworks, ollama, lmstudio, openrouter, azure)
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

export async function chat(
  messages: ModelMessage[],
  onChunk?: (text: string) => void,
) {
  const model = getChatModel()
  if (!model) throw new Error('请先在设置中启用一个 AI 模型')

  const result = streamText({
    model: model.instance,
    messages,
  })

  let fullText = ''
  for await (const chunk of result.textStream) {
    fullText += chunk
    onChunk?.(chunk)
  }

  return fullText
}
