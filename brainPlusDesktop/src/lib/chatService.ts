import { streamText, generateText, stepCountIs, jsonSchema, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { getAIModels, type AIModelConfig } from './config'
import { getAllTools } from './mcpClient'
import { getInstalledSkills } from './skillService'
import type { SectionIndex } from '@/types/skill'
import { progressiveDisclosure, extractToolInfo } from './toolDisclosure'
import { createTrace, type TurnTrace } from './observability'

// ====== Agent 自带工具的事件类型 ======

export interface AskUserEvent {
  type: 'ask_user'
  question: string
  options?: string[]
  inputType: 'select' | 'input' | 'confirm'
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

let onAgentUIEvent: ((event: AgentUIEvent) => void) | null = null

export function setAgentUIHandler(handler: ((event: AgentUIEvent) => void) | null) {
  onAgentUIEvent = handler
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

/** 从 MCP 服务器获取工具 */
export async function getMCPSdkTools(autoMode?: boolean): Promise<Record<string, any>> {
  if (!window.electronAPI?.mcp) return {}

  try {
    const { tools } = await getAllTools()
    const sdkTools: Record<string, any> = {}

    for (const t of tools) {
      // 工具名只允许 [a-zA-Z0-9_-]，替换非法字符
      const safeName = (t.serverName + '__' + t.name).replace(/[^a-zA-Z0-9_-]/g, '_')
      // 确保 inputSchema 是合法的 JSON Schema (type: object)
      const schema = t.inputSchema && t.inputSchema.type === 'object'
        ? t.inputSchema
        : { type: 'object', properties: {}, additionalProperties: true }
      sdkTools[safeName] = {
        description: t.description || `MCP tool: ${t.name} (${t.serverName})`,
        inputSchema: jsonSchema(schema as any),
        execute: async (args: any) => {
          const { callTool } = await import('./mcpClient')
          const result = await callTool(t.serverId, t.name, args)
          return result.success
            ? JSON.stringify(result.content)
            : `Error: ${result.error}`
        },
      }
    }

    // 注册 read_skill 工具（支持 file/section/lines）
    const enabledSkills = getInstalledSkills().filter(s => s.enabled)
    if (enabledSkills.length > 0) {
      // 构建轻量索引：name → skill id + fileList + sections（不含文件内容）
      const skillIndex: Record<string, {
        id: string
        fileList: string[]
        sections: SectionIndex[]
      }> = {}
      for (const s of enabledSkills) {
        skillIndex[s.name] = { id: s.id, fileList: s.fileList, sections: s.sections }
      }

      // LRU 缓存：减少重复 IPC 调用
      const fileCache = new Map<string, string>() // key: "skillId::filePath"
      const MAX_CACHE_SIZE = 30

      async function loadContent(skillId: string, filePath: string): Promise<string | null> {
        const cacheKey = `${skillId}::${filePath}`
        if (fileCache.has(cacheKey)) return fileCache.get(cacheKey)!

        if (window.electronAPI?.skills) {
          const result = await window.electronAPI.skills.readFile(skillId, filePath)
          if (result.success && result.content != null) {
            // LRU 淘汰
            if (fileCache.size >= MAX_CACHE_SIZE) {
              const firstKey = fileCache.keys().next().value
              if (firstKey) fileCache.delete(firstKey)
            }
            fileCache.set(cacheKey, result.content)
            return result.content
          }
        }
        return null
      }

      sdkTools['read_skill'] = {
        description: '读取技能文件。section 传入段落标题跳转(利用索引)，lines 传入行范围。file 默认 SKILL.md。',
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            name: { type: 'string', description: '技能名称' },
            file: { type: 'string', description: '文件路径，如 "pptxgenjs.md"、"scripts/add_slide.py"。默认 SKILL.md' },
            section: { type: 'string', description: '段落标题（利用系统提示中列出的索引），如 "Quick Reference"、"Scripts"' },
            lines: { type: 'string', description: '行范围 "1-50"、"100-end"。不传且无 section 则返回全文' },
          },
          required: ['name'],
        }),
        execute: async ({ name, file, section, lines }: {
          name: string; file?: string; section?: string; lines?: string
        }) => {
          const skill = skillIndex[name]
          if (!skill) return `未找到技能 "${name}"。可用: ${Object.keys(skillIndex).join(', ')}`

          const filePath = file || 'SKILL.md'
          if (!skill.fileList.includes(filePath)) {
            return `未找到文件 "${filePath}"。可用文件: ${skill.fileList.join(', ')}`
          }

          // 按需从磁盘加载
          const content = await loadContent(skill.id, filePath)
          if (!content) return `无法读取文件 "${filePath}"（磁盘读取失败）`

          const allLines = content.split('\n')

          // section 查询：精确匹配优先，再 fallback 包含匹配
          if (section) {
            const lowerSection = section.toLowerCase()
            const sec = skill.sections.find(s => s.title.toLowerCase() === lowerSection)
              ?? skill.sections.find(s => s.title.toLowerCase().includes(lowerSection))
            if (sec) {
              const slice = allLines.slice(sec.startLine - 1, sec.endLine)
              return `## ${sec.title} (L${sec.startLine}-${sec.endLine})\n\`\`\`\n${slice.join('\n')}\n\`\`\``
            }
            return `未找到段落 "${section}"。可用段落: ${skill.sections.map(s => s.title).join(', ')}`
          }

          // lines 查询
          if (lines) {
            const match = lines.match(/^(\d+)(-(\d+|end))?$/i)
            if (!match) return `行格式错误: "${lines}"。例: "1-50"、"100-end"`
            const start = Math.max(1, parseInt(match[1])) - 1
            const end = !match[2] ? start + 1 : match[3]?.toLowerCase() === 'end' ? allLines.length : parseInt(match[3])
            return allLines.slice(start, end).join('\n')
          }

          return content
        },
      }
    }

    // ====== Agent 自带工具（始终可用） ======

    sdkTools['ask_user'] = {
      description:
        '向用户提问，获取决策、选择或确认。尽量一次问清楚所有需要的信息，减少往返。' +
        'inputType: "select" 让用户从 options 中选择一个；"input" 让用户自由输入；"confirm" 让用户确认/取消。' +
        '用于：技能需要用户决策时（如选择文件格式、确认操作）、信息不足需要补充时。' +
        '注意：收集到足够信息后立即开始执行任务，不要在信息完备时继续提问。',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          question: { type: 'string', description: '向用户提出的问题' },
          options: { type: 'array', items: { type: 'string' }, description: 'select 模式下的选项列表' },
          inputType: { type: 'string', enum: ['select', 'input', 'confirm'], description: '交互类型' },
        },
        required: ['question', 'inputType'],
      }),
      execute: async (args: { question: string; options?: string[]; inputType: string }) => {
        return new Promise<string>((resolve) => {
          if (onAgentUIEvent) {
            onAgentUIEvent({
              type: 'ask_user',
              question: args.question,
              options: args.options,
              inputType: (args.inputType as 'select' | 'input' | 'confirm') || 'confirm',
              resolve,
            })
          } else {
            resolve('用户不在线，请自行决策。' + (args.options ? ` 可选: ${args.options.join(', ')}` : ''))
          }
        })
      },
    }

    sdkTools['show_progress'] = {
      description:
        '显示长时间任务的进度。调用后告知用户当前进展，避免用户焦虑等待。' +
        'current/total 用于百分比进度，仅传 message 则显示不确定进度条。',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          message: { type: 'string', description: '进度描述，如 "正在生成 PPT 第 2/5 页..."' },
          current: { type: 'number', description: '当前进度（可选）' },
          total: { type: 'number', description: '总进度（可选）' },
        },
        required: ['message'],
      }),
      execute: async (args: { message: string; current?: number; total?: number }) => {
        onAgentUIEvent?.({
          type: 'show_progress',
          message: args.message,
          current: args.current,
          total: args.total,
        })
        return '进度已更新'
      },
    }

    sdkTools['notify_complete'] = {
      description:
        '通知用户任务完成。用于异步任务结束时告知结果。' +
        'message 为完成消息，result 为可选的结果摘要（如文件路径、数据统计）。',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          message: { type: 'string', description: '完成消息，如 "PPT 生成完成"' },
          result: { type: 'string', description: '结果摘要（可选），如文件路径' },
        },
        required: ['message'],
      }),
      execute: async (args: { message: string; result?: string }) => {
        onAgentUIEvent?.({
          type: 'notify_complete',
          message: args.message,
          result: args.result,
        })
        return '已通知用户: ' + args.message
      },
    }

    sdkTools['update_task_list'] = {
      description:
        '管理复杂任务的任务清单。首次调用时传入完整任务列表（全部 pending），' +
        '之后每次只需传入状态有变化的任务项即可增量更新。' +
        'id 为唯一标识，title 为任务描述，status: pending(待执行)/running(执行中)/done(已完成)/cancelled(取消)。' +
        '用法：接到复杂任务时先创建清单 → 开始某项时标记 running → 完成后标记 done。',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: '唯一标识，如 "1"/"2"/"3"' },
                title: { type: 'string', description: '任务描述' },
                status: { type: 'string', enum: ['pending', 'running', 'done', 'cancelled'], description: '任务状态' },
              },
              required: ['id', 'title', 'status'],
            },
          },
        },
        required: ['tasks'],
      }),
      execute: async (args: { tasks: Array<{ id: string; title: string; status: string }> }) => {
        onAgentUIEvent?.({
          type: 'update_task_list',
          tasks: args.tasks.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status as TaskItem['status'],
          })),
        })
        const done = args.tasks.filter(t => t.status === 'done').length
        const total = args.tasks.length
        return `任务清单已更新 (${done}/${total} 完成)`
      },
    }

    // delegate_task 仅在 Auto 模式时注册
    if (autoMode) {
      sdkTools['delegate_task'] = {
        description:
          '将复杂子任务委托给更合适的模型处理。' +
          'tier: "fast" 简单任务(分类/摘要/翻译), "balanced" 日常任务, "powerful" 复杂任务(推理/代码/长文)。' +
          'task 描述要具体，包含上下文。委托后你会收到子任务结果，继续基于结果回复用户。' +
          '典型用法：用户要求多步骤分析时，将每个子分析委托给 powerful 模型并行处理。',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          tier: { type: 'string', enum: ['fast', 'balanced', 'powerful'], description: '目标模型层级' },
          task: { type: 'string', description: '子任务描述（含必要上下文）' },
          reason: { type: 'string', description: '委托原因（可选）' },
        },
        required: ['tier', 'task'],
      }),
      execute: async (args: { tier: string; task: string }) => {
        try {
          const result = await delegateToModel(
            args.tier as 'fast' | 'balanced' | 'powerful',
            args.task,
          )
          return `[${result.modelName}]\n${result.result}`
        } catch (e: any) {
          return `委托失败: ${e.message}`
        }
      },
    }
    } // end if (autoMode)

    // 注册沙箱执行工具（始终可用，不依赖 Skills）
    if (window.electronAPI?.sandbox) {
      const wsPaths = window.electronAPI?.workspace
        ? await window.electronAPI.workspace.getPaths()
        : { output: '~/BrainPlus/workspace/output', input: '~/BrainPlus/workspace/input' }

      sdkTools['sandbox_execute_js'] = {
        description: `在安全沙箱执行 JS。可传 packages 参数安装 npm 包 (如 ["pptxgenjs"])。无需包时用 Worker 线程快速执行。`,
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            code: { type: 'string', description: 'JS/TS 代码' },
            packages: { type: 'array', items: { type: 'string' }, description: 'npm 包名列表' },
          },
          required: ['code'],
        }),
        execute: async ({ code, packages }: { code: string; packages?: string[] }) => {
          const res = await window.electronAPI!.sandbox.executeJS(code, packages)
          return res.success ? res.result : `JS sandbox error: ${res.error}`
        },
      }

      sdkTools['sandbox_execute_python'] = {
        description: `使用 Python 3/uv 执行。可传 packages 自动 pip install。输出到 ${wsPaths.output}/。有第三方库需求时优先用此工具。`,
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Python 代码' },
            packages: { type: 'array', items: { type: 'string' }, description: '需要的 pip 包列表（需 uv 支持）' },
          },
          required: ['code'],
        }),
        execute: async ({ code, packages }: { code: string; packages?: string[] }) => {
          const res = await window.electronAPI!.sandbox.executePython(code, packages)
          return res.success ? res.result : `Python sandbox error: ${res.error}`
        },
      }
    }

    // ====== 工作区工具（始终可用） ======
    if (window.electronAPI?.workspace && window.electronAPI?.fs) {
      const wsPaths = await window.electronAPI.workspace.getPaths()

      sdkTools['workspace_list_dir'] = {
        description:
          '列出工作区目录下的文件和子目录。depth: 递归深度(默认1, 最大3)。' +
          `根目录: ${wsPaths.root}`,
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            path: { type: 'string', description: '要列出的目录路径（相对于工作区根目录或绝对路径）' },
            depth: { type: 'number', description: '递归深度，1=只列当前层，默认1' },
          },
        }),
        execute: async (args: { path?: string; depth?: number }) => {
          const basePath = args.path || wsPaths.output
          const depth = Math.min(args.depth || 1, 3)
          const result = await listDirTree(basePath, depth, 0)
          return result || '(空目录)'
        },
      }

      sdkTools['workspace_read_file'] = {
        description:
          '读取工作区内的文件内容。自动识别文档格式并转换为文本。' +
          '支持 lines 参数分段读取（如 "1-100"/"100-end"）。' +
          `可读目录: ${wsPaths.output}, ${wsPaths.input}` +
          'PPT/Word/Excel/PDF 等文档会自动转换为 Markdown 后返回文本内容。',
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径（绝对路径）' },
            lines: { type: 'string', description: '行范围 "1-50" 或 "100-end"，不传则全读（仅对文本文件有效）' },
          },
          required: ['path'],
        }),
        execute: async (args: { path: string; lines?: string }) => {
          const api = window.electronAPI!.fs
          const ext = (args.path.split('.').pop() || '').toLowerCase()
          const needsConvert = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf'].includes(ext)

          // 文档自动转换
          if (needsConvert && window.electronAPI?.file) {
            const convertResult = await window.electronAPI.file.convert(args.path)
            if (convertResult.success && convertResult.content) {
              return convertResult.content.length > 50000
                ? convertResult.content.slice(0, 50000) + '\n...(内容过长已截断)'
                : convertResult.content
            }
            return `文档转换失败: ${convertResult.error || '未知错误'}。请尝试用 workspace_list_dir 确认文件存在。`
          }

          // 普通文本文件
          const readResult = await api.readFile(args.path)
          if (!readResult.success || readResult.content == null) {
            return `读取失败: ${readResult.error || '文件不存在'}`
          }
          if (!args.lines) {
            if (readResult.content.length > 50000) {
              return readResult.content.slice(0, 50000) + '\n...(内容过长已截断，请用 lines 参数分段读取)'
            }
            return readResult.content
          }
          const allLines = readResult.content.split('\n')
          const match = args.lines.match(/^(\d+)(-(\d+|end))?$/i)
          if (!match) return `行格式错误: "${args.lines}"。例: "1-50"、"100-end"`
          const start = Math.max(0, parseInt(match[1]) - 1)
          const end = !match[2] ? start + 1 : match[3]?.toLowerCase() === 'end' ? allLines.length : parseInt(match[3])
          return allLines.slice(start, end).join('\n')
        },
      }

      sdkTools['workspace_search'] = {
        description:
          '在工作区目录中搜索文件。支持通配符匹配文件名。' +
          `搜索范围: ${wsPaths.root}`,
        inputSchema: jsonSchema({
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词或通配符，如 "*.pptx"、"报告"' },
            path: { type: 'string', description: '搜索起始路径，默认整个工作区' },
          },
          required: ['query'],
        }),
        execute: async (args: { query: string; path?: string }) => {
          const basePath = args.path || wsPaths.root
          const results = await searchFiles(basePath, args.query)
          return results.length > 0 ? results.join('\n') : `未找到匹配 "${args.query}" 的文件`
        },
      }
    }

    return sdkTools
  } catch {
    return {}
  }
}

export interface ChatStreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'done'
  text?: string
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown
  trace?: TurnTrace
}

export async function chat(
  messages: ModelMessage[],
  onEvent?: (event: ChatStreamEvent) => void,
  opts?: { abortSignal?: AbortSignal; autoMode?: boolean; localModelId?: string },
) {
  // 本地模型路径
  if (opts?.localModelId) {
    return chatLocalViaIpc(messages, onEvent, opts.localModelId, opts?.abortSignal)
  }

  const model = getChatModel()
  if (!model) throw new Error('请先在设置中启用一个 AI 模型')

  const mcpTools = await getMCPSdkTools(opts?.autoMode)

  // 已启用的技能：只注入名称+描述+段落索引（不注入完整文件内容，节省 token）
  const enabledSkills = getInstalledSkills().filter(s => s.enabled)
  const skillInjection = enabledSkills.length > 0
    ? '已启用技能列表（使用 read_skill 工具按需读取详细内容）:\n' +
      enabledSkills.map(s => {
        const parts = [`- 名称: ${s.name}`, `描述: ${s.description}`]
        if (s.sections.length > 0) {
          parts.push(`段落索引: [${s.sections.map(sec => sec.title).join(', ')}]`)
        }
        parts.push(`文件: ${s.fileList.join(', ')}`)
        return parts.join('\n  ')
      }).join('\n')
    : undefined

  // Agent 行为规则（始终注入）
  const agentRules =
    '你是用户的工作助手。\n' +
    '1. 需要用户决策时调用 ask_user 工具，不要在文字中写问题等待回复。\n' +
    '2. 可用的资源和提示词优先用工具查询，不要猜测。\n' +
    '3. 长任务调用 show_progress，完成后调用 notify_complete。\n'

  const systemPrompt = [agentRules, skillInjection].filter(Boolean).join('\n\n') || undefined

  // 渐进式披露：根据用户输入筛选相关工具
  let filteredTools = mcpTools
  if (Object.keys(mcpTools).length > 8) {
    const lastMsg = messages[messages.length - 1]?.content
    const userText = typeof lastMsg === 'string' ? lastMsg : ''
    const toolInfo = extractToolInfo(mcpTools)
    const { tools: selected } = progressiveDisclosure(toolInfo, userText)
    filteredTools = Object.fromEntries(selected.map(name => [name, mcpTools[name]]))
    const excluded = Object.keys(mcpTools).length - selected.length
    if (excluded > 0) console.log(`[disclosure] ${Object.keys(mcpTools).length}→${selected.length} tools (excluded ${excluded})`)
  }

  const result = streamText({
    model: model.instance,
    system: systemPrompt || undefined,
    messages,
    tools: Object.keys(filteredTools).length > 0 ? filteredTools : undefined,
    stopWhen: stepCountIs(25),
    abortSignal: opts?.abortSignal,
  })

  // 可观测性追踪
  const trace = createTrace()
  messages.forEach(m => trace.addInput(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))

  let fullText = ''

  for await (const chunk of result.fullStream) {
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

// ====== 工作区工具辅助 ======

async function listDirTree(dirPath: string, maxDepth: number, currentDepth: number): Promise<string> {
  const api = window.electronAPI?.fs
  if (!api) return ''
  const listResult = await api.listDir(dirPath)
  if (!listResult.success || !listResult.files) return ''
  const indent = '  '.repeat(currentDepth)
  const lines: string[] = []

  for (const name of listResult.files) {
    if (name.startsWith('.')) continue
    const childPath = `${dirPath.replace(/\/+$/, '')}/${name}`
    const statResult = await api.stat(childPath)
    const isDir = statResult.success && statResult.stat?.isDirectory === true
    const prefix = isDir ? '[DIR]' : '[FILE]'
    lines.push(`${indent}${prefix} ${name}`)

    if (isDir && currentDepth < maxDepth - 1) {
      const sub = await listDirTree(childPath, maxDepth, currentDepth + 1)
      if (sub) lines.push(sub)
    }
  }
  return lines.join('\n')
}

async function searchFiles(basePath: string, query: string, results: string[] = []): Promise<string[]> {
  const api = window.electronAPI?.fs
  if (!api || results.length >= 50) return results
  const listResult = await api.listDir(basePath)
  if (!listResult.success || !listResult.files) return results

  for (const name of listResult.files) {
    if (name.startsWith('.')) continue
    const childPath = `${basePath.replace(/\/+$/, '')}/${name}`
    const statResult = await api.stat(childPath)

    if (name.toLowerCase().includes(query.toLowerCase())) results.push(childPath)
    if (statResult.success && statResult.stat?.isDirectory) {
      await searchFiles(childPath, query, results)
    }
  }
  return results
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
