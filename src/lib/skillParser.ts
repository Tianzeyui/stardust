/**
 * Skill 纯解析函数 — 无副作用，可测试
 */
import type { SectionIndex, CodeBlock, DepsSummary, SkillMeta } from '@/types/skill'

// ====== SKILL.md 解析 ======

/** 解析 YAML frontmatter */
export function parseSkillMd(content: string): SkillMeta | null {
  try {
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    if (!match) return null
    const lines = match[1].split('\n')
    const meta: Record<string, string> = {}
    for (const line of lines) {
      const kv = line.match(/^(\w+):\s*(.+)/)
      if (kv) meta[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '')
    }
    return { name: meta.name || meta.title || '', description: meta.description || '' }
  } catch { return null }
}

/** 解析 SKILL.md 段落结构 */
export function parseSections(content: string): SectionIndex[] {
  const lines = content.split('\n')
  const sections: SectionIndex[] = []
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,3})\s+(.+)/)
    if (!match) continue
    const level = match[1].length
    const title = match[2].trim()
    // 找结束行（下一个同级或更高级标题）
    let end = lines.length
    for (let j = i + 1; j < lines.length; j++) {
      const nm = lines[j].match(/^(#{1,3})\s+/)
      if (nm && nm[1].length <= level) { end = j; break }
    }
    sections.push({ title, level, startLine: i + 1, endLine: end })
  }
  return sections
}

/** 解析代码块 */
export function parseCodeBlocks(content: string): CodeBlock[] {
  const lines = content.split('\n')
  const blocks: CodeBlock[] = []
  let inBlock = false
  let lang = ''
  let start = 0
  let code: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^```(\w*)/)
    if (match && !inBlock) {
      inBlock = true
      lang = match[1] || ''
      start = i + 1
      code = []
    } else if (lines[i] === '```' && inBlock) {
      inBlock = false
      blocks.push({ language: lang, startLine: start, endLine: i, code: code.join('\n').slice(0, 200) })
    } else if (inBlock) {
      code.push(lines[i])
    }
  }
  return blocks
}

// ====== 依赖扫描 ======

/** 扫描所有文件提取依赖 */
export function scanDeps(files: Record<string, string>): DepsSummary {
  const pip = new Set<string>()
  const npm = new Set<string>()
  const commands = new Set<string>()

  for (const [filepath, content] of Object.entries(files)) {
    const lines = content.split('\n')
    for (const line of lines) {
      // Python: import xxx / from xxx import
      const pyImport = line.match(/^(?:import|from)\s+(\w+)/)
      if (pyImport && filepath.endsWith('.py')) pip.add(pyImport[1])

      // JS: require('xxx') / import ... from 'xxx'
      const jsRequire = line.match(/require\(['"](\S+?)['"]\)/)
      const jsImport = line.match(/import\s+.*?\s+from\s+['"](\S+?)['"]/)
      if (jsRequire && (filepath.endsWith('.js') || filepath.endsWith('.md'))) npm.add(jsRequire[1])
      if (jsImport && (filepath.endsWith('.js') || filepath.endsWith('.md'))) npm.add(jsImport[1])

      // pip install xxx (in md docs)
      const pipInstall = line.match(/pip install (\S+)/)
      if (pipInstall) pip.add(pipInstall[1])

      // npm install xxx (in md docs)
      const npmInstall = line.match(/npm install (?:-g\s+)?(\S+)/)
      if (npmInstall) npm.add(npmInstall[1])

      // shell commands
      const shellCmd = line.match(/^(python\d?\s+\S+|npx\s+\S+|uv\s+run\s+\S+|\.\/\S+\.\w+)/)
      if (shellCmd) commands.add(shellCmd[1])
    }
  }

  // 过滤内置模块
  const stdPy = ['os', 'sys', 're', 'json', 'time', 'pathlib', 'subprocess', 'argparse', 'tempfile', 'zipfile', 'io', 'math', 'random', 'datetime', 'collections', 'itertools', 'functools', 'typing', 'abc', 'copy', 'textwrap', 'shutil', 'glob', 'hashlib', 'base64', 'uuid', 'logging', 'unittest', 'pytest']
  const stdJs = ['fs', 'path', 'os', 'http', 'https', 'url', 'crypto', 'stream', 'events', 'util', 'child_process', 'worker_threads', 'react', 'react-dom']
  for (const p of stdPy) pip.delete(p)
  for (const p of stdJs) npm.delete(p)

  return {
    pip: Array.from(pip),
    npm: Array.from(npm),
    commands: Array.from(commands).slice(0, 10),
  }
}

// ====== 目录扫描 ======

/** FsTools 接口 — 依赖注入，便于测试 */
export interface FsTools {
  stat: (path: string) => Promise<{ success: boolean; stat?: { isFile: boolean; isDirectory: boolean; size: number; mtime: string }; error?: string }>
  listDir: (path: string) => Promise<{ success: boolean; files?: string[]; error?: string }>
  readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>
}

const VALID_EXTS = new Set(['md', 'py', 'js', 'ts', 'sh', 'json', 'toml', 'yaml', 'yml', 'txt', 'svg', 'html', 'css'])

/** 递归扫描目录 — 使用 fs.stat 正确判断文件/目录 */
export async function scanDirectory(
  dirPath: string,
  fs: FsTools,
): Promise<{ tree: string; files: Record<string, string> }> {
  const tree: string[] = []
  const files: Record<string, string> = {}

  async function walk(currentPath: string, indent: string, relPath: string, depth: number) {
    // 防止过深递归
    if (depth > 20) return

    const statResult = await fs.stat(currentPath)
    if (!statResult.success || !statResult.stat?.isDirectory) return

    const listResult = await fs.listDir(currentPath)
    if (!listResult.success || !listResult.files) return

    // 排序：目录在前，文件在后
    const entries: Array<{ name: string; isDir: boolean }> = []
    for (const name of listResult.files) {
      const childPath = `${currentPath}/${name}`
      const childStat = await fs.stat(childPath)
      entries.push({ name, isDir: childStat.success && childStat.stat?.isDirectory === true })
    }
    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    for (const { name, isDir } of entries) {
      const childPath = `${currentPath}/${name}`
      const childRelPath = relPath ? `${relPath}/${name}` : name

      if (isDir) {
        tree.push(`${indent}├── ${name}/`)
        await walk(childPath, indent + '│   ', childRelPath, depth + 1)
      } else {
        const ext = name.split('.').pop()?.toLowerCase() || ''
        if (!VALID_EXTS.has(ext)) continue
        tree.push(`${indent}├── ${name}`)
        const contentResult = await fs.readFile(childPath)
        if (contentResult.success && contentResult.content != null) {
          files[childRelPath] = contentResult.content
        }
      }
    }
  }

  await walk(dirPath, '', '', 0)
  return { tree: tree.join('\n'), files }
}
