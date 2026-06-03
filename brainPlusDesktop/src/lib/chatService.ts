import { streamText, generateText, stepCountIs, jsonSchema, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { getAIModels, getDisclosureThreshold, getAgentMaxSteps, type AIModelConfig } from './config'
import { getAllTools } from './mcpClient'
import { getInstalledSkills } from './skillService'
import type { SectionIndex } from '@/types/skill'
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
      const hasValidSchema = t.inputSchema && (t.inputSchema as any).type === 'object'
      const schema = hasValidSchema
        ? t.inputSchema
        : { type: 'object', properties: {}, additionalProperties: true }
      if (!hasValidSchema) {
        console.warn(`[getMCPSdkTools] tool "${safeName}" has empty/invalid inputSchema, using fallback. Raw:`, JSON.stringify(t.inputSchema).slice(0, 200))
      }
      sdkTools[safeName] = {
        description: t.description || `MCP tool: ${t.name} (${t.serverName})`,
        inputSchema: jsonSchema(schema as any),
        _rawSchema: schema,  // 保留原始 inputSchema 用于 enable_tool 参数发现
        execute: async (args: any) => {
          const { callTool } = await import('./mcpClient')
          const result = await callTool(t.serverId, t.name, args)
          if (!result.success) return `Error: ${result.error}`
          // 从 MCP content 数组中提取实际文本，避免返回原始 JSON 包装
          const content = result.content || []
          const parts = content.map((c: any) => {
            if (c.type === 'text') return c.text || ''
            if (c.type === 'image') return `[Image: ${c.data?.slice(0, 50) || '...'}]`
            return JSON.stringify(c)
          })
          return parts.filter(Boolean).join('\n') || '(empty)'
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
        '向用户提问以获取决策或补充信息。**优先使用多问题模式一次问清楚**，减少往返。\n' +
        '多问题模式：传入 title 标题 + questions 数组，每个问题可独立设置输入类型(input/select/confirm)。\n' +
        '单问题模式：传入 question + inputType(兼容旧版)。\n' +
        '注意：信息充分时立即执行任务，不要在信息完备时继续提问。',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          title: { type: 'string', description: '表单标题，如"请提供发票查询信息"' },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: '问题唯一标识，如"invoice_code"' },
                label: { type: 'string', description: '问题文本，如"发票代码"' },
                inputType: { type: 'string', enum: ['input', 'select', 'confirm'], description: '输入类型' },
                options: { type: 'array', items: { type: 'string' }, description: 'select/confirm 的选项' },
                placeholder: { type: 'string', description: '输入框提示文字' },
                required: { type: 'boolean', description: '是否必填' },
              },
              required: ['id', 'label', 'inputType'],
            },
            description: '问题列表（多问多答模式，推荐）',
          },
          // 旧格式兼容
          question: { type: 'string', description: '（旧格式）单个问题文本' },
          options: { type: 'array', items: { type: 'string' }, description: '（旧格式）选项列表' },
          inputType: { type: 'string', enum: ['select', 'input', 'confirm'], description: '（旧格式）交互类型' },
        },
      }),
      execute: async (args: {
        title?: string; questions?: AskQuestion[];
        question?: string; options?: string[]; inputType?: string;
      }) => {
        return new Promise<string>((resolve) => {
          if (onAgentUIEvent) {
            // 新格式：多问多答
            if (args.questions && args.questions.length > 0) {
              onAgentUIEvent({
                type: 'ask_user',
                title: args.title,
                questions: args.questions,
                resolve,
              })
            } else {
              // 旧格式兼容
              onAgentUIEvent({
                type: 'ask_user',
                question: args.question || '请提供信息',
                options: args.options,
                inputType: (args.inputType as 'select' | 'input' | 'confirm') || 'confirm',
                resolve,
              })
            }
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

    // ====== MCP 资源工具 ======
    // 列出所有已启用服务器的资源
    sdkTools['mcp_list_resources'] = {
      description: '列出所有已启用 MCP 服务器提供的资源。返回每个资源的 URI、名称、MIME 类型和所属服务器。',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {},
        additionalProperties: false,
      }),
      execute: async () => {
        const { getAllResources } = await import('./mcpClient')
        const result = await getAllResources()
        if (result.resources.length === 0) return '当前没有可用的 MCP 资源'
        return result.resources.map((r: any) =>
          `[${r.serverName}] ${r.name || r.uri} (${r.mimeType || 'unknown'})\n  URI: ${r.uri}${r.description ? '\n  描述: ' + r.description : ''}`
        ).join('\n\n')
      },
    }
    // 读取指定资源
    sdkTools['mcp_read_resource'] = {
      description: '读取 MCP 服务器上的一个资源。serverId 和 uri 可从 mcp_list_resources 获取。',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          serverId: { type: 'string', description: '资源所属的服务器 ID' },
          uri: { type: 'string', description: '资源的 URI' },
        },
        required: ['serverId', 'uri'],
      }),
      execute: async ({ serverId, uri }: { serverId: string; uri: string }) => {
        const { readResource } = await import('./mcpClient')
        const result = await readResource(serverId, uri)
        return result.success ? JSON.stringify(result.content) : `Error: ${result.error}`
      },
    }

    // ====== MCP 提示工具 ======
    // 列出所有已启用服务器的提示
    sdkTools['mcp_list_prompts'] = {
      description: '列出所有已启用 MCP 服务器提供的提示模板。',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {},
        additionalProperties: false,
      }),
      execute: async () => {
        const { getAllPrompts } = await import('./mcpClient')
        const result = await getAllPrompts()
        if (result.prompts.length === 0) return '当前没有可用的 MCP 提示模板'
        return result.prompts.map((p: any) =>
          `[${p.serverName}] ${p.name}${p.description ? '\n  描述: ' + p.description : ''}${p.arguments?.length ? '\n  参数: ' + p.arguments.map((a: any) => `${a.name}${a.required ? '*' : ''}`).join(', ') : ''}`
        ).join('\n\n')
      },
    }
    // 执行指定提示
    sdkTools['mcp_get_prompt'] = {
      description: '执行 MCP 服务器上的一个提示模板。serverId 和 promptName 可从 mcp_list_prompts 获取。',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          serverId: { type: 'string', description: '提示所属的服务器 ID' },
          promptName: { type: 'string', description: '提示的名称' },
          args: { type: 'object', description: '提示所需的参数（可选）' },
        },
        required: ['serverId', 'promptName'],
      }),
      execute: async ({ serverId, promptName, args }: { serverId: string; promptName: string; args?: any }) => {
        const { getPrompt } = await import('./mcpClient')
        const result = await getPrompt(serverId, promptName, args || {})
        return JSON.stringify(result)
      },
    }

    return sdkTools
  } catch {
    return {}
  }
}

export interface ChatStreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'done' | 'compression' | 'disclosure'
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
  // disclosure 事件字段
  disclosureResult?: DisclosureResult
}

export async function chat(
  messages: ModelMessage[],
  onEvent?: (event: ChatStreamEvent) => void,
  opts?: { abortSignal?: AbortSignal; autoMode?: boolean; localModelId?: string; forceCompression?: boolean; selectedTools?: Set<string> | null },
) {
  // 本地模型路径
  if (opts?.localModelId) {
    return chatLocalViaIpc(messages, onEvent, opts.localModelId, opts?.abortSignal)
  }

  const model = getChatModel()
  if (!model) throw new Error('请先在设置中启用一个 AI 模型')

  const mcpTools = await getMCPSdkTools(opts?.autoMode)

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
    '2. 优先使用工具目录中的工具完成任务，不要凭空猜测。\n' +
    '3. 长任务调用 show_progress，完成后调用 notify_complete。\n'

  // 渐进式披露：只筛选 MCP 业务工具（含 __ 分隔符），内建工具始终全部预加载
  const threshold = getDisclosureThreshold()
  const allNames = Object.keys(toolsForDisclosure)
  const builtinNames = allNames.filter(n => !n.includes('__'))
  const mcpNames = allNames.filter(n => n.includes('__'))

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
  const mcpToolNames = Object.keys(fullToolSet).filter(n => n.includes('__'))
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

  // 摘要注入 system prompt，不放入 messages（避免 AI SDK 安全警告）
  const finalSystem = summary
    ? `${systemPrompt || ''}\n\n[对话历史摘要]\n${summary}`
    : systemPrompt || undefined

  const result = streamText({
    model: model.instance,
    system: finalSystem,
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
