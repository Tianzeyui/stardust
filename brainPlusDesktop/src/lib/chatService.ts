import { streamText, stepCountIs, jsonSchema, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { getAIModels, type AIModelConfig } from './config'
import { getAllTools } from './mcpClient'
import { getInstalledSkills } from './skillService'
import type { SectionIndex } from '@/types/skill'

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

/** 从 MCP 服务器获取工具 */
export async function getMCPSdkTools(): Promise<Record<string, any>> {
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
}

export async function chat(
  messages: ModelMessage[],
  onEvent?: (event: ChatStreamEvent) => void,
) {
  const model = getChatModel()
  if (!model) throw new Error('请先在设置中启用一个 AI 模型')

  const mcpTools = await getMCPSdkTools()

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

  const systemPrompt = skillInjection || undefined

  const result = streamText({
    model: model.instance,
    system: systemPrompt || undefined,
    messages,
    tools: Object.keys(mcpTools).length > 0 ? mcpTools : undefined,
    stopWhen: stepCountIs(5),
  })

  let fullText = ''

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta') {
      fullText += chunk.text
      onEvent?.({ type: 'text-delta', text: chunk.text })
    } else if (chunk.type === 'tool-call') {
      onEvent?.({
        type: 'tool-call',
        toolName: (chunk as any).toolName,
        toolInput: (chunk as any).args || (chunk as any).input,
      })
    } else if (chunk.type === 'tool-result') {
      onEvent?.({
        type: 'tool-result',
        toolName: (chunk as any).toolName,
        toolOutput: (chunk as any).result || (chunk as any).output,
      })
    }
  }

  onEvent?.({ type: 'done' })
  return fullText
}
