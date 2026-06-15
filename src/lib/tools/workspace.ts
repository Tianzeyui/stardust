/**
 * 工作区工具：列出目录、读取文件、搜索文件、写入/删除文件
 * 路径由 ChatPage 注入，跟随项目/全局工作区切换
 */
import { jsonSchema } from 'ai'
import type { ToolMap } from './registry'
import { createFileOp, updateFileOp, getFileOp, setFileOpResolver } from '@/lib/fileOpManager'

/** 当前工作区根目录（由 ChatPage 动态注入） */
let _workspaceRoot: string | undefined
let _workspaceOutput: string | undefined
export function setWorkspaceRoots(root: string, output: string) {
  _workspaceRoot = root
  _workspaceOutput = output
}

function getRoot(): string { return _workspaceRoot || '~/BrainPlus/workspace' }
function getOutput(): string { return _workspaceOutput || '~/BrainPlus/workspace/.brainplus/output' }

/** 检查路径是否在工作区内 */
function isInsideWorkspace(filePath: string): boolean {
  const root = getRoot()
  const absPath = filePath.startsWith('/') ? filePath : `${root}/${filePath}`
  return absPath.startsWith(root)
}

function notifyUI(event: any) {
  window.dispatchEvent(new CustomEvent('brainplus:fileop', { detail: event }))
}

/** 确认流程：工作区外操作需用户确认。返回 { confirmed, id }，调用方用 id 更新状态 */
async function confirmOutside(opType: 'write' | 'delete', absPath: string, content?: string): Promise<{ confirmed: boolean; id: string }> {
  const id = 'fop_' + Math.random().toString(36).slice(2, 8)
  const op = createFileOp(id, opType, absPath, content)
  notifyUI({ type: 'fileop_created', fileOp: { ...op } })
  const confirmed = await new Promise<boolean>(resolve => { setFileOpResolver(id, resolve) })
  if (!confirmed) {
    updateFileOp(id, { status: 'rejected' })
    notifyUI({ type: 'fileop_updated', fileOp: { ...getFileOp(id)! } })
  }
  return { confirmed, id }
}

function notifyFileOpDone(id: string, patch: Partial<{ status: string; error: string; size: number }>) {
  updateFileOp(id, patch as any)
  notifyUI({ type: 'fileop_updated', fileOp: { ...getFileOp(id)! } })
}

/** 解析绝对路径 */
function resolvePath(p: string): string {
  const root = getRoot()
  return p.startsWith('/') ? p : `${root}/${p}`
}

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

  const root = getRoot()
  const output = getOutput()

  tools['workspace_list_dir'] = {
    description:
      '列出工作区目录下的文件和子目录。depth: 递归深度(默认1, 最大3)。' +
      `根目录: ${root}`,
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: '要列出的目录路径（相对于工作区根目录或绝对路径）' },
        depth: { type: 'number', description: '递归深度，1=只列当前层，默认1' },
      },
    }),
    execute: async (args: { path?: string; depth?: number }) => {
      const dirPath = args.path || getRoot()
      const depth = Math.min(args.depth || 1, 3)
      const result = await listDirTree(dirPath, depth, 0)
      return result || '(空目录)'
    },
  }

  tools['workspace_read_file'] = {
    description:
      '读取工作区内的文件内容。支持分页：offset(起始字符位置) + length(读取字符数)，默认 length=8000。' +
      '也支持 lines 行范围（如 "1-50"/"100-end"）。不传参数默认返回前 8000 字符。' +
      `工作区根: ${root}` +
      '返回末尾附带总字符数/总行数，方便 AI 计算下一页。' +
      'PPT/Word/Excel/PDF 等文档会自动转换为 Markdown 后返回文本内容。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径（绝对路径）' },
        offset: { type: 'number', description: '起始字符位置（0-based），默认 0' },
        length: { type: 'number', description: '读取字符数，默认 8000，最大 10000' },
        lines: { type: 'string', description: '行范围 "1-50" 或 "100-end"（与 offset/length 互斥）' },
      },
      required: ['path'],
    }),
    execute: async (args: { path: string; offset?: number; length?: number; lines?: string }) => {
      const fsApi = window.electronAPI!.fs
      const ext = (args.path.split('.').pop() || '').toLowerCase()
      const needsConvert = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf'].includes(ext)

      if (needsConvert && window.electronAPI?.file) {
        const convertResult = await window.electronAPI.file.convert(args.path)
        if (convertResult.success && convertResult.content) {
          const total = convertResult.content.length
          const off = Math.max(0, args.offset || 0)
          const len = Math.min(args.length || 8000, 10000)
          const slice = convertResult.content.slice(off, off + len)
          const tail = total > off + len ? `\n\n--- 第 ${off}-${off + len} / ${total} 字符 ---` : `\n\n--- ${total} 字符（已读完）---`
          return slice + tail
        }
        return `文档转换失败: ${convertResult.error || '未知错误'}。`
      }

      const readResult = await fsApi.readFile(args.path)
      if (!readResult.success || readResult.content == null) {
        return `读取失败: ${readResult.error || '文件不存在'}`
      }
      const content = readResult.content
      const totalChars = content.length
      const totalLines = content.split('\n').length

      // 行范围模式
      if (args.lines) {
        const allLines = content.split('\n')
        const match = args.lines.match(/^(\d+)(-(\d+|end))?$/i)
        if (!match) return `行格式错误: "${args.lines}"。例: "1-50"、"100-end"`
        const start = Math.max(0, parseInt(match[1]) - 1)
        const end = !match[2] ? start + 1 : match[3]?.toLowerCase() === 'end' ? allLines.length : parseInt(match[3])
        const slice = allLines.slice(start, end).join('\n')
        return slice + `\n\n--- L${start + 1}-${end} / ${totalLines} 行，${totalChars} 字符 ---`
      }

      // 字符分页模式（默认）
      const off = Math.max(0, args.offset || 0)
      const len = Math.min(args.length || 8000, 10000)
      const slice = content.slice(off, off + len)
      if (off + len >= totalChars) {
        return slice + `\n\n--- ${totalChars} 字符，${totalLines} 行（已读完）---`
      }
      return slice + `\n\n--- 第 ${off + 1}-${off + len} / ${totalChars} 字符，${totalLines} 行 --- 用 offset=${off + len} 读下一页`
    },
  }

  tools['workspace_search'] = {
    description:
      '在工作区目录中搜索文件。支持通配符匹配文件名。如需 glob 模式匹配（**/*.ts），使用 workspace_glob。' +
      `搜索范围: ${root}`,
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词或通配符，如 "*.pptx"、"报告"' },
        path: { type: 'string', description: '搜索起始路径，默认整个工作区' },
      },
      required: ['query'],
    }),
    execute: async (args: { query: string; path?: string }) => {
      const basePath = args.path || getRoot()
      const results = await searchFiles(basePath, args.query, [])
      return results.length > 0 ? results.join('\n') : `未找到匹配 "${args.query}" 的文件`
    },
  }

  // glob 转正则
  function globToRegex(pattern: string): RegExp {
    // 先保护 **，避免被 * 替换误伤
    let p = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*\//g, '\x00DEEP\x00')  // **/ → 占位符
      .replace(/\*/g, '[^/]*')               // * → 匹配非斜杠字符
      .replace(/\x00DEEP\x00/g, '(?:.+/)*') // 占位符 → 任意深度目录
      .replace(/\?/g, '[^/]')
    p = p.replace(/\{([^}]+)\}/g, (_, alts) => `(${alts.split(',').join('|')})`)
    return new RegExp(`^${p}$`, 'i')
  }

  tools['workspace_glob'] = {
    description:
      '用 glob 模式匹配工作区中的文件。支持 ** (任意深度)、* (任意字符)、? (单字符)、{a,b} (选项)。' +
      '如 "src/**/*.ts"、"*.md"、"**/*.{ts,tsx}"。' +
      `搜索范围: ${root}` +
      '自动排除 node_modules/.git 等。返回匹配的相对路径列表，最多 200 条。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'glob 模式，如 "src/**/*.ts"、"*.md"' },
        path: { type: 'string', description: '搜索起始路径，默认工作区根' },
      },
      required: ['pattern'],
    }),
    execute: async (args: { pattern: string; path?: string }) => {
      const root = getRoot()
      const basePath = args.path ? (args.path.startsWith('/') ? args.path : `${root}/${args.path}`) : root
      const regex = globToRegex(args.pattern)

      // 用系统命令收集文件列表（跨平台）
      const fsApi = window.electronAPI?.fs
      let allFiles: string[] = []
      if (fsApi?.find) {
        const r = await fsApi.find(basePath)
        if (r.success) allFiles = r.files!
      }
      // 系统命令不可用时回退 IPC 遍历
      if (allFiles.length === 0) {
        const fallback: string[] = []
        const skip = ['node_modules','.git','.brainplus','dist','build','.next','__pycache__','.DS_Store']
        async function walk(dir: string, depth: number) {
          if (depth > 15 || fallback.length >= 500) return
          const api = window.electronAPI?.fs
          if (!api) return
          const lr = await api.listDir(dir)
          if (!lr.success || !lr.files) return
          for (const name of lr.files) {
            if (skip.includes(name)) continue
            const cp = `${dir.replace(/\/+$/, '')}/${name}`
            fallback.push(cp)
            const sub = await api.listDir(cp)
            if (sub.success) await walk(cp, depth + 1)
          }
        }
        await walk(basePath, 0)
        allFiles = fallback
      }

      const plen = basePath.length + 1
      const results = allFiles
        .map(f => f.slice(plen))
        .filter(f => regex.test(f))
        .sort()
        .slice(0, 200)
      return results.length > 0 ? results.join('\n') : `未找到匹配 "${args.pattern}" 的文件`
    },
  }

  tools['workspace_grep'] = {
    description:
      '在工作区中按内容搜索代码。支持正则表达式。' +
      'file 参数可按文件类型过滤（如 "*.ts"、"*.py"、"*.tsx"）。' +
      `搜索范围: ${root}` +
      '自动排除 node_modules/.git/.brainplus/dist 等目录。返回匹配行的文件路径+行号+内容。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '搜索的正则表达式或关键词' },
        file: { type: 'string', description: '文件类型过滤，如 "*.ts"、"*.md"，默认搜索所有文件' },
        path: { type: 'string', description: '搜索起始路径，默认整个工作区' },
      },
      required: ['pattern'],
    }),
    execute: async (args: { pattern: string; file?: string; path?: string }) => {
      const api = window.electronAPI?.fs
      if (!api?.grep) return 'grep 不可用'
      const basePath = args.path || getRoot()
      const result = await api.grep(basePath, args.pattern, args.file)
      if (!result.success) return `grep 失败: ${result.error}`
      return result.output || '(无匹配)'
    },
  }

  tools['workspace_write_file'] = {
    description:
      '创建或覆写文件（不存在则新建）。可写入任意路径，工作区外会弹确认框由用户审批。' +
      '自动创建父目录。不要因为路径在工作区外就拒绝使用——用户确认后会执行。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径（绝对路径，或相对于工作区根）' },
        content: { type: 'string', description: '要写入的完整文件内容' },
      },
      required: ['path', 'content'],
    }),
    execute: async (args: { path: string; content: string }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const absPath = resolvePath(args.path)
      let fopId: string | null = null
      if (!isInsideWorkspace(absPath)) {
        const r = await confirmOutside('write', absPath, args.content)
        if (!r.confirmed) return `写入 ${absPath} 已被用户拒绝。`
        fopId = r.id
      }
      try {
        await api.writeFile(absPath, args.content)
        if (fopId) notifyFileOpDone(fopId, { status: 'done', size: args.content.length })
        return `✅ 已写入 ${absPath} (${args.content.length} 字符)`
      } catch (e: any) {
        if (fopId) notifyFileOpDone(fopId, { status: 'error', error: e.message })
        return `写入失败: ${e.message}`
      }
    },
  }

  tools['workspace_append_file'] = {
    description: '追加内容到文件末尾（不存在则新建）。可操作任意路径，工作区外会弹确认框。不要因路径在工作区外就拒绝。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '要追加的内容' },
      },
      required: ['path', 'content'],
    }),
    execute: async (args: { path: string; content: string }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const absPath = resolvePath(args.path)
      let fopId: string | null = null
      if (!isInsideWorkspace(absPath)) {
        const r = await confirmOutside('write', absPath, args.content)
        if (!r.confirmed) return `追加 ${absPath} 已被用户拒绝。`
        fopId = r.id
      }
      try {
        let existing = ''
        const readResult = await api.readFile(absPath)
        if (readResult.success && readResult.content) existing = readResult.content
        await api.writeFile(absPath, existing + args.content)
        if (fopId) notifyFileOpDone(fopId, { status: 'done', size: args.content.length })
        return `✅ 已追加 ${args.content.length} 字符到 ${absPath}`
      } catch (e: any) {
        if (fopId) notifyFileOpDone(fopId, { status: 'error', error: e.message })
        return `追加失败: ${e.message}`
      }
    },
  }

  tools['workspace_create_dir'] = {
    description: '创建目录（包括父目录）。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径' },
      },
      required: ['path'],
    }),
    execute: async (args: { path: string }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const absPath = resolvePath(args.path)
      try {
        await api.mkdir(absPath)
        return `✅ 已创建目录 ${absPath}`
      } catch (e: any) { return `创建目录失败: ${e.message}` }
    },
  }

  tools['workspace_delete_file'] = {
    description: '删除文件。可删除任意路径，工作区外会弹确认框由用户审批。不要因路径在工作区外就拒绝。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: '要删除的文件路径' },
      },
      required: ['path'],
    }),
    execute: async (args: { path: string }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const absPath = resolvePath(args.path)
      let fopId: string | null = null
      if (!isInsideWorkspace(absPath)) {
        const r = await confirmOutside('delete', absPath)
        if (!r.confirmed) return `删除 ${absPath} 已被用户拒绝。`
        fopId = r.id
      }
      try {
        await api.unlink(absPath)
        if (fopId) notifyFileOpDone(fopId, { status: 'done' })
        return `✅ 已删除 ${absPath}`
      } catch (e: any) {
        if (fopId) notifyFileOpDone(fopId, { status: 'error', error: e.message })
        return `删除失败: ${e.message}`
      }
    },
  }

  tools['workspace_edit_file'] = {
    description:
      '精确编辑文件：查找 old_string 并替换为 new_string。old_string 必须在文件中唯一出现（否则报错）。' +
      '可设置 replace_all=true 替换所有匹配。对大文件改几行时比 write 更高效安全。' +
      '工作区外需用户确认。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        old_string: { type: 'string', description: '要被替换的原始字符串（必须唯一匹配）' },
        new_string: { type: 'string', description: '替换后的新字符串' },
        replace_all: { type: 'boolean', description: '是否替换所有匹配。默认 false（只替换第一个，且要求唯一）' },
      },
      required: ['path', 'old_string', 'new_string'],
    }),
    execute: async (args: { path: string; old_string: string; new_string: string; replace_all?: boolean }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const absPath = resolvePath(args.path)

      // 读文件
      const readResult = await api.readFile(absPath)
      if (!readResult.success || readResult.content == null) return `读取失败: ${readResult.error || '文件不存在'}`
      const original = readResult.content

      // 检查匹配
      const count = original.split(args.old_string).length - 1
      if (count === 0) return `❌ 未找到匹配的 old_string。请确认字符串内容与文件中完全一致（包括空格、缩进、换行）。`
      if (!args.replace_all && count > 1) {
        return `❌ old_string 匹配了 ${count} 处，不唯一。请扩大匹配范围（包含更多上下文）使其唯一，或设置 replace_all=true。`
      }

      const newContent = args.replace_all
        ? original.split(args.old_string).join(args.new_string)
        : original.replace(args.old_string, args.new_string)

      // 工作区外确认
      let fopId: string | null = null
      if (!isInsideWorkspace(absPath)) {
        const r = await confirmOutside('write', absPath, newContent)
        if (!r.confirmed) return `编辑 ${absPath} 已被用户拒绝。`
        fopId = r.id
      }

      try {
        await api.writeFile(absPath, newContent)
        if (fopId) notifyFileOpDone(fopId, { status: 'done', size: newContent.length })
        const changed = newContent.length - original.length
        const diff = changed >= 0 ? `+${changed}` : `${changed}`
        return `✅ 已编辑 ${absPath}（${args.replace_all ? `替换 ${count} 处` : '替换 1 处'}，${diff} 字符）`
      } catch (e: any) {
        if (fopId) notifyFileOpDone(fopId, { status: 'error', error: e.message })
        return `编辑失败: ${e.message}`
      }
    },
  }
}
