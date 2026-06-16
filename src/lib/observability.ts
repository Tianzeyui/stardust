/**
 * 可观测性追踪 — Token、延迟、工具调用、成本估算
 */

export interface ToolCallRecord {
  name: string
  duration: number   // ms
  success: boolean
}

export interface TurnTrace {
  inputTokens: number
  outputTokens: number
  totalDuration: number  // ms
  toolCalls: ToolCallRecord[]
  cachedInputTokens?: number  // 缓存命中的 input token 数（API 报告）
}

/** 模型定价 ($/1M tokens) — 近似值 */
const PRICING: Record<string, { input: number; output: number }> = {
  deepseek: { input: 0.14, output: 0.28 },
  openai:   { input: 2.5, output: 10 },
  anthropic:{ input: 3, output: 15 },
  google:   { input: 0.5, output: 1.5 },
  default:  { input: 1, output: 3 },
}

/** 估算 token 数（粗略：~3 字/token 中文，~4 字符/token 英文） */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3)
}

/** 估算成本 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  providerId?: string,
): number {
  const p = PRICING[providerId || ''] || PRICING.default
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output
}

/** 格式化成本 */
export function formatCost(cost: number): string {
  if (cost < 0.001) return '<$0.001'
  return `$${cost.toFixed(3)}`
}

/** 格式化时长 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** 创建追踪器 */
export function createTrace() {
  const startTime = Date.now()
  let inputTokens = 0
  let outputTokens = 0
  const toolCalls: ToolCallRecord[] = []
  const toolTimers = new Map<string, number>()

  return {
    addInput(text: string) { inputTokens += estimateTokens(text) },
    addOutput(text: string) { outputTokens += estimateTokens(text) },

    toolStart(name: string) { toolTimers.set(name, Date.now()) },
    toolEnd(name: string, success: boolean) {
      const start = toolTimers.get(name)
      if (start) {
        toolCalls.push({ name, duration: Date.now() - start, success })
        toolTimers.delete(name)
      }
    },

    finish(): TurnTrace {
      return {
        inputTokens,
        outputTokens,
        totalDuration: Date.now() - startTime,
        toolCalls,
      }
    },
  }
}
