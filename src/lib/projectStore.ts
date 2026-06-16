/**
 * ProjectStore — 项目管理
 * 持久化到 ~/BrainPlus/projects.json
 */
import type { Project, ProjectSettings } from '@/types/project'
import { DEFAULT_PROJECT_SETTINGS } from '@/types/project'
import { toast } from '@/hooks/useToast'

const CONFIG_KEY = 'brainplus_projects'

function loadFromLocal(): Project[] {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveToLocal(projects: Project[]) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(projects))
}

// 同时持久化到文件系统
async function syncToFs(projects: Project[]) {
  try {
    const api = (window as any).electronAPI
    if (!api?.workspace) return
    const ws = await api.workspace.getPaths()
    const projectsRoot = ws.root.replace(/\/[^/]+$/, '') + '/projects'
    const filePath = `${projectsRoot}/projects.json`
    await api.fs.writeFile(filePath, JSON.stringify({ projects }, null, 2))
  } catch { /* 静默 */ }
}

async function loadFromFs(): Promise<Project[]> {
  try {
    const api = (window as any).electronAPI
    if (!api?.workspace) return []
    const ws = await api.workspace.getPaths()
    const projectsRoot = ws.root.replace(/\/[^/]+$/, '') + '/projects'
    const filePath = `${projectsRoot}/projects.json`
    const result = await api.fs.readFile(filePath)
    if (result.success && result.content) {
      const data = JSON.parse(result.content)
      return data.projects || []
    }
  } catch { /* 静默 */ }
  return []
}

class ProjectStoreImpl {
  private projects: Project[] = []
  private version = 0
  private listeners: Array<() => void> = []
  private ready = false

  getVersion(): number { return this.version }
  private bump() { this.version++; this.listeners.forEach(fn => fn()) }
  onChange(fn: () => void) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(l => l !== fn) } }

  async init() {
    // 优先从文件系统加载（更可靠），回退 localStorage
    const fsProjects = await loadFromFs()
    if (fsProjects.length > 0) {
      this.projects = fsProjects
      saveToLocal(fsProjects)
    } else {
      this.projects = loadFromLocal()
    }
    this.ready = true
    this.bump()
  }

  getAll(): Project[] { return [...this.projects] }

  getById(id: string): Project | undefined { return this.projects.find(p => p.id === id) }

  isReady(): boolean { return this.ready }

  async create(name: string, description: string, customPath?: string): Promise<Project | null> {
    const api = (window as any).electronAPI
    if (!api?.workspace) {
      toast({ title: '仅 Electron 环境支持项目管理', variant: 'destructive' })
      return null
    }
    const id = `proj_${Date.now()}`

    // 使用自定义路径或自动生成
    let projectDir: string
    if (customPath?.trim()) {
      projectDir = customPath.trim()
      // 确保目录存在
      try { await api.fs.mkdir(projectDir) } catch {}
    } else {
      const ws = await api.workspace.getPaths()
      const projectsRoot = ws.root.replace(/\/[^/]+$/, '') + '/projects'
      projectDir = `${projectsRoot}/${name.replace(/[^a-zA-Z0-9一-鿿_-]/g, '_')}`
      try {
        await api.fs.mkdir(projectDir)
      } catch {}
    }
    await api.fs.mkdir(`${projectDir}/.brainplus/output`).catch(() => {})

    const project: Project = {
      id, name, description,
      path: projectDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { ...DEFAULT_PROJECT_SETTINGS },
    }
    this.projects.push(project)
    await this.persist()
    this.bump()
    return project
  }

  async delete(id: string) {
    this.projects = this.projects.filter(p => p.id !== id)
    await this.persist()
    this.bump()
  }

  async update(id: string, patch: Partial<Pick<Project, 'name' | 'description'>>) {
    const p = this.projects.find(p => p.id === id)
    if (!p) return
    if (patch.name !== undefined) p.name = patch.name
    if (patch.description !== undefined) p.description = patch.description
    p.updatedAt = new Date().toISOString()
    await this.persist()
    this.bump()
  }

  async updateSettings(id: string, patch: Partial<ProjectSettings>) {
    const p = this.projects.find(p => p.id === id)
    if (!p) return
    p.settings = { ...p.settings, ...patch }
    p.updatedAt = new Date().toISOString()
    await this.persist()
    this.bump()
  }

  async migratePath(id: string, newPath: string, copyFiles: boolean): Promise<boolean> {
    const p = this.projects.find(p => p.id === id)
    if (!p) return false
    const api = (window as any).electronAPI
    const oldPath = p.path
    try {
      // 确保新目录存在
      await api.fs.mkdir(newPath).catch(() => {})
      await api.fs.mkdir(`${newPath}/.brainplus/output`).catch(() => {})
      // 复制文件
      if (copyFiles && oldPath !== newPath) {
        await api.fs.copyDir(oldPath, newPath)
      }
      p.path = newPath
      p.updatedAt = new Date().toISOString()
      await this.persist()
      this.bump()
      return true
    } catch (e: any) {
      console.error('[projectStore] migratePath failed:', e.message)
      return false
    }
  }

  private async persist() {
    saveToLocal(this.projects)
    await syncToFs(this.projects)
  }
}

export const projectStore = new ProjectStoreImpl()
