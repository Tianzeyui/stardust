/**
 * AI 工作区管理
 * ~/BrainPlus/workspace/
 *   └── output/    AI 生成的文件
 */
import { app, shell } from 'electron'
import fs from 'fs'
import path from 'path'

function workspaceRoot(): string {
  return path.join(app.getPath('home'), 'BrainPlus', 'workspace')
}

export function getWorkspacePaths() {
  const root = workspaceRoot()
  return {
    root,
    output: path.join(root, 'output'),
  }
}

export function initWorkspace() {
  const { output } = getWorkspacePaths()
  fs.mkdirSync(output, { recursive: true })
  console.log('[Workspace] Ready:', output)
}

export function listOutputFiles(): Array<{ name: string; path: string; size: number; mtime: string }> {
  const { output } = getWorkspacePaths()
  if (!fs.existsSync(output)) return []
  return fs.readdirSync(output).map(name => {
    const filePath = path.join(output, name)
    const stat = fs.statSync(filePath)
    return { name, path: filePath, size: stat.size, mtime: stat.mtime.toISOString() }
  }).sort((a, b) => b.mtime.localeCompare(a.mtime))
}

export function openFile(filePath: string) {
  shell.openPath(filePath)
}

export function deleteFile(filePath: string): boolean {
  try {
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

export function clearOutputFiles(): number {
  const { output } = getWorkspacePaths()
  if (!fs.existsSync(output)) return 0
  let count = 0
  for (const name of fs.readdirSync(output)) {
    try { fs.unlinkSync(path.join(output, name)); count++ } catch {}
  }
  return count
}
