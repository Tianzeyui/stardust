/**
 * 上下文窗口管理器
 *
 * 改进：
 * - 工具原子性：不拆 tool-call 和 tool-result 对
 * - 摘要堆叠：多轮压缩后旧摘要保留，纳入新摘要上下文
 * - 自适应保留条数：根据消息复杂度动态调整
 */
import type { ModelMessage } from 'ai'
import { getAIModels, getCompressThreshold, getCtxWindow } from './config'
import { estimateTokens } from './observability'

const PER_MESSAGE_OVERHEAD = 4
const MIN_RECENT = 4
const MAX_RECENT = 20

const SUMMARY_SYSTEM_PROMPT =
  'You are a conversation summarizer. Summarize the core information below concisely. Retain key decisions, user preferences, and important facts. Under 200 chars.\n\n' +
  'If input contains a previous summary, merge old and new into a single summary.'

export interface CompressResult {
  messages: ModelMessage[]
  wasCompressed: boolean
  originalTokens: number
  compressedTokens: number
  limit: number
  summary?: string
}

export class ContextWindowManager {

  /** 自适应计算保留条数：工具调用越多保留越多 */
  static recentCount(messages: ModelMessage[]): number {
    let toolMsgs = 0
    for (const m of messages) {
      if (m.role === 'tool' || (m as any).toolCall) toolMsgs++
    }
    const ratio = 0.2 + toolMsgs * 0.02
    return Math.max(MIN_RECENT, Math.min(MAX_RECENT, Math.floor(messages.length * ratio)))
  }

  estimateMessagesTokens(messages: ModelMessage[]): number {
    let total = 0
    for (const m of messages) {
      const content = typeof m.content === 'string' ? m.content
        : Array.isArray(m.content) ? m.content.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join(' ') : ''
      total += estimateTokens(content) + PER_MESSAGE_OVERHEAD
    }
    return total
  }

  getContextWindowForModel(): number {
    try {
      const models = getAIModels()
      const enabled = models.find(m => m.enabled && m.apiKey)
      if (enabled) {
        const model = enabled.availableModels?.find(m => m.id === enabled.selectedModel)
        if (model?.contextWindow) return model.contextWindow
      }
    } catch {}
    return getCtxWindow()
  }

  /**
   * 主入口：检查 token 预算，超限则压缩
   */
  async compress(
    messages: ModelMessage[],
    contextWindow: number,
    opts?: { force?: boolean; extraTokens?: number; previousSummary?: string },
  ): Promise<CompressResult> {
    const messageTokens = this.estimateMessagesTokens(messages)
    const originalTokens = messageTokens + (opts?.extraTokens || 0)
    const limit = contextWindow || getCtxWindow()

    // 未超过阈值（且非强制），直接返回
    const threshold = getCompressThreshold() / 100
    if (!opts?.force && originalTokens <= limit * threshold) {
      return { messages, wasCompressed: false, originalTokens, compressedTokens: originalTokens, limit }
    }

    const recentCount = ContextWindowManager.recentCount(messages)
    if (messages.length <= recentCount) {
      return { messages, wasCompressed: false, originalTokens, compressedTokens: originalTokens, limit }
    }

    // 工具原子性：确保分割点不拆 tool-call 和 tool-result 对
    let splitIdx = messages.length - recentCount
    while (splitIdx > 1 && messages[splitIdx]?.role === 'tool') {
      splitIdx++ // tool 消息属于上一条 assistant 的工具调用，不能作为开始
    }

    const toSummarize = messages.slice(0, splitIdx)
    const recent = messages.slice(splitIdx)

    if (toSummarize.length < 3) {
      return this.truncateOnly(messages, limit, originalTokens)
    }

    // 摘要堆叠：旧摘要纳入上下文
    let summary: string
    try {
      const context = opts?.previousSummary
        ? `[上一层摘要]\n${opts.previousSummary}\n\n`
        : ''
      const text = context + this.buildConversationText(toSummarize)
      const { delegateToModel } = await import('./chatService')
      const { result } = await delegateToModel('fast', text, SUMMARY_SYSTEM_PROMPT)
      summary = result || ''
    } catch {
      return this.truncateOnly(messages, limit, originalTokens)
    }

    const compressedTokens = this.estimateMessagesTokens(recent)
    return {
      messages: recent,
      wasCompressed: true,
      originalTokens,
      compressedTokens,
      limit,
      summary,
    }
  }

  private async summarize(messages: ModelMessage[]): Promise<string> {
    const text = this.buildConversationText(messages)
    const { delegateToModel } = await import('./chatService')
    const { result } = await delegateToModel('fast', text, SUMMARY_SYSTEM_PROMPT)
    if (result) return result
    throw new Error('摘要生成失败')
  }

  private buildConversationText(messages: ModelMessage[]): string {
    return messages
      .map(m => {
        const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? 'AI' : m.role === 'tool' ? '工具' : m.role
        const content = typeof m.content === 'string' ? m.content
          : Array.isArray(m.content) ? m.content.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join(' ') : ''
        const truncated = content.length > 800 ? content.slice(0, 800) + '...' : content
        return `[${role}]: ${truncated}`
      })
      .join('\n\n')
  }

  private truncateOnly(messages: ModelMessage[], limit: number, originalTokens: number): CompressResult {
    const targetTokens = Math.floor(limit * 0.8)
    const head = messages[0]
    const recentCount = ContextWindowManager.recentCount(messages)
    const recent = messages.slice(-recentCount)
    const middle = messages.slice(1, -recentCount)
    let result = [head, ...middle, ...recent]

    while (this.estimateMessagesTokens(result) > targetTokens && middle.length > 1) {
      middle.shift()
      result = [head, ...middle, ...recent]
    }

    const compressedTokens = this.estimateMessagesTokens(result)
    return { messages: result, wasCompressed: true, originalTokens, compressedTokens, limit, summary: '[Token 超限，已自动截断历史对话]' }
  }
}
