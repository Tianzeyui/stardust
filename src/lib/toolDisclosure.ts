/**
 * 渐进式披露引擎 v2
 *
 * 架构变更（对齐 CC SearchExtraTools + ExecuteExtraTool 拉取模式）：
 * - 内置工具用显式白名单（chatService.ts isCoreTool），始终全量加载
 * - MCP 工具全部推迟，按需拉取：search_tools(query) → use_tool(name, params)
 * - 工具目录不再注入系统提示词
 *
 * 本模块保留：DisclosureResult 类型 + 打分/分词工具函数（供 search_tools 内部使用）
 */

export interface ToolScore {
  score: number
  matched: boolean
  reason?: string
}

export interface DisclosureResult {
  tools: string[]
  excluded: string[]
  scores: Record<string, ToolScore>
}

/** 中文 + 英文分词 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase()
  const tokens: string[] = []
  const words = lower.match(/[a-z0-9]+/g) || []
  tokens.push(...words)
  const chinese = lower.match(/[一-鿿]+/g) || []
  for (const seg of chinese) {
    tokens.push(seg)
    if (seg.length > 2) {
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.slice(i, i + 2))
      }
    }
  }
  return [...new Set(tokens)]
}

/** 关键词匹配打分（供 search_tools 使用） */
export function scoreByKeywords(query: string, name: string, description: string): number {
  const tokens = tokenize(query)
  const text = `${name} ${description}`.toLowerCase()
  let score = 0
  for (const kw of tokens) {
    if (kw.length < 2) continue
    const count = (text.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
    score += count
    if (name.toLowerCase().includes(kw)) score += count * 2
  }
  return score
}
