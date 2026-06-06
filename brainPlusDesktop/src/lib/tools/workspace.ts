/**
 * 工作区工具：列出目录、读取文件、搜索文件
 */
import { jsonSchema } from 'ai'
import type { ToolMap } from './registry'

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

export async function registerWorkspaceTools(tools: ToolMap) {
  if (!window.electronAPI?.workspace || !window.electronAPI?.fs) return

  const wsPaths = await window.electronAPI.workspace.getPaths()

  tools['workspace_list_dir'] = {
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
      const dirPath = args.path || wsPaths.output
      const depth = Math.min(args.depth || 1, 3)
      const result = await listDirTree(dirPath, depth, 0)
      return result || '(空目录)'
    },
  }

  tools['workspace_read_file'] = {
    description:
      '读取工作区内的文件内容。自动识别文档格式并转换为文本。' +
      '支持 lines 参数分段读取（如 "1-100"/"100-end"）。' +
      `可读目录: ${wsPaths.output}` +
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
      const fsApi = window.electronAPI!.fs
      const ext = (args.path.split('.').pop() || '').toLowerCase()
      const needsConvert = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf'].includes(ext)

      if (needsConvert && window.electronAPI?.file) {
        const convertResult = await window.electronAPI.file.convert(args.path)
        if (convertResult.success && convertResult.content) {
          return convertResult.content.length > 50000
            ? convertResult.content.slice(0, 50000) + '\n...(内容过长已截断)'
            : convertResult.content
        }
        return `文档转换失败: ${convertResult.error || '未知错误'}。请尝试用 workspace_list_dir 确认文件存在。`
      }

      const readResult = await fsApi.readFile(args.path)
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

  tools['workspace_search'] = {
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
      const results = await searchFiles(basePath, args.query, [])
      return results.length > 0 ? results.join('\n') : `未找到匹配 "${args.query}" 的文件`
    },
  }
}
