/**
 * 上下文窗口管理器 — Token 预估 + 滑动窗口 + AI 摘要
 *
 * 当消息 token 数接近模型上限时，自动压缩对话历史：
 * - 保留最近 N 条消息完整
 * - 前面的消息生成 AI 摘要
 * - 摘要注入为 system 消息
 */

import type { ModelMessage } from 'ai'
import { getAIModels, getCompressThreshold, getTokenLimit, getDefaultCtxWindow } from './config'
import { estimateTokens } from './observability'

// ====== 类型 ======

export interface CompressResult {
  messages: ModelMessage[]
  wasCompressed: boolean
  originalTokens: number
  compressedTokens: number
  limit: number
  summary?: string
}

export interface ContextWindowOptions {
  /** 保留最近多少条消息（默认 10） */
  recentCount?: number
  /** 触发压缩的阈值比例（默认 0.8，即 80% 时触发） */
  threshold?: number
}

// ====== 常量 ======

const DEFAULT_RECENT_COUNT = 10
const DEFAULT_THRESHOLD = 0.8
/** 每条消息的 role/metadata 开销估算（token） */
const PER_MESSAGE_OVERHEAD = 4

/** 摘要生成的 system prompt */
const SUMMARY_SYSTEM_PROMPT =
  '你是对话摘要助手。用简洁语言总结以下对话的核心内容，提取关键决策、重要事实和用户偏好。不超过200字。保持客观。'

// ====== ContextWindowManager ======

export class ContextWindowManager {
  private recentCount: number
  private threshold: number

  constructor(opts?: ContextWindowOptions) {
    this.recentCount = opts?.recentCount ?? DEFAULT_RECENT_COUNT
    this.threshold = opts?.threshold ?? DEFAULT_THRESHOLD
  }

  /**
   * 估算消息数组的 token 数。
   * 每条消息 = content 的 token + role/metadata 开销。
   */
  estimateMessagesTokens(messages: ModelMessage[]): number {
    let total = 0
    for (const m of messages) {
      const content =
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')
            : ''
      total += estimateTokens(content) + PER_MESSAGE_OVERHEAD
    }
    return total
  }

  /**
   * 从当前启用的模型配置中读取 contextWindow。
   * 回退到 8192（安全默认值）。
   */
  getContextWindowForModel(): number {
    const manual = getTokenLimit()
    if (manual > 0) return manual  // 用户手动配置的上限优先
    try {
      const models = getAIModels()
      const enabled = models.find(m => m.enabled && m.apiKey)
      if (!enabled) return getDefaultCtxWindow()

      const selectedId = enabled.selectedModel
      const selectedModel = enabled.availableModels?.find(m => m.id === selectedId)
      return selectedModel?.contextWindow || getDefaultCtxWindow()
    } catch {
      return getDefaultCtxWindow()
    }
  }

  /**
   * 主入口：检查 token 预算，超限则压缩。
   *
   * @param messages - 原始消息数组
   * @param contextWindow - 模型上下文窗口大小
   * @param opts.force - 强制压缩（跳过阈值检查）
   */
  async compress(
    messages: ModelMessage[],
    contextWindow: number,
    opts?: { force?: boolean; extraTokens?: number },
  ): Promise<CompressResult> {
    const messageTokens = this.estimateMessagesTokens(messages)
    const originalTokens = messageTokens + (opts?.extraTokens || 0)
    const limit = contextWindow || getDefaultCtxWindow()

    // 未超过阈值（且非强制），直接返回
    const threshold = getCompressThreshold() / 100
    if (!opts?.force && originalTokens <= limit * threshold) {
      return {
        messages,
        wasCompressed: false,
        originalTokens,
        compressedTokens: originalTokens,
        limit,
      }
    }

    // 消息太少，无需压缩
    if (messages.length <= this.recentCount) {
      return {
        messages,
        wasCompressed: false,
        originalTokens,
        compressedTokens: originalTokens,
        limit,
      }
    }

    // 分割：最近 N 条保留，前面部分做摘要
    const recent = messages.slice(-this.recentCount)
    const toSummarize = messages.slice(0, -this.recentCount)

    // 需要摘要的消息太少，直接截断
    if (toSummarize.length < 3) {
      return this.truncateOnly(messages, limit, originalTokens)
    }

    // 调用 AI 生成摘要
    let summary: string
    try {
      summary = await this.summarize(toSummarize)
    } catch {
      // 摘要失败 → fallback 截断
      return this.truncateOnly(messages, limit, originalTokens)
    }

    // 构建压缩后的消息：最近 N 条完整，摘要由上层注入 system prompt
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

  // ====== 私有方法 ======

  /**
   * 渐进式摘要：优先云端 fast 模型（质量高），
   * 不可用时回退到本地模型，都失败则抛异常触发截断 fallback。
   */
  private async summarize(messages: ModelMessage[]): Promise<string> {
    const conversationText = this.buildConversationText(messages)
    const { delegateToModel } = await import('./chatService')
    const { result } = await delegateToModel('fast', conversationText, SUMMARY_SYSTEM_PROMPT)
    if (result) return result
    throw new Error('摘要生成失败')
  }

  /** 构建消息文本（截断每条到 1000 字） */
  private buildConversationText(messages: ModelMessage[]): string {
    return messages
      .map(m => {
        const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : m.role
        const content =
          typeof m.content === 'string'
            ? m.content
            : Array.isArray(m.content)
              ? m.content.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')
              : ''
        const truncated = content.length > 1000 ? content.slice(0, 1000) + '...' : content
        return `[${role}]: ${truncated}`
      })
      .join('\n\n')
  }

  /**
   * Fallback 截断策略：从中间丢弃消息直到预算内。
   * 保留首条（可能含重要上下文）和最近 N 条。
   */
  private truncateOnly(
    messages: ModelMessage[],
    limit: number,
    originalTokens: number,
  ): CompressResult {
    const targetTokens = Math.floor(limit * this.threshold)

    // 保留第一条 + 最近 N 条
    const head = messages[0]
    const recent = messages.slice(-this.recentCount)

    // 逐步从中间删除消息
    const middle = messages.slice(1, -this.recentCount)
    let result = [head, ...middle, ...recent]

    while (this.estimateMessagesTokens(result) > targetTokens && middle.length > 0) {
      // 从中间的前半部分删除（优先丢旧消息）
      middle.shift()
      result = [head, ...middle, ...recent]
    }

    const compressedTokens = this.estimateMessagesTokens(result)
    return {
      messages: result,
      wasCompressed: true,
      originalTokens,
      compressedTokens,
      limit,
      summary: '[Token 超限，已自动截断历史对话]',
    }
  }
}
