import { streamText, generateText, stepCountIs, jsonSchema, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { getAIModels, getAgentMaxSteps, type AIModelConfig } from './config'
import { getInstalledSkills } from './skillService'
import type { DisclosureResult } from './toolDisclosure'
import { createTrace, estimateTokens, type TurnTrace } from './observability'
import { ContextWindowManager, buildPostCompactInjection } from './contextWindowManager'
import { getRecentFiles, trackFileOp } from './fileTracker'

// ====== Agent 自带工具的事件类型 ======

/** 多问多答：单个问题定义 */
export interface AskQuestion {
  id: string          // 唯一标识
  label: string       // 问题文本
  inputType: 'input' | 'select' | 'confirm'
  options?: string[]  // select 模式下的候选项
  placeholder?: string
  required?: boolean
}

export interface AskUserEvent {
  type: 'ask_user'
  // 旧格式（单问题，向后兼容）
  question?: string
  options?: string[]
  inputType?: 'select' | 'input' | 'confirm'
  // 新格式（多问多答）
  title?: string
  questions?: AskQuestion[]
  resolve: (answer: string) => void
}

export interface ProgressEvent {
  type: 'show_progress'
  message: string
  current?: number
  total?: number
}

export interface NotifyCompleteEvent {
  type: 'notify_complete'
  message: string
  result?: string
}

export interface TaskItem {
  id: string
  title: string
  status: 'pending' | 'running' | 'done' | 'cancelled'
}

export interface TaskListEvent {
  type: 'update_task_list'
  tasks: TaskItem[]
}

export type AgentUIEvent = AskUserEvent | ProgressEvent | NotifyCompleteEvent | TaskListEvent

import { setAgentToolHandler } from './tools/agent'

let onAgentUIEvent: ((event: AgentUIEvent) => void) | null = null

export function setAgentUIHandler(handler: ((event: AgentUIEvent) => void) | null) {
  onAgentUIEvent = handler
  setAgentToolHandler(handler)
}

function getProvider(model: AIModelConfig) {
  const apiKey = model.apiKey || 'dummy'
  const baseURL = model.baseUrl || undefined

  // model.name 存的是 Provider 名称（如 'OpenAI', 'DeepSeek'），model.id 是唯一生成 ID
  const providerName = (model.name || model.id).toLowerCase()

  if (providerName === 'openai') {
    return createOpenAI({ apiKey, baseURL })
  }
  if (providerName === 'anthropic' || providerName === 'claude') {
    return createAnthropic({ apiKey, baseURL, headers: { 'anthropic-beta': 'interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,mid-conversation-system-2026-04-07' } })
  }
  if (providerName === 'google' || providerName === 'gemini') {
    return createGoogleGenerativeAI({ apiKey, baseURL })
  }
  if (providerName === 'deepseek' || providerName === '深度求索') {
    return createDeepSeek({ apiKey, baseURL })
  }

  // 兼容旧的 model.id 直接等于 provider 名称的情况
  const legacyId = model.id.toLowerCase()
  if (legacyId === 'deepseek') return createDeepSeek({ apiKey, baseURL })
  if (legacyId === 'anthropic') return createAnthropic({ apiKey, baseURL, headers: { 'anthropic-beta': 'interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,mid-conversation-system-2026-04-07' } })
  if (legacyId === 'google' || legacyId === 'gemini') return createGoogleGenerativeAI({ apiKey, baseURL })

  // 其他 OpenAI 兼容的 provider（qwen, openrouter, groq, together, mistral 等）
  return createOpenAI({ apiKey, baseURL })
}

export function getChatModel() {
  const models = getAIModels()
  const enabled = models.find((m) => m.enabled && m.apiKey)
  if (!enabled) return null

  const provider = getProvider(enabled)
  const modelId = enabled.selectedModel || 'gpt-4o'
  return { instance: provider(modelId), config: enabled }
}

// ====== 模型委托 ======

async function pickModelByTier(
  provider: AIModelConfig,
  tier: 'fast' | 'balanced' | 'powerful',
): Promise<string> {
  const models = provider.availableModels || []
  if (models.length === 0) return provider.selectedModel || ''
  if (tier === 'balanced') return provider.selectedModel || models[0]?.id || ''

  const { getModelTier } = await import('@/lib/config')
  const matched = models.filter(m => getModelTier(m.id) === tier)
  if (matched.length > 0) {
    return tier === 'fast' ? matched[0].id : matched[matched.length - 1].id
  }
  return tier === 'fast' ? models[0]?.id || '' : models[models.length - 1]?.id || ''
}

export async function delegateToModel(
  tier: 'fast' | 'balanced' | 'powerful',
  task: string,
  systemContext?: string,
): Promise<{ modelName: string; result: string }> {
  const models = getAIModels()
  const enabled = models.find((m) => m.enabled && m.apiKey)
  if (!enabled) throw new Error('没有可用的模型')

  const modelId = pickModelByTier(enabled, tier)
  const provider = getProvider(enabled)

  try {
    const result = await generateText({
      model: provider(modelId),
      system: systemContext || 'You are a coding agent. Use tools directly. Report in one sentence.',
      prompt: task,
    })
    return { modelName: `${enabled.displayName} / ${modelId}`, result: result.text }
  } catch (e: any) {
    throw new Error(`委托 ${tier} 模型失败: ${e.message}`)
  }
}

/** 从 MCP 服务器获取工具（各来源通过独立模块注册） */
export async function getMCPSdkTools(autoMode?: boolean, userId?: string): Promise<Record<string, any>> {
  const tools: Record<string, any> = {}
  try {
    const { registerMCPBusinessTools } = await import('./tools/mcpBusiness')
    const { registerSkillTools } = await import('./tools/skill')
    const { registerAgentTools } = await import('./tools/agent')
    const { registerMCPGatewayTools } = await import('./tools/mcpGateway')
    const { registerSandboxTools } = await import('./tools/sandbox')
    const { registerWorkspaceTools } = await import('./tools/workspace')
    const { registerTerminalTool } = await import('./tools/terminal')
    const { registerGitTools } = await import('./tools/git')
    const { registerWebFetchTool } = await import('./tools/webFetch')
    const { registerWebSearchTool } = await import('./tools/webSearch')
    const { registerAgentTools: registerAgentDefs } = await import('./tools/agentRegistry')
    const { registerVerifyTools } = await import('./tools/verify')

    await registerMCPBusinessTools(tools)
    registerSkillTools(tools)
    registerAgentTools(tools, autoMode)
    registerMCPGatewayTools(tools)
    registerVerifyTools(tools)
    await registerSandboxTools(tools)
    await registerWorkspaceTools(tools)
    registerTerminalTool(tools)
    registerGitTools(tools)
    registerWebFetchTool(tools)
    registerWebSearchTool(tools)
    if (userId) await registerAgentDefs(tools, userId)
    // 注入插件 AI 工具
    const { pluginSystem } = await import('./pluginSystem')
    Object.assign(tools, pluginSystem.getPluginTools())
  } catch {
    return {}
  }
  return tools
}

import type { TerminalStatus } from '@/types/chat'

export interface TerminalUIEvent {
  type: 'terminal_created' | 'terminal_confirm' | 'terminal_updated'
  terminal: TerminalStatus
}

let terminalUIHandler: ((event: TerminalUIEvent) => void) | null = null
export function setTerminalUIHandler(handler: ((event: TerminalUIEvent) => void) | null) {
  terminalUIHandler = handler
}
export function getTerminalUIHandler() { return terminalUIHandler }

import type { FileOpRequest } from './fileOpManager'

export interface FileOpUIEvent {
  type: 'fileop_created' | 'fileop_updated'
  fileOp: FileOpRequest
}

let fileOpUIHandler: ((event: FileOpUIEvent) => void) | null = null
export function setFileOpUIHandler(handler: ((event: FileOpUIEvent) => void) | null) {
  fileOpUIHandler = handler
}
export function getFileOpUIHandler() { return fileOpUIHandler }

export interface ChatStreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'done' | 'compression' | 'disclosure' | 'system-log' | 'agent-tool-call' | 'agent-tool-result' | 'agent-text-delta' | 'agent-done' | 'task-status' | 'reasoning-delta' | 'agent-reasoning-delta'
  text?: string
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown
  trace?: TurnTrace
  // compression 事件字段
  originalTokens?: number
  compressedTokens?: number
  limit?: number
  summary?: string
  // agent 事件字段
  agentName?: string
  // task 事件字段
  taskStatus?: string; taskId?: string; taskAgentName?: string
  // disclosure 事件字段
  disclosureResult?: DisclosureResult
  // reasoning 事件字段
  reasoningId?: string
}

let _lastCompressionSummary = ''
let _lastRulesSummary: string | undefined  // 压缩时保存的规则摘要

/** 暴露文件追踪（供工具调用，实际实现在 fileTracker.ts 避免循环依赖） */
export { trackFileOp } from './fileTracker'

export async function chat(
  messages: ModelMessage[],
  onEvent?: (event: ChatStreamEvent) => void,
  opts?: { abortSignal?: AbortSignal; autoMode?: boolean; codingMode?: boolean; localModelId?: string; forceCompression?: boolean; memoryInjection?: string; userId?: string; modelOverride?: { provider: string; modelId: string } },
) {
  // 本地模型路径
  if (opts?.localModelId) {
    return chatLocalViaIpc(messages, onEvent, opts.localModelId, opts?.abortSignal)
  }

  let model = getChatModel()
  if (!model) throw new Error('请先在设置中启用一个 AI 模型')
  const primaryModel = model  // 固定引用，TS 能推断非 null
  // 动态路由：覆盖模型选择
  if (opts?.modelOverride) {
    model = { ...model, selectedModel: opts.modelOverride.modelId }
  }

  // 注入 Agent 流式回调，让 delegate_task 能把 Agent 执行过程"开窗"到主对话
  const { setAgentStreamHandler } = await import('./tools/agent')
  setAgentStreamHandler(onEvent as any || null)

  // 两阶段调用：所有请求先 fast 无工具判断意图
  if (opts?.autoMode) {
    const lastMsg = messages[messages.length - 1]?.content
    const userText = typeof lastMsg === 'string' ? lastMsg : ''
    // 明显的编码操作 → 直接走工具，不预检
    const codeHints = [
      // 英文
      'fix', 'edit', 'change', 'write', 'create', 'implement', 'refactor', 'debug',
      'error', 'test', 'build', 'install', 'deploy', 'review', 'search', 'find',
      'check', 'look', 'examine', 'analyze', 'add', 'remove', 'delete', 'update',
      'modify', 'rename', 'move', 'run', 'commit', 'push', 'pull', 'merge', 'diff',
      // 中文
      '改', '修', '写', '实现', '创建', '重构', 'bug',
      '分析', '看', '查', '找', '搜索', '加', '删', '改', '帮',
      '运行', '测试', '提交', '部署', '安装', '编译', '调试',
    ]
    const needsTools = codeHints.some(w => userText.toLowerCase().includes(w))

    // 非明显编码 → fast 模型预检
    if (!needsTools) {
      try {
        const { delegateToModel } = await import('./chatService')
        const fastReply = await delegateToModel('fast', userText, agentRules)
        if (fastReply?.result) {
          // 如果 fast 模型没有建议调工具 → 直接返回
          const toolKeywords = ['workspace_', 'run_terminal', 'git_', 'web_search', 'web_fetch', 'read_skill', 'delegate_task']
          const suggestsTools = toolKeywords.some(w => fastReply.result.includes(w))
          if (!suggestsTools) {
            onEvent?.({ type: 'text-delta', text: fastReply.result })
            onEvent?.({ type: 'done' })
            return fastReply.result
          }
        }
      } catch { /* 失败继续正常流程 */ }
    }
  }

  const mcpTools = await getMCPSdkTools(opts?.autoMode, opts?.userId)

  const toolsForDisclosure = mcpTools

  // Skills 渐进式披露（参考 OpenClaw 三层架构）
  // Level 1: 元数据（name + description），~100 tokens/skill，注入系统提示
  // Level 2: 完整 SKILL.md，通过 read_skill 按需加载
  // Level 3: 附属文件（references/scripts），通过 read_skill(name, file) 按需读取
  const enabledSkills = getInstalledSkills().filter(s => s.enabled)
  let skillInjection: string | undefined
  if (enabledSkills.length > 0) {
    if (enabledSkills.length <= 10) {
      // Tier 1: 完整格式 name + description
      skillInjection = '已启用技能（使用 read_skill 工具按需读取详细内容）:\n' +
        enabledSkills.map(s => `- ${s.name}: ${s.description}`).join('\n')
    } else if (enabledSkills.length <= 30) {
      // Tier 2: 紧凑格式 name only
      skillInjection = `已启用 ${enabledSkills.length} 个技能（紧凑模式，使用 read_skill 查看详情）:\n` +
        enabledSkills.map(s => `- ${s.name}`).join('\n')
    } else {
      // Tier 3: 极简格式，仅提示数量
      skillInjection = `已启用 ${enabledSkills.length} 个技能。使用 read_skill("技能名") 查看具体技能详情。`
    }
  }

  // Agent 行为规则：根据模式选编码/对话提示词
  const { getPromptCode, getPromptChat } = await import('@/lib/config')
  let agentRules = opts?.codingMode === false ? getPromptChat() : getPromptCode()

  // 多层规则发现：从项目根向上遍历，读取 brainPlusRules.md + .brainplus/rules/
  let projectInstructions: string | undefined
  let conditionalRules: Array<{ glob: string; content: string; path: string }> = []
  try {
    const wsApi = (window as any).electronAPI?.workspace
    if (wsApi) {
      let wsRoot = ''
      try { const info = await wsApi.getPaths(); wsRoot = info.root } catch {}
      if (wsRoot) {
        const { discoverRules, matchConditionalRules } = await import('./projectRules')
        const discovered = await discoverRules(wsRoot)
        if (discovered.unconditional) {
          projectInstructions = discovered.unconditional
        }
        conditionalRules = discovered.conditional
        if (discovered.files.length > 0) {
          console.log(`[projectRules] 发现 ${discovered.files.length} 个规则文件: ${discovered.files.join(', ')}`)
        }
      }
    }
  } catch {}

  // 条件规则匹配：基于最近操作的文件，注入匹配的 .brainplus/rules/*.md
  if (conditionalRules.length > 0) {
    const { getRecentFiles } = await import('./fileTracker')
    const recentFiles = getRecentFiles()
    if (recentFiles.length > 0) {
      const { matchConditionalRules } = await import('./projectRules')
      const conditionalInjection = matchConditionalRules(conditionalRules, recentFiles)
      if (conditionalInjection) {
        projectInstructions = projectInstructions
          ? projectInstructions + '\n\n' + conditionalInjection
          : conditionalInjection
      }
    }
  }

  // ====== 渐进式披露 v2：对齐 CC SearchExtraTools + ExecuteExtraTool 拉取模式 ======

  // 保存完整工具集（供 search_tools / use_tool 使用）
  const fullToolSet = toolsForDisclosure

  // Phase 1: 内置工具显式白名单——不靠命名猜测，声明即内置
  const CORE_TOOL_PREFIXES = [
    'workspace_', 'git_', 'sandbox_',                          // 文件/Git/沙箱
    'run_terminal', 'check_terminal', 'run_terminal_input',    // 终端
    'web_fetch', 'web_search', 'search_bing', 'search_duckduckgo', // 网络
    'mcp_list', 'mcp_read', 'mcp_get',                          // MCP 网关
    'ask_user', 'show_progress', 'notify_complete', 'update_task_list', // Agent UI
    'delegate_task', 'delegate_batch', 'delegate_chain',       // Agent 路由
    'agent__', 'plugin__',                                     // A2A Agent + 插件
    'read_skill', 'search_tools', 'use_tool',                  // 技能 + 按需激活
  ]
  const isCoreTool = (name: string) => CORE_TOOL_PREFIXES.some(p => name.startsWith(p))

  const allNames = Object.keys(toolsForDisclosure)
  const builtinNames = allNames.filter(isCoreTool)
  const mcpNames = allNames.filter(n => !isCoreTool(n))

  // 内置工具始终全量加载，MCP 工具全部推迟（按需拉取）
  let filteredTools = Object.fromEntries(builtinNames.map(n => [n, toolsForDisclosure[n]]))
  const disclosureResult: DisclosureResult = {
    tools: builtinNames,
    excluded: mcpNames,
    scores: Object.fromEntries([
      ...builtinNames.map(n => [n, { score: 100, matched: true }] as const),
      ...mcpNames.map(n => [n, { score: 0, matched: false, reason: 'MCP工具按需拉取，使用 search_tools 查找' }] as const),
    ]),
  }
  onEvent?.({ type: 'disclosure', disclosureResult })

  // Phase 2: search_tools + use_tool —— 对齐 CC 拉取模式
  filteredTools = {
    ...filteredTools,
    search_tools: {
      description:
        '搜索可用的 MCP 工具。当你需要的能力不在当前工具列表中时，描述你的需求，系统会返回匹配的工具名和功能描述。找到后用 use_tool 调用。' +
        '不要在请求里尝试猜工具名——描述你需要做什么即可。' +
        `当前可用 MCP 工具 ${mcpNames.length} 个。`,
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          query: { type: 'string', description: '描述你需要什么能力，例如"查询PostgreSQL数据库"、"调用Slack发送消息"、"操作Kubernetes集群"' },
        },
        required: ['query'],
      }),
      execute: async ({ query }: { query: string }) => {
        if (mcpNames.length === 0) return '当前没有可用的 MCP 工具。'
        // 关键词打分：对每个 MCP 工具做匹配
        const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1)
        const scored = mcpNames.map(name => {
          const tool = fullToolSet[name] as any
          const text = `${name} ${tool?.description || ''}`.toLowerCase()
          let score = 0
          for (const t of tokens) {
            if (text.includes(t)) score += name.toLowerCase().includes(t) ? 2 : 1
          }
          return { name, description: tool?.description || '', score }
        })
        scored.sort((a, b) => b.score - a.score)
        const top = scored.filter(s => s.score > 0).slice(0, 8)
        if (top.length === 0) return `未找到匹配 "${query}" 的 MCP 工具。试试更通用的关键词，或描述具体的操作目标。`
        return '匹配的 MCP 工具:\n' + top.map((t, i) =>
          `${i + 1}. ${t.name}: ${t.description.slice(0, 120)}`
        ).join('\n')
      },
    },
    use_tool: {
      description:
        '调用通过 search_tools 发现的 MCP 工具。传入工具名和参数即可执行。如果工具需要参数但你没传，系统会返回参数提示。',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          tool_name: { type: 'string', description: '工具名称（search_tools 返回结果中列出的名称）' },
          params: { type: 'object', description: '传递给该工具的参数' },
        },
        required: ['tool_name'],
      }),
      execute: async ({ tool_name, params }: { tool_name: string; params?: Record<string, unknown> }) => {
        const tool = fullToolSet[tool_name] as any
        if (!tool) return `工具 "${tool_name}" 不存在。请先调用 search_tools 查找可用工具。`

        // 检查必填参数
        const raw = tool._rawSchema as Record<string, any> | undefined
        const required = (raw?.required || []) as string[]
        const hasArgs = params && typeof params === 'object' && Object.keys(params).length > 0

        if (required.length > 0 && !hasArgs) {
          const props = raw?.properties as Record<string, any> | undefined
          const schemaHint = props
            ? '参数说明:\n' + Object.entries(props).map(([k, v]: [string, any]) =>
                `  ${k} (${v.type || 'any'})${required.includes(k) ? ' *必填*' : ''}${v.description ? ': ' + v.description : ''}`
              ).join('\n')
            : '参数结构未知'
          return `工具 "${tool_name}" 需要参数。\n${schemaHint}\n\n请重新调用 use_tool 并提供 params。`
        }

        try {
          return await tool.execute(params || {})
        } catch (e: any) {
          if (!hasArgs && required.length > 0) {
            const props = raw?.properties as Record<string, any> | undefined
            const hint = props ? '。参数: ' + Object.keys(props).join(', ') : ''
            return `调用 ${tool_name} 失败: ${e.message}${hint}`
          }
          return `调用 ${tool_name} 失败: ${e.message}`
        }
      },
    },
  }

  // Phase 4: 不再注入工具目录——search_tools 替代了它的作用
  const systemPrompt = [agentRules, skillInjection].filter(Boolean).join('\n\n') || undefined

  // 上下文窗口压缩（摘要堆叠：传递上轮摘要）
  const cwm = new ContextWindowManager()
  const contextWindow = cwm.getContextWindowForModel()

  let overheadTokens = estimateTokens(systemPrompt || '')
  for (const [name, tool] of Object.entries(filteredTools)) {
    overheadTokens += estimateTokens(name + (tool as any).description || '')
  }
  const compressOpt = {
    ...(opts?.forceCompression ? { force: true } : {}),
    extraTokens: overheadTokens,
    previousSummary: _lastCompressionSummary || undefined,
  }

  const {
    messages: compressedMessages,
    wasCompressed,
    originalTokens,
    compressedTokens,
    summary,
  } = await cwm.compress(messages, contextWindow, compressOpt)

  if (wasCompressed) {
    _lastCompressionSummary = summary || ''
    // 压缩后保存当前上下文供下次恢复
    _lastRulesSummary = projectInstructions || undefined
    onEvent?.({
      type: 'compression',
      originalTokens,
      compressedTokens,
      limit: contextWindow,
      summary,
    })
  }

  // 压缩后恢复注入：重新注入最近操作的文件和项目规则
  const postCompactInjection = wasCompressed
    ? await buildPostCompactInjection(getRecentFiles(), _lastRulesSummary)
    : null

  // 动静分离 system prompt（静态部分可缓存）
  const staticPart = (systemPrompt || '') + (summary ? `\n\n[Conversation summary]\n${summary}` : '')
  const dynamicPart = opts?.memoryInjection || ''

  if (opts?.memoryInjection) {
    console.log('[memory] 本轮注入记忆:\n' + opts.memoryInjection)
    onEvent?.({ type: 'system-log', text: `🧠 记忆注入:\n${opts.memoryInjection}` })
  } else {
    onEvent?.({ type: 'system-log', text: '🧠 无记忆（对话中提取后将在此显示）' })
  }

  // 动静分离：静态在前，动态追加。缓存通过beta header处理
  let finalSystem = staticPart.trim()
  if (dynamicPart.trim()) finalSystem += '\n\n' + dynamicPart.trim()
  if (postCompactInjection) finalSystem += '\n\n' + postCompactInjection

  onEvent?.({ type: 'system-log', text: `📋 系统提示词 (${finalSystem.length}字):\n${finalSystem.slice(0, 500)}${finalSystem.length > 500 ? '...(截断)' : ''}` })

  // user message 注入：rules.md + 日期上下文
  const contextMessages: Array<{ role: 'user'; content: string }> = []

  if (projectInstructions) {
    contextMessages.push({
      role: 'user',
      content: `<project-instructions>\n${projectInstructions}\n</project-instructions>`,
    })
  }

  contextMessages.push({
    role: 'user',
    content: `<system-reminder>\nAs you answer the user's questions, you can use the following context:\n# currentDate\nToday's date is ${new Date().toLocaleDateString('en-CA')}.\n\nIMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.\n</system-reminder>`,
  })

  let currentMessages = [...contextMessages, ...compressedMessages]

  // ====== 恢复循环：max_output_tokens 升级 + 模型回退 ======
  const MAX_ESCALATIONS = 2
  let maxOutputTokens: number | undefined = undefined  // 首次不设限制，用模型默认
  let escalationCount = 0
  let hasAttemptedFallback = false
  let currentModel = primaryModel
  let finalUsage: any = null  // 最后一次成功调用的 usage

  let fullText = ''

  while (true) {
    const result = streamText({
      model: currentModel.instance,
      system: finalSystem || undefined,
      messages: currentMessages,
      tools: Object.keys(filteredTools).length > 0 ? filteredTools : undefined,
      stopWhen: stepCountIs(getAgentMaxSteps()),
      abortSignal: opts?.abortSignal,
      temperature: 0.3,
      ...(maxOutputTokens != null ? { maxOutputTokens } as any : {}),
    })

    // 可观测性追踪
    const trace = createTrace()
    currentMessages.forEach(m => trace.addInput(typeof m.content === 'string' ? (m.content as string) : JSON.stringify(m.content)))

    let streamError: Error | null = null
    const assistantMsgs: Array<{ role: 'assistant'; content: string }> = []

    try {
      for await (const chunk of result.fullStream) {
        if (opts?.abortSignal?.aborted) break
        if (chunk.type === 'reasoning-delta') {
          onEvent?.({ type: 'reasoning-delta', text: (chunk as any).text || (chunk as any).delta || '', reasoningId: (chunk as any).id })
        } else if (chunk.type === 'text-delta') {
          fullText += chunk.text
          trace.addOutput(chunk.text)
          onEvent?.({ type: 'text-delta', text: chunk.text })
        } else if (chunk.type === 'tool-call') {
          const name = (chunk as any).toolName || 'unknown'
          trace.toolStart(name)
          onEvent?.({ type: 'tool-call', toolName: name, toolInput: (chunk as any).args || (chunk as any).input })
        } else if (chunk.type === 'tool-result') {
          const name = (chunk as any).toolName || 'unknown'
          const output = (chunk as any).result || (chunk as any).output || ''
          const ok = !String(output).startsWith('Error')
          trace.toolEnd(name, ok)
          onEvent?.({ type: 'tool-result', toolName: name, toolOutput: (chunk as any).result || (chunk as any).output })
        }
      }
    } catch (e: any) {
      streamError = e
      const errMsg = String(e.message || e)

      // === 上下文长度错误 → 响应式压缩重试 ===
      if (
        errMsg.includes('prompt') && (errMsg.includes('too long') || errMsg.includes('length') || errMsg.includes('exceeded')) ||
        errMsg.includes('context_length_exceeded') ||
        errMsg.includes('400') && errMsg.includes('token')
      ) {
        const recovered = await tryReactiveCompact(currentMessages.slice(contextMessages.length), cwm, contextWindow)
        if (recovered) {
          onEvent?.({ type: 'system-log', text: '⚠️ 上下文过长，已自动压缩后重试...' })
          currentMessages = [...contextMessages, ...recovered]
          continue  // 回到循环顶部重试
        }
        onEvent?.({ type: 'system-log', text: '⚠️ 上下文过长且无法自动压缩。请减少上下文后重试。' })
        break
      }

      // === 模型错误 → 回退到备选模型 ===
      if (!hasAttemptedFallback) {
        const fallbackModel = await pickFallbackModel(currentModel)
        if (fallbackModel) {
          hasAttemptedFallback = true
          currentModel = fallbackModel
          onEvent?.({ type: 'system-log', text: `⚠️ 模型 ${currentModel.config.displayName || currentModel.config.name} 调用失败，回退到 ${fallbackModel.config.displayName || fallbackModel.config.name}...` })
          continue  // 回到循环顶部，用回退模型重试
        }
      }

      // 无法恢复 → 退出
      break
    }

    // ====== 流式完成，检查输出是否被截断 ======
    if (!streamError) {
      let finishReason = ''
      try {
        finishReason = (await (result as any).finishReason) || ''
      } catch {}

      const isTruncated =
        finishReason === 'length' ||
        finishReason === 'max_tokens'

      if (isTruncated && escalationCount < MAX_ESCALATIONS && !opts?.abortSignal?.aborted) {
        escalationCount++
        // 首次截断设置 32k，之后每次翻倍
        maxOutputTokens = maxOutputTokens == null ? 32000 : maxOutputTokens * 2
        onEvent?.({ type: 'system-log', text: `⚠️ 输出被截断 (finishReason=${finishReason})，升级至 ${maxOutputTokens} tokens 重试 (#${escalationCount})...` })
        // 注入恢复消息，保留已输出的文本
        assistantMsgs.push({ role: 'assistant', content: fullText.slice(-500) }) // 最后 500 字符作为上下文
        currentMessages = [
          ...currentMessages,
          ...assistantMsgs,
          { role: 'user' as const, content: 'Output truncated. Resume directly — no recap, no apology. Pick up mid-thought where cut off. Break remaining work into smaller pieces.' },
        ]
        continue  // 回到循环顶部重试
      }

      // 捕获真实 API usage
      try {
        const usage = await result.usage
        if (usage) finalUsage = usage
      } catch {}
    }

    break  // 正常完成或无法恢复 → 退出循环
  }

  // ====== 后处理：usage 回传 ======
  if (finalUsage) {
    cwm.updateRealTokens(
      finalUsage.inputTokens || finalUsage.promptTokens || 0,
      finalUsage.outputTokens || finalUsage.completionTokens || 0,
    )
  }
  const traceBuilder = createTrace()
  const turnTrace = traceBuilder.finish()
  if (finalUsage) {
    turnTrace.inputTokens = finalUsage.inputTokens || finalUsage.promptTokens || 0
    turnTrace.outputTokens = finalUsage.outputTokens || finalUsage.completionTokens || 0
    const cached = finalUsage.cachedInputTokens || finalUsage.cacheReadInputTokens || 0
    if (cached > 0) turnTrace.cachedInputTokens = cached
  }
  onEvent?.({ type: 'done', trace: turnTrace })
  return fullText
}

/** 选择一个备选模型用于回退 */
async function pickFallbackModel(current: { config: AIModelConfig }): Promise<{ instance: any; config: AIModelConfig } | null> {
  try {
    const { getAIModels } = await import('./config')
    const all = getAIModels()
    const enabled = all.filter(m => m.enabled && m.apiKey)
    if (enabled.length <= 1) return null
    // 找和当前模型不同的第一个可用模型
    const cfg = enabled.find(m => m.selectedModel !== current.config.selectedModel)
    if (!cfg) return null
    const provider = getProvider(cfg)
    return { instance: provider(cfg.selectedModel), config: cfg }
  } catch {
    return null
  }
}

/**
 * 响应式压缩：在 API 返回 context length 错误时调用
 * 返回重试用的消息数组，或 null 表示无法恢复
 */
async function tryReactiveCompact(
  messages: ModelMessage[],
  cwm: ContextWindowManager,
  contextWindow: number,
): Promise<ModelMessage[] | null> {
  try {
    const result = await cwm.reactiveCompact(messages, contextWindow, _lastCompressionSummary || undefined)
    if (result.wasCompressed) {
      _lastCompressionSummary = result.summary || ''
      return result.messages
    }
  } catch {}
  return null
}


// ====== 本地模型推理（通过 IPC） ======

async function chatLocalViaIpc(
  messages: ModelMessage[],
  onEvent?: (event: ChatStreamEvent) => void,
  modelId?: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  console.warn('[localInference] 开始，modelId:', modelId, 'messages:', messages.length)
  if (!modelId) throw new Error('未指定本地模型')
  const api = window.electronAPI?.model
  if (!api) throw new Error('本地模型 API 不可用')

  // 转成简单消息格式
  const msgs = messages.map(m => ({ role: m.role as string, content: typeof m.content === 'string' ? m.content : '' }))

  // 发起流式聊天
  api.chat(modelId, msgs)

  let fullText = ''

  return new Promise((resolve, reject) => {
    const unsubChunk = api.onChatChunk(({ text }) => {
      console.warn('[localInference] chunk:', text.slice(0, 50))
      fullText += text
      onEvent?.({ type: 'text-delta', text })
    })
    const unsubDone = api.onChatDone(() => {
      console.warn('[localInference] done, fullText:', fullText.length)
      unsubChunk()
      unsubDone()
      unsubErr()
      onEvent?.({ type: 'done' })
      resolve(fullText)
    })
    const unsubErr = api.onChatError(({ error }) => {
      console.warn('[localInference] error:', error)
      unsubChunk()
      unsubDone()
      unsubErr()
      reject(new Error(error))
    })

    // 支持打断
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        console.warn('[localInference] aborted')
        unsubChunk(); unsubDone(); unsubErr()
        reject(new DOMException('用户中断', 'AbortError'))
      }, { once: true })
    }
  })
}
