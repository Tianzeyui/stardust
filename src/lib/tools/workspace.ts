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
  // 权限预检
  const permType = opType === 'write' ? 'file_write' : 'file_delete'
  try {
    const already = await (window as any).electronAPI?.perm?.check(getRoot(), permType, absPath)
    if (already) return { confirmed: true, id: 'perm_' + Date.now() }
  } catch {}

  const id = 'fop_' + Math.random().toString(36).slice(2, 8)
  const op = createFileOp(id, opType, absPath, content)
  notifyUI({ type: 'fileop_created', fileOp: { ...op } })
  const confirmed = await new Promise<boolean>(resolve => {
    setFileOpResolver(id, async (ok, persist) => {
      if (persist) try { await (window as any).electronAPI?.perm?.grant(getRoot(), permType, absPath) } catch {}
      resolve(ok)
    })
  })
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
      'List files and subdirectories. depth: recursion depth (default 1, max 3). ' +
      `Workspace root: ${root}`,
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path (relative to workspace root or absolute)' },
        depth: { type: 'number', description: 'Recursion depth, 1=current level only, default 1' },
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
      'Read file content. Supports pagination: offset+length (default 8000 chars). Also supports lines range (e.g. "1-50"/"100-end"). ' +
      `Workspace root: ${root}` +
      'Tail includes total chars/lines for pagination. Docs (PPT/Word/Excel/PDF) auto-converted to Markdown.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (absolute)' },
        offset: { type: 'number', description: 'Start char position (0-based), default 0' },
        length: { type: 'number', description: 'Chars to read, default 8000, max 10000' },
        lines: { type: 'string', description: 'Line range "1-50" or "100-end" (mutually exclusive with offset/length)' },
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
      'Search files by name. Supports wildcards. For glob patterns (**/*.ts), use workspace_glob. ' +
      `Search scope: ${root}`,
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword or wildcard, e.g. *.pptx' },
        path: { type: 'string', description: 'Search start path, default workspace root' },
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
    let p = pattern
      .replace(/\./g, '\\.')
      .replace(/\?/g, '[^/]')           // ? → 单字符（必须在 ** 展开前）
      .replace(/\*\*\//g, 'ZWKZWK')     // **/ → 占位
      .replace(/\*/g, '[^/]*')           // * → 非斜杠
      .replace(/ZWKZWK/g, '(?:.+/)*')    // 占位 → 任意深度目录
    p = p.replace(/\{([^}]+)\}/g, (_, alts) => `(${alts.split(',').join('|')})`)
    return new RegExp(`^${p}$`, 'i')
  }

  tools['workspace_glob'] = {
    description:
      'Find files by name pattern. Much faster than grep for locating files — use this first when you know the file name or extension. ' +
      'Supports ** (any depth), * (any chars), ? (single char), {a,b} (options). E.g. "src/**/*.ts", "*.md". ' +
      `Search scope: ${root}. Auto-excludes node_modules/.git. Max 200 results.`,
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. "src/**/*.ts", "*.md"' },
        path: { type: 'string', description: 'Search start path, default workspace root' },
      },
      required: ['pattern'],
    }),
    execute: async (args: { pattern: string; path?: string }) => {
      const root = getRoot()
      // 去掉 ./ 前缀
      let pat = args.pattern.replace(/^\.\//, '')
      const basePath = args.path ? (args.path.startsWith('/') ? args.path : `${root}/${args.path}`) : root
      const regex = globToRegex(pat)

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
      'Search file contents. Use after glob to find specific code. Prefer workspace_glob over this for finding files by name. ' +
      'Supports regex. `file` param filters by type (e.g. "*.ts"). ' +
      `Search scope: ${root}. Auto-excludes node_modules/.git. Returns file:line:content.`,
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search regex or keyword' },
        file: { type: 'string', description: 'File type filter, e.g. "*.ts", default all files' },
        path: { type: 'string', description: 'Search start path, default workspace root' },
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
      'Create or overwrite entire file. Prefer workspace_edit_file for small changes — this rewrites the whole file. ' +
      'Use for creating new files or rewriting existing ones. Auto-creates parent dirs. Outside-workspace triggers confirmation.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (absolute or relative to workspace root)' },
        content: { type: 'string', description: 'Full file content to write' },
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
    description: 'Append to file (creates if missing). Any path allowed, outside-workspace triggers confirmation.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'Content to append' },
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
    description: 'Create directory (including parents).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path' },
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
    description: 'Delete file. Any path allowed, outside-workspace triggers confirmation.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to delete' },
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
      'Edit specific lines in a file. Find old_string (must be unique) and replace with new_string. ' +
      'Prefer this over workspace_write_file for small edits — it preserves surrounding code. ' +
      'Set replace_all=true to replace all matches. Outside workspace: user confirmation required.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        old_string: { type: 'string', description: 'Original string to replace (must be unique match)' },
        new_string: { type: 'string', description: 'Replacement string' },
        replace_all: { type: 'boolean', description: 'Replace all matches. Default false (single, requires uniqueness)' },
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
