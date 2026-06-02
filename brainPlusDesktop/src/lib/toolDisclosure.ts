/**
 * 渐进式披露引擎 — 根据用户输入筛选最相关的 Top-N 工具
 * 纯函数，零依赖，<1ms 延迟
 */

interface ToolInfo {
  name: string
  description: string
  // 额外权重
  isAgent?: boolean      // Agent 自带工具始终保留
  isSkill?: boolean      // 启用的 Skill 加分
  justCalled?: boolean   // 刚才调用过的加分
}

interface DisclosureResult {
  tools: string[]         // 选中的工具名列表
  excluded: string[]      // 被排除的工具名
}

/** 中文 + 英文分词 */
function tokenize(text: string): string[] {
  // 统一小写
  const lower = text.toLowerCase()
  // 提取中文字符、英文单词、数字
  const tokens: string[] = []
  // 英文/数字单词
  const words = lower.match(/[a-z0-9]+/g) || []
  tokens.push(...words)
  // 中文字符连续段
  const chinese = lower.match(/[一-鿿]+/g) || []
  // 中文按单字拆分（简单但有效）
  tokens.push(...chinese.flatMap(s => s.split('')))
  // 去重
  return [...new Set(tokens)]
}

/** 对单个工具打分 */
function scoreTool(tool: ToolInfo, keywords: string[]): number {
  let score = 0
  const text = `${tool.name} ${tool.description}`.toLowerCase()

  for (const kw of keywords) {
    if (kw.length < 2) continue // 跳过单字
    const count = (text.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
    score += count
    // 名称命中加权
    if (tool.name.toLowerCase().includes(kw)) score += count * 2
  }

  // 规则加权
  if (tool.isAgent) score += 100  // Agent 工具必留
  if (tool.justCalled) score += 10
  if (tool.isSkill) score += 5

  return score
}

/** 估算工具的 token 数（name + description + schema，粗略） */
function estimateTokens(tool: { name: string; description: string }): number {
  return Math.ceil((tool.name.length + tool.description.length) / 3)
}

/**
 * 渐进式披露 — 根据用户输入筛选 Top-N 工具
 *
 * @param tools      所有可用工具 (name → info)
 * @param userInput  用户最后一条消息
 * @param maxTokens  工具注入的最大 token 预算 (默认 3000)
 * @param minTools   最少保留工具数 (默认 4)
 * @param maxTools   最多保留工具数 (默认 12)
 */
export function progressiveDisclosure(
  tools: Record<string, { description: string; isAgent?: boolean; isSkill?: boolean; justCalled?: boolean }>,
  userInput: string,
  opts?: { maxTokens?: number; minTools?: number; maxTools?: number },
): DisclosureResult {
  const maxTokens = opts?.maxTokens ?? 3000
  const minTools = opts?.minTools ?? 4
  const maxTools = opts?.maxTools ?? 12

  const keywords = tokenize(userInput)

  // 打分
  const scored = Object.entries(tools).map(([name, info]) => ({
    name,
    score: scoreTool({ name, ...info }, keywords),
    estimatedTokens: estimateTokens({ name, description: info.description }),
    isAgent: info.isAgent,
  }))

  // 排序：分数高的在前
  scored.sort((a, b) => b.score - a.score)

  // Token 预算控制
  const selected: string[] = []
  const excluded: string[] = []
  let totalTokens = 0

  for (const item of scored) {
    if (selected.length >= maxTools) { excluded.push(item.name); continue }

    const wouldExceed = totalTokens + item.estimatedTokens > maxTokens
    const belowMin = selected.length < minTools

    if (wouldExceed && !belowMin) {
      excluded.push(item.name)
    } else {
      selected.push(item.name)
      totalTokens += item.estimatedTokens
    }
  }

  return { tools: selected, excluded }
}

/**
 * 从 AI SDK tools 对象中提取工具信息用于披露
 * @param sdkTools  AI SDK 格式的工具对象
 * @param lastTools 上一次调用的工具名列表 (可选)
 */
export function extractToolInfo(
  sdkTools: Record<string, any>,
  lastTools?: Set<string>,
): Record<string, { description: string; isAgent?: boolean; isSkill?: boolean; justCalled?: boolean }> {
  const agentTools = new Set(['ask_user', 'show_progress', 'notify_complete', 'update_task_list', 'delegate_task'])

  const result: Record<string, { description: string; isAgent?: boolean; isSkill?: boolean; justCalled?: boolean }> = {}

  for (const [name, tool] of Object.entries(sdkTools)) {
    result[name] = {
      description: tool.description || name,
      isAgent: agentTools.has(name),
      isSkill: name === 'read_skill',
      justCalled: lastTools?.has(name) ?? false,
    }
  }

  return result
}
