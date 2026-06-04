import { streamText, generateText, stepCountIs, jsonSchema, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { getAIModels, getDisclosureThreshold, getAgentMaxSteps, type AIModelConfig } from './config'
import { getInstalledSkills } from './skillService'
import { progressiveDisclosure, extractToolInfo, type DisclosureResult } from './toolDisclosure'
import { createTrace, estimateTokens, type TurnTrace } from './observability'
import { ContextWindowManager } from './contextWindowManager'

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

  switch (model.id) {
    case 'openai':
      return createOpenAI({ apiKey, baseURL })
    case 'anthropic':
      return createAnthropic({ apiKey, baseURL })
    case 'google':
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey, baseURL })
    case 'deepseek':
      return createDeepSeek({ apiKey, baseURL })
    default:
      return createOpenAI({ apiKey, baseURL: baseURL || undefined })
  }
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

const TIER_FAST = ['haiku', 'gpt-4o-mini', 'gemini-flash', 'deepseek-chat', 'flash', 'mini']
const TIER_POWERFUL = ['opus', 'gpt-4', 'gpt-4-turbo', 'gemini-pro', 'deepseek-v3', 'deepseek-v4', 'pro', 'ultra']

function pickModelByTier(
  provider: AIModelConfig,
  tier: 'fast' | 'balanced' | 'powerful',
): string {
  const models = provider.availableModels || []
  if (models.length === 0) return provider.selectedModel || ''

  if (tier === 'balanced') return provider.selectedModel || models[0]?.id || ''

  const checks = tier === 'fast' ? TIER_FAST : TIER_POWERFUL
  // 精确匹配
  for (const ck of checks) {
    const m = models.find(m => m.id === ck || m.id.includes(ck))
    if (m) return m.id
  }
  // 回退：fast 取第一个，powerful 取最后一个
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
      system: systemContext || '你是一个专业助手。请简洁准确地完成任务。',
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
    const { registerAgentTools: registerAgentDefs } = await import('./tools/agentRegistry')

    await registerMCPBusinessTools(tools)
    registerSkillTools(tools)
    registerAgentTools(tools, autoMode)
    registerMCPGatewayTools(tools)
    await registerSandboxTools(tools)
    await registerWorkspaceTools(tools)
    if (userId) await registerAgentDefs(tools, userId)
  } catch {
    return {}
  }
  return tools
}

export interface ChatStreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'done' | 'compression' | 'disclosure' | 'system-log' | 'agent-tool-call' | 'agent-tool-result' | 'agent-text-delta' | 'agent-done' | 'task-status'
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
}

export async function chat(
  messages: ModelMessage[],
  onEvent?: (event: ChatStreamEvent) => void,
  opts?: { abortSignal?: AbortSignal; autoMode?: boolean; localModelId?: string; forceCompression?: boolean; selectedTools?: Set<string> | null; memoryInjection?: string; userId?: string },
) {
  // 本地模型路径
  if (opts?.localModelId) {
    return chatLocalViaIpc(messages, onEvent, opts.localModelId, opts?.abortSignal)
  }

  const model = getChatModel()
  if (!model) throw new Error('请先在设置中启用一个 AI 模型')

  // 注入 Agent 流式回调，让 delegate_task 能把 Agent 执行过程"开窗"到主对话
  const { setAgentStreamHandler } = await import('./tools/agent')
  setAgentStreamHandler(onEvent as any || null)
  const mcpTools = await getMCPSdkTools(opts?.autoMode, opts?.userId)

  // 应用用户手动选择的 MCP 工具过滤
  let toolsForDisclosure = mcpTools
  if (opts?.selectedTools) {
    if (opts.selectedTools.size > 0) {
      toolsForDisclosure = Object.fromEntries(
        Object.entries(mcpTools).filter(([name]) => opts.selectedTools!.has(name))
      )
    } else {
      toolsForDisclosure = {}  // 用户明确选了空集 → 不发送 MCP 工具
    }
  }

  // 保存完整工具集引用（渐进式披露筛选后，enable_tool 需要访问完整集合）
  const fullToolSet = toolsForDisclosure

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

  // Agent 行为规则（始终注入）
  const agentRules =
    '你是用户的工作助手。\n' +
    '1. 调用 delegate_task 委托 Agent 后等待返回，把 Agent 返回的结果呈现给用户，不要重复执行。' +
    '2. 需要用户决策时调用 ask_user，长任务调用 show_progress。' +
    '3. 不要自己替代 Agent 执行任务。'

  // 渐进式披露：只筛选 MCP 业务工具（含 __ 分隔符），内建工具始终全部预加载
  const threshold = getDisclosureThreshold()
  const allNames = Object.keys(toolsForDisclosure)
  const builtinNames = allNames.filter(n => !n.includes('__') || n.startsWith('agent__'))
  const mcpNames = allNames.filter(n => n.includes('__') && !n.startsWith('agent__'))

  // 内建工具（沙箱/工作区/Agent/Skill/网关）始终保留，不参与筛选
  const builtinTools = Object.fromEntries(builtinNames.map(n => [n, toolsForDisclosure[n]]))
  let mcpFiltered = Object.fromEntries(mcpNames.map(n => [n, toolsForDisclosure[n]]))
  let disclosureResult: DisclosureResult

  if (mcpNames.length > threshold) {
    const lastMsg = messages[messages.length - 1]?.content
    const userText = typeof lastMsg === 'string' ? lastMsg : ''
    const toolInfo = extractToolInfo(mcpFiltered)
    disclosureResult = progressiveDisclosure(toolInfo, userText, { maxTools: threshold })
    mcpFiltered = Object.fromEntries(disclosureResult.tools.map(name => [name, mcpFiltered[name]]))
    const excluded = mcpNames.length - disclosureResult.tools.length
    if (excluded > 0) console.log(`[disclosure] MCP ${mcpNames.length}→${disclosureResult.tools.length} tools (excluded ${excluded}, threshold ${threshold}), built-in ${builtinNames.length} always loaded`)
  } else {
    disclosureResult = {
      tools: mcpNames,
      excluded: [],
      scores: Object.fromEntries(mcpNames.map(name => [name, { score: 0, matched: true }])),
    }
  }

  // 合并：内建工具始终全部保留 + 筛选后的 MCP 工具
  let filteredTools = { ...builtinTools, ...mcpFiltered }
  const builtinScores = Object.fromEntries(builtinNames.map(name => [name, { score: 100, matched: true }]))
  disclosureResult = { ...disclosureResult, scores: { ...builtinScores, ...disclosureResult.scores } }
  onEvent?.({ type: 'disclosure', disclosureResult })

  // 注册 enable_tool：AI 可通过它按需激活并调用任何在目录中但未预加载的工具
  if (Object.keys(fullToolSet).length > 0) {
    filteredTools = {
      ...filteredTools,
      enable_tool: {
        description: '按需激活并使用一个 MCP 工具。当需要的工具不在当前已加载列表中时调用此工具。查看系统提示中的"工具目录"获取所有可用工具的名称和功能描述。如果工具已加载，请直接调用而非通过此工具。',
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            name: { type: 'string', description: '要使用的工具名称（来自工具目录）' },
            args: { type: 'object', description: '传递给该工具的参数，根据工具目录中的功能描述合理构造' },
          },
          required: ['name'],
        }),
        execute: async ({ name, args }: { name: string; args?: any }) => {
          const tool = fullToolSet[name] as any
          if (!tool) return `工具 "${name}" 不在可用目录中。请检查工具目录中的工具名称。`

          // 检查参数：如果 args 为空且工具要求必填参数，返回 schema 引导 AI 重试
          const raw = tool._rawSchema as Record<string, any> | undefined
          const required = (raw?.required || []) as string[]
          const hasArgs = args && typeof args === 'object' && Object.keys(args).length > 0

          if (required.length > 0 && !hasArgs) {
            const props = raw?.properties as Record<string, any> | undefined
            const schemaHint = props
              ? '参数说明:\n' + Object.entries(props).map(([k, v]: [string, any]) =>
                  `  ${k} (${v.type || 'any'})${required.includes(k) ? ' *必填*' : ''}${v.description ? ': ' + v.description : ''}`
                ).join('\n')
              : '参数结构未知'
            return `工具 "${name}" 需要参数。请重新调用 enable_tool 并提供 args。\n${schemaHint}`
          }

          try {
            const result = await tool.execute(args || {})
            return result
          } catch (e: any) {
            // 如果执行失败且 args 为空，可能是参数缺失，提供 schema 引导
            if (!hasArgs && required.length > 0) {
              const props = raw?.properties as Record<string, any> | undefined
              const hint = props ? '。参数: ' + Object.keys(props).join(', ') : ''
              return `调用 ${name} 失败: ${e.message}${hint}。请用 enable_tool 重新调用并传入正确的 args。`
            }
            return `调用 ${name} 失败: ${e.message}`
          }
        },
      },
    }
  }

  // 工具目录：标注每个工具是预加载还是需激活（在披露之后生成，确保状态准确）
  // 工具目录：只列 MCP 业务工具（serverName__toolName 格式），排除沙箱/代理/网关等内建工具
  const preloadedNames = new Set(Object.keys(filteredTools))
  const mcpToolNames = Object.keys(fullToolSet).filter(n => n.includes('__') && !n.startsWith('agent__'))
  const toolCatalog = mcpToolNames.length > 0
    ? '可用 MCP 工具目录（共 ' + mcpToolNames.length + ' 个）:\n' +
      mcpToolNames.map(name => {
        const t = fullToolSet[name] as any
        const desc = (t?.description || name).replace(/\n/g, ' ')
        const tag = preloadedNames.has(name) ? '[预加载]' : '[需激活]'
        // 提取参数概要
        const raw = t?._rawSchema as Record<string, any> | undefined
        const props = raw?.properties as Record<string, any> | undefined
        const params = props ? Object.entries(props).map(([k, v]: [string, any]) => `${k}:${v.type || 'any'}`).join(', ') : ''
        const paramHint = params ? ` (参数: ${params.slice(0, 80)})` : ''
        return `- ${tag} ${name}: ${desc.slice(0, 100)}${paramHint}`
      }).join('\n') +
      '\n\n[预加载] 工具可直接调用。[需激活] 的 MCP 工具请调用 enable_tool(name, args)。'
    : undefined

  const systemPrompt = [agentRules, toolCatalog, skillInjection].filter(Boolean).join('\n\n') || undefined

  // 上下文窗口压缩
  const cwm = new ContextWindowManager()
  const contextWindow = cwm.getContextWindowForModel()

  // 估算消息之外的固定 token 开销：system prompt + 工具定义
  let overheadTokens = estimateTokens(systemPrompt || '')
  for (const [name, tool] of Object.entries(filteredTools)) {
    overheadTokens += estimateTokens(name + (tool as any).description || '')
  }
  const compressOpt = { ...(opts?.forceCompression ? { force: true } : {}), extraTokens: overheadTokens }

  const {
    messages: compressedMessages,
    wasCompressed,
    originalTokens,
    compressedTokens,
    summary,
  } = await cwm.compress(messages, contextWindow, compressOpt)

  if (wasCompressed) {
    onEvent?.({
      type: 'compression',
      originalTokens,
      compressedTokens,
      limit: contextWindow,
      summary,
    })
  }

  // 记忆 + 摘要注入 system prompt
  let finalSystem = systemPrompt || ''
  if (opts?.memoryInjection) {
    console.log('[memory] 本轮注入记忆:\n' + opts.memoryInjection)
    onEvent?.({ type: 'system-log', text: `🧠 记忆注入:\n${opts.memoryInjection}` })
    finalSystem = `${opts.memoryInjection}\n\n${finalSystem}`
  } else {
    console.log('[memory] 本轮无记忆注入（记忆为空或未开启）')
    onEvent?.({ type: 'system-log', text: '🧠 无记忆（对话中提取后将在此显示）' })
  }
  // 输出逐轮 system prompt 到控制台
  onEvent?.({ type: 'system-log', text: `📋 系统提示词 (${finalSystem.length}字):\n${finalSystem.slice(0, 500)}${finalSystem.length > 500 ? '...(截断)' : ''}` })
  if (summary) finalSystem = `${finalSystem}\n\n[对话历史摘要]\n${summary}`
  finalSystem = finalSystem.trim()

  const result = streamText({
    model: model.instance,
    system: finalSystem || undefined,
    messages: compressedMessages,
    tools: Object.keys(filteredTools).length > 0 ? filteredTools : undefined,
    stopWhen: stepCountIs(getAgentMaxSteps()),
    abortSignal: opts?.abortSignal,
  })

  // 可观测性追踪
  const trace = createTrace()
  compressedMessages.forEach(m => trace.addInput(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))

  let fullText = ''

  for await (const chunk of result.fullStream) {
    // 手动检查 abort——工具执行中 AI SDK 可能不会立即中断
    if (opts?.abortSignal?.aborted) {
      onEvent?.({ type: 'done' })
      break
    }
    if (chunk.type === 'text-delta') {
      fullText += chunk.text
      trace.addOutput(chunk.text)
      onEvent?.({ type: 'text-delta', text: chunk.text })
    } else if (chunk.type === 'tool-call') {
      const name = (chunk as any).toolName || 'unknown'
      trace.toolStart(name)
      onEvent?.({
        type: 'tool-call',
        toolName: name,
        toolInput: (chunk as any).args || (chunk as any).input,
      })
    } else if (chunk.type === 'tool-result') {
      const name = (chunk as any).toolName || 'unknown'
      const output = (chunk as any).result || (chunk as any).output || ''
      const ok = !String(output).startsWith('Error')
      trace.toolEnd(name, ok)
      onEvent?.({
        type: 'tool-result',
        toolName: name,
        toolOutput: (chunk as any).result || (chunk as any).output,
      })
    }
  }

  const turnTrace = trace.finish()
  onEvent?.({ type: 'done', trace: turnTrace })
  return fullText
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
