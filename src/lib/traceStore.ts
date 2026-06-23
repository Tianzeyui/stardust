/**
 * 用量追踪存储 — localStorage
 * 每次对话完成后记录 token/工具/时间
 */

export interface TraceRecord {
  id: string
  timestamp: number
  modelName?: string
  inputTokens: number
  outputTokens: number
  cachedTokens?: number  // 缓存命中
  agentTokens: number
  toolCalls: number
  duration: number
}

const KEY = 'stardust_traces'
const MAX = 200

export function getTraces(): TraceRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function addTrace(record: TraceRecord): void {
  const traces = [record, ...getTraces()].slice(0, MAX)
  localStorage.setItem(KEY, JSON.stringify(traces))
}

export function getTotalStats(): {
  totalConversations: number
  totalTokens: number
  totalToolCalls: number
  totalDuration: number
  avgTokensPerConv: number
} {
  const traces = getTraces()
  const totalTokens = traces.reduce((sum, t) => sum + t.inputTokens + t.outputTokens + t.agentTokens, 0)
  const totalToolCalls = traces.reduce((sum, t) => sum + t.toolCalls, 0)
  const totalDuration = traces.reduce((sum, t) => sum + t.duration, 0)
  return {
    totalConversations: traces.length,
    totalTokens,
    totalToolCalls,
    totalDuration,
    avgTokensPerConv: traces.length > 0 ? Math.round(totalTokens / traces.length) : 0,
  }
}
