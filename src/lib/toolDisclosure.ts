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

export interface ToolScore {
  score: number
  matched: boolean        // 是否包含在本次请求中
  reason?: string         // 排除原因
}

export interface DisclosureResult {
  tools: string[]         // 选中的工具名列表
  excluded: string[]      // 被排除的工具名
  scores: Record<string, ToolScore>  // 每个工具的得分详情（供 UI 展示）
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
  // 中文整段作为关键词（如"修改页面"）
  for (const seg of chinese) {
    tokens.push(seg)  // 整段
    if (seg.length > 2) {
      // 双字滑动窗口
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.slice(i, i + 2))
      }
    }
  }
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
  const rawMin = opts?.minTools ?? 4
  const rawMax = opts?.maxTools ?? 12
  // minTools 不应超过 maxTools，否则 agent 工具会吃满配额
  const minTools = Math.min(rawMin, rawMax)
  const maxTools = rawMax

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
  const scores: Record<string, ToolScore> = {}
  let totalTokens = 0

  for (const item of scored) {
    let reason: string | undefined
    let matched = true

    if (selected.length >= maxTools) {
      reason = `超出最大工具数(${maxTools})`
      matched = false
    } else {
      const wouldExceed = totalTokens + item.estimatedTokens > maxTokens
      const belowMin = selected.length < minTools

      if (wouldExceed && !belowMin) {
        reason = '超出 Token 预算'
        matched = false
      }
    }

    if (matched) {
      selected.push(item.name)
      totalTokens += item.estimatedTokens
    } else {
      excluded.push(item.name)
    }

    scores[item.name] = { score: item.score, matched, reason }
  }

  return { tools: selected, excluded, scores }
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
  // 始终保留的内建工具（+100 分，不被渐进式披露筛掉）
  const alwaysKeep = new Set([
    // Agent 工具
    'ask_user', 'show_progress', 'notify_complete', 'update_task_list', 'delegate_task',
    // MCP 网关
    'mcp_list_resources', 'mcp_read_resource', 'mcp_list_prompts', 'mcp_get_prompt', 'enable_tool',
    // Skill
    'read_skill',
  ])

  const result: Record<string, { description: string; isAgent?: boolean; isSkill?: boolean; justCalled?: boolean }> = {}

  for (const [name, tool] of Object.entries(sdkTools)) {
    const isBuiltin = alwaysKeep.has(name)
      || name.startsWith('sandbox_')   // 沙箱工具始终可用
      || name.startsWith('workspace_') // 工作区工具始终可用
      || name.startsWith('agent__')    // A2A Agent 始终可用
    result[name] = {
      description: tool.description || name,
      isAgent: isBuiltin,
      isSkill: !isBuiltin && name === 'read_skill',
      justCalled: lastTools?.has(name) ?? false,
    }
  }

  return result
}
