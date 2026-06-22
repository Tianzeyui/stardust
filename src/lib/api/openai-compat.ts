/**
 * OpenAI 兼容 API provider — 原生 fetch() + SSE 流解析
 * 对齐 CC proxy: anthropicToOpenaiChat + openaiChatStreamToAnthropic
 * 支持: DeepSeek, OpenAI, Qwen, OpenRouter, Groq, Together, Mistral, Ollama 等
 */
import type { ToolDef, StreamEvent, ChatMessage, ProviderConfig, Usage } from './types'

// ====== 消息转换：brainPlus → OpenAI Chat Completions ======

interface OpenAIMessage {
  role: string
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  reasoning_content?: string
}

function convertMessages(messages: ChatMessage[], system?: string): OpenAIMessage[] {
  const result: OpenAIMessage[] = []

  // System prompt
  if (system) {
    result.push({ role: 'system', content: system })
  }

  for (const m of messages) {
    if (m.role === 'system') {
      result.push({ role: 'system', content: m.content })
    } else if (m.role === 'user') {
      result.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      const msg: OpenAIMessage = { role: 'assistant', content: m.content || '' }
      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        }))
      }
      if (m.reasoning_content) msg.reasoning_content = m.reasoning_content
      result.push(msg)
    } else if (m.role === 'tool') {
      result.push({
        role: 'tool',
        content: m.content,
        tool_call_id: m.toolCallId || '',
      })
    }
  }

  return result
}

// ====== 工具转换：brainPlus → OpenAI function ======

interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

function convertTools(tools: Record<string, ToolDef>): OpenAITool[] {
  return Object.entries(tools).map(([name, tool]) => ({
    type: 'function' as const,
    function: {
      name,
      description: tool.description,
      parameters: (tool.inputSchema || { type: 'object', properties: {} }),
    },
  }))
}

// ====== SSE 流解析 ======

interface SSEChunk {
  choices?: Array<{
    delta?: {
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: Array<{
        index: number
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_cache_hit_tokens?: number
  }
}

class SSELineDecoder {
  private buffer = ''

  push(chunk: string): string[] {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''
    return lines.filter(l => l.trim()).map(l => l.trim())
  }

  flush(): string[] {
    const lines = this.buffer.split('\n').filter(l => l.trim())
    this.buffer = ''
    return lines
  }
}

function parseSSEChunk(line: string): SSEChunk | null {
  if (!line.startsWith('data: ')) return null
  const json = line.slice(6)
  if (json === '[DONE]') return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

// ====== reasoning 回显剥离 ======

/**
 * DeepSeek R1 等推理模型会在 content 中回显 reasoning_content。
 * 此函数检测并剥离重复前缀，防止 UI 中“思考+正文”各出现一次。
 */
function stripEchoedReasoning(reasoning: string, text: string): string {
  if (!reasoning || !text) return text

  // 精确前缀匹配
  if (text.startsWith(reasoning)) {
    return text.slice(reasoning.length)
  }

  // 模糊匹配：找最长公共前缀
  let i = 0
  while (i < reasoning.length && i < text.length && reasoning[i] === text[i]) {
    i++
  }

  // 公共前缀超过 reasoning 的 80% → 判定为回显
  if (i > reasoning.length * 0.8) {
    return text.slice(i)
  }

  return text
}

// ====== finish_reason 映射 (CC 对齐) ======

function mapFinishReason(reason: string | null | undefined): string {
  switch (reason) {
    case 'stop': return 'stop'
    case 'tool_calls': return 'tool_calls'
    case 'length': return 'length'
    case 'content_filter': return 'stop'
    default: return 'stop'
  }
}

// ====== 流式主函数 ======

export async function* streamOpenAICompat(
  config: ProviderConfig,
  messages: ChatMessage[],
  tools: Record<string, ToolDef>,
  systemPrompt?: string,
  signal?: AbortSignal,
  maxOutputTokens?: number,
): AsyncGenerator<StreamEvent> {
  const baseUrl = (config.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '')
  const url = `${baseUrl}/v1/chat/completions`

  const openaiMessages = convertMessages(messages, systemPrompt)
  const openaiTools = convertTools(tools)
  const hasTools = openaiTools.length > 0

  const body: Record<string, unknown> = {
    model: config.modelId,
    messages: openaiMessages,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.3,
  }

  // 对齐 CC: max_tokens 剥离策略 — 不传时让模型用自身默认值
  if (maxOutputTokens != null) {
    body.max_tokens = maxOutputTokens
  }
  if (hasTools) {
    body.tools = openaiTools
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error('[openai-compat] DeepSeek error body:', text.slice(0, 500))
    console.error('[openai-compat] Request body:', JSON.stringify(body).slice(0, 1000))
    throw new Error(`API error ${response.status}: ${text.slice(0, 200)}`)
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const lineDecoder = new SSELineDecoder()

  // 工具调用状态机（对齐 CC openaiChatStreamToAnthropic）
  const toolCalls: Map<number, {
    id: string
    name: string
    argsBuffer: string
  }> = new Map()

  let inputTokens = 0
  let outputTokens = 0
  let finishReason = 'stop'
  let textStarted = false
  let aborted = false
  let reasoningAccum = ''   // 累积 reasoning，用于去重
  let echoStripped = false
  let contentAccum = ''    // 累积 content（在剥离回显前不单独 yield）
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (signal?.aborted) { aborted = true; break }

      const text = decoder.decode(value, { stream: true })
      const lines = lineDecoder.push(text)

      for (const line of lines) {
        const chunk = parseSSEChunk(line)
        if (!chunk) continue

        // Usage
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens
          outputTokens = chunk.usage.completion_tokens ?? outputTokens
        }

        const choice = chunk.choices?.[0]
        if (!choice) continue

        // Finish reason
        if (choice.finish_reason) {
          finishReason = mapFinishReason(choice.finish_reason)
        }

        const delta = choice.delta
        if (!delta) continue

        // Reasoning：累积并透传
        if (delta.reasoning_content) {
          reasoningAccum += delta.reasoning_content
          yield { type: 'reasoning-delta', text: delta.reasoning_content, reasoningId: 'reasoning-0' }
        }

        // Text：先累积，再与完整 reasoning 比对剥离回显
        if (delta.content) {
          if (!textStarted) textStarted = true
          contentAccum += delta.content

          if (!echoStripped && reasoningAccum) {
            // 累积 content 仍是 reasoning 的前缀 → 还在回显中，不 yield
            if (reasoningAccum.startsWith(contentAccum)) continue
            // 回显结束：剥离重叠部分
            echoStripped = true
            const stripped = stripEchoedReasoning(reasoningAccum, contentAccum)
            if (stripped) {
              contentAccum = stripped
              yield { type: 'text-delta', text: stripped }
            }
          } else {
            // 已剥离或无 reasoning：正常 yield
            yield { type: 'text-delta', text: delta.content }
          }
        }

        // Tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index

            if (!toolCalls.has(idx)) {
              toolCalls.set(idx, { id: '', name: '', argsBuffer: '' })
            }

            const block = toolCalls.get(idx)!
            if (tc.id) block.id = tc.id
            if (tc.function?.name) block.name += tc.function.name
            if (tc.function?.arguments) block.argsBuffer += tc.function.arguments
          }
        }
      }
    }
  } catch (e: any) {
    if (e.name === 'AbortError' || signal?.aborted) {
      aborted = true
    } else {
      throw e
    }
  } finally {
    reader.releaseLock()
  }

  if (aborted) {
    yield { type: 'done', finishReason: 'abort', usage: { inputTokens, outputTokens } }
    return
  }

  // Flush any pending tool calls
  for (const [, block] of toolCalls) {
    if (block.id && block.name) {
      yield {
        type: 'tool-call-start',
        id: block.id,
        name: block.name,
        input: block.argsBuffer,
      }
    }
  }

  const usage: Usage = {
    inputTokens,
    outputTokens,
  }
  yield { type: 'done', finishReason, usage }
}
