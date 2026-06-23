/**
 * AI 工作区管理
 * .stardust/ 目录同时作为工作区标识和内部存储
 * 结构: {root}/.stardust/output/  AI 生成的文件
 */
import { app, shell, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'

const CONFIG_FILE = path.join(app.getPath('userData'), 'workspace.json')

interface WorkspaceConfig {
  root: string
}

const DEFAULT_ROOT = path.join(app.getPath('home'), 'Stardust', 'workspace')

function loadConfig(): WorkspaceConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      if (raw.root && fs.existsSync(raw.root)) return { root: raw.root }
    }
  } catch {}
  return { root: DEFAULT_ROOT }
}

function saveConfig(cfg: WorkspaceConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8')
}

let _cachedRoot: string | null = null
function getRoot(): string {
  if (_cachedRoot && fs.existsSync(_cachedRoot)) return _cachedRoot
  _cachedRoot = loadConfig().root
  if (!fs.existsSync(_cachedRoot)) {
    fs.mkdirSync(_cachedRoot, { recursive: true })
  }
  return _cachedRoot
}

/** 检测目录是否为 Stardust 工作区（有 .stardust/ 目录） */
export function isStardustWorkspace(dirPath: string): boolean {
  try {
    return fs.existsSync(path.join(dirPath, '.stardust'))
  } catch { return false }
}

export function setWorkspaceRoot(newRoot: string): boolean {
  try {
    const absRoot = path.resolve(newRoot)
    if (!fs.existsSync(absRoot)) {
      fs.mkdirSync(absRoot, { recursive: true })
    }
    if (!fs.statSync(absRoot).isDirectory) return false
    _cachedRoot = absRoot
    saveConfig({ root: absRoot })
    // 确保 .stardust/output 存在
    fs.mkdirSync(path.join(absRoot, '.stardust', 'output'), { recursive: true })
    console.log('[Workspace] Root changed:', absRoot)
    return true
  } catch (e: any) {
    console.error('[Workspace] setRoot failed:', e.message)
    return false
  }
}

export async function pickWorkspaceRoot(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: '选择工作区目录',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

export function resetWorkspaceRoot(): void {
  try { if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE) } catch {}
  _cachedRoot = DEFAULT_ROOT
  fs.mkdirSync(path.join(DEFAULT_ROOT, '.stardust', 'output'), { recursive: true })
}

export function getWorkspaceInfo(): { root: string; output: string; stardustDir: string; isCustom: boolean } {
  const root = getRoot()
  const stardustDir = path.join(root, '.stardust')
  const output = path.join(stardustDir, 'output')
  // 懒创建：确保目录存在
  fs.mkdirSync(output, { recursive: true })
  return { root, stardustDir, output, isCustom: root !== DEFAULT_ROOT }
}

export function getWorkspacePaths() {
  return getWorkspaceInfo()
}

export function initWorkspace() {
  const root = getRoot()
  fs.mkdirSync(path.join(root, '.stardust', 'output'), { recursive: true })
  console.log('[Workspace] Ready:', root)
}

// ====== 原有工具函数（不变） ======

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
  try { fs.unlinkSync(filePath); return true } catch { return false }
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
