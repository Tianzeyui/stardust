/**
 * 上下文窗口管理器 v2
 *
 * 改进（对齐 CC）：
 * - 3 层压缩：MicroCompact（每轮轻量）+ AutoCompact（超阈值摘要）+ ReactiveCompact（413 恢复）
 * - 真实 API Token 计数驱动
 * - 压缩后上下文恢复（文件/规则/任务）
 * - 断路器：连续失败 3 次降级为 truncate
 * - 工具原子性：不拆 tool-call 和 tool-result 对
 */
import type { ModelMessage } from 'ai'
import { getAIModels, getCompressThreshold, getCtxWindow } from './config'
import { estimateTokens } from './observability'

const PER_MESSAGE_OVERHEAD = 4
const MIN_RECENT = 4
const MAX_RECENT = 20
const MAX_CONSECUTIVE_FAILS = 3
const MAX_TOOL_RESULT_CHARS = 30_000  // 单条 tool result 最大字符数

const SUMMARY_SYSTEM_PROMPT =
  'You are a conversation summarizer. Summarize the core information below concisely. Retain key decisions, user preferences, important facts, and the current task state. Under 200 chars.\n\n' +
  'If input contains a previous summary, merge old and new into a single summary.'

export interface CompressResult {
  messages: ModelMessage[]
  wasCompressed: boolean
  originalTokens: number
  compressedTokens: number
  limit: number
  summary?: string
  /** 本轮释放的 token 数 */
  freedTokens?: number
}

export interface PostCompactContext {
  /** 最近读取的文件路径列表 */
  recentFiles: string[]
  /** 项目规则摘要 */
  rulesSummary?: string
}

export class ContextWindowManager {
  private compactionFailCount = 0
  private lastRealInputTokens: number | null = null

  /** 从 streamText 结果中更新真实 API Token 计数 */
  updateRealTokens(inputTokens: number, outputTokens?: number) {
    this.lastRealInputTokens = inputTokens
  }

  /** 重置断路器（成功压缩后调用） */
  private resetBreaker() {
    this.compactionFailCount = 0
  }

  /** 检查断路器是否熔断 */
  private isBreakerTripped(): boolean {
    return this.compactionFailCount >= MAX_CONSECUTIVE_FAILS
  }

  // ====== 第 0 层：Micro Compact（每轮运行，轻量） ======

  /**
   * 微压缩：合并在发送给 API 前对消息做轻量优化
   * - 合并连续同角色消息
   * - 截断超大 tool result（>MAX_TOOL_RESULT_CHARS）
   * - 移除空的 tool result
   */
  microCompact(messages: ModelMessage[]): ModelMessage[] {
    if (messages.length < 3) return messages

    const result: ModelMessage[] = []
    let i = 0

    while (i < messages.length) {
      const current = messages[i]

      // 合并连续的同角色 user 消息
      if (current.role === 'user' && result.length > 0 && result[result.length - 1].role === 'user') {
        const prev = result[result.length - 1]
        const prevContent = typeof prev.content === 'string' ? prev.content : JSON.stringify(prev.content)
        const currContent = typeof current.content === 'string' ? current.content : JSON.stringify(current.content)
        if (prevContent && currContent) {
          result[result.length - 1] = { role: prev.role, content: prevContent + '\n\n' + currContent } as ModelMessage
        }
        i++
        continue
      }

      // 截断超大 tool result
      if (current.role === 'tool') {
        const content = typeof current.content === 'string' ? current.content : ''
        if (content.length > MAX_TOOL_RESULT_CHARS) {
          result.push({
            role: current.role,
            content: content.slice(0, MAX_TOOL_RESULT_CHARS) +
              `\n\n[... 工具结果过长，已截断。完整共 ${content.length} 字符，截断后保留前 ${MAX_TOOL_RESULT_CHARS} 字符 ...]`,
          } as unknown as ModelMessage)
          i++
          continue
        }
        // 跳过空的 tool result
        if (!content.trim()) {
          i++
          continue
        }
      }

      result.push(current)
      i++
    }

    return result
  }

  // ====== 第 1 层：Auto Compact（超阈值时运行） ======

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
   * 3 层策略：
   * 1. Micro Compact（每轮）— 由 chatService 在 compress() 前调用
   * 2. Auto Compact（超阈值摘要压缩）
   * 3. 断路器熔断 → truncateOnly
   */
  async compress(
    messages: ModelMessage[],
    contextWindow: number,
    opts?: { force?: boolean; extraTokens?: number; previousSummary?: string },
  ): Promise<CompressResult> {
    // 先做微压缩
    const compacted = this.microCompact(messages)
    const microFreed = messages.length - compacted.length

    const messageTokens = this.estimateMessagesTokens(compacted)
    const originalTokens = messageTokens + (opts?.extraTokens || 0)
    const limit = contextWindow || getCtxWindow()

    // 基础阈值
    let threshold = getCompressThreshold() / 100
    // 工具密集时提前压缩：近20%消息中工具调用比例 >30% → 阈值降10%
    const recentSlice = compacted.slice(Math.floor(compacted.length * 0.8))
    const toolDensity = recentSlice.filter(m => m.role === 'tool').length / Math.max(recentSlice.length, 1)
    if (toolDensity > 0.3) threshold = Math.max(0.5, threshold - 0.1)
    // 小模型保护：至少超过 2000 token 才触发压缩
    if (!opts?.force && (originalTokens <= limit * threshold || originalTokens < 2000)) {
      return { messages: compacted, wasCompressed: microFreed > 0, originalTokens, compressedTokens: originalTokens, limit, freedTokens: microFreed }
    }

    const recentCount = ContextWindowManager.recentCount(compacted)
    if (compacted.length <= recentCount) {
      return { messages: compacted, wasCompressed: microFreed > 0, originalTokens, compressedTokens: originalTokens, limit, freedTokens: microFreed }
    }

    // 断路器检查
    if (this.isBreakerTripped()) {
      const truncResult = this.truncateOnly(compacted, limit, originalTokens)
      return { ...truncResult, freedTokens: microFreed + (originalTokens - truncResult.compressedTokens) }
    }

    // 工具原子性：确保分割点不拆 tool-call 和 tool-result 对
    let splitIdx = compacted.length - recentCount
    while (splitIdx > 1 && compacted[splitIdx]?.role === 'tool') {
      splitIdx++ // tool 消息属于上一条 assistant 的工具调用，不能作为开始
    }

    const toSummarize = compacted.slice(0, splitIdx)
    const recent = compacted.slice(splitIdx)

    if (toSummarize.length < 3) {
      return this.truncateOnly(compacted, limit, originalTokens)
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
      this.compactionFailCount++
      const truncResult = this.truncateOnly(compacted, limit, originalTokens)
      return { ...truncResult, freedTokens: microFreed + (originalTokens - truncResult.compressedTokens) }
    }

    // 成功：重置断路器
    this.resetBreaker()

    const compressedTokens = this.estimateMessagesTokens(recent)
    const freedTokens = originalTokens - compressedTokens

    return {
      messages: recent,
      wasCompressed: true,
      originalTokens,
      compressedTokens,
      limit,
      summary,
      freedTokens,
    }
  }

  // ====== 第 2 层：Reactive Compact（API 返回 context length 错误时） ======

  /**
   * 响应式压缩：比 auto compact 更激进（保留更少消息）
   * 在 API 返回 prompt_too_long / context_length_exceeded 时调用
   */
  async reactiveCompact(
    messages: ModelMessage[],
    contextWindow: number,
    previousSummary?: string,
  ): Promise<CompressResult> {
    // 激进策略：只保留最近 30%
    const keepCount = Math.max(MIN_RECENT, Math.floor(messages.length * 0.3))
    let splitIdx = messages.length - keepCount

    // 工具原子性保护
    while (splitIdx > 1 && messages[splitIdx]?.role === 'tool') {
      splitIdx++
    }

    const toSummarize = messages.slice(0, splitIdx)
    const recent = messages.slice(splitIdx)

    const limit = contextWindow || getCtxWindow()
    const originalTokens = this.estimateMessagesTokens(messages)

    if (toSummarize.length < 3) {
      return this.truncateOnly(messages, limit, originalTokens)
    }

    try {
      const context = previousSummary
        ? `[上一层摘要]\n${previousSummary}\n\n`
        : ''
      const text = context + this.buildConversationText(toSummarize)
      const { delegateToModel } = await import('./chatService')
      const { result } = await delegateToModel('fast', text, SUMMARY_SYSTEM_PROMPT)
      const summary = result || ''
      const compressedTokens = this.estimateMessagesTokens(recent)

      this.resetBreaker()

      return {
        messages: recent,
        wasCompressed: true,
        originalTokens,
        compressedTokens,
        limit,
        summary,
        freedTokens: originalTokens - compressedTokens,
      }
    } catch {
      this.compactionFailCount++
      return this.truncateOnly(messages, limit, originalTokens)
    }
  }

  // ====== 辅助方法 ======

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

/**
 * 压缩后上下文恢复：重新注入关键信息
 * 在 compress() 返回后调用，保证模型仍能访问重要上下文
 */
export async function buildPostCompactInjection(
  recentFiles: string[],
  rulesSummary?: string,
): Promise<string | null> {
  const parts: string[] = []

  // 工具纪律提醒——压缩后最重要的一条，防止模型"偷懒"不调工具
  parts.push(`<system-reminder>
[上下文已压缩 — 重要提醒]
你刚才的对话历史已被压缩为摘要。你必须继续使用工具来完成当前任务：
- 任何关于代码状态、测试结果、文件内容的结论，必须在当前轮调用工具获取
- 不要依赖压缩前的记忆或之前的工具结果——上下文已变化
- 不要跳过工具调用直接给出"看起来合理"的结论
</system-reminder>`)

  if (rulesSummary) {
    parts.push(`<system-reminder>\n[项目规则摘要 — 上下文压缩后恢复]\n${rulesSummary}\n</system-reminder>`)
  }

  if (recentFiles.length > 0) {
    const fileList = recentFiles.slice(0, 5).join(', ')
    parts.push(`<system-reminder>\n[最近操作的文件 — 上下文压缩后恢复]\n${fileList}\n如需重新读取，请使用 workspace_read_file。\n</system-reminder>`)
  }

  return parts.length > 0 ? parts.join('\n\n') : null
}
