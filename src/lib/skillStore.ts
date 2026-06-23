/**
 * Skill 存储层
 * - 元数据 → localStorage (key: 'stardust_skills_meta')
 * - 文件内容 → 磁盘 (via IPC → userData/skills/{id}/)
 *
 * 向后兼容：如果检测到旧 key 'stardust_installed_skills'，自动迁移
 */
import type { InstalledSkill } from '@/types/skill'

const META_KEY = 'stardust_skills_meta'
const OLD_KEY = 'stardust_installed_skills'

// ====== 向后兼容迁移 ======

function migrateIfNeeded(): void {
  try {
    const old = localStorage.getItem(OLD_KEY)
    if (!old) return
    const parsed = JSON.parse(old)
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.removeItem(OLD_KEY)
      return
    }

    // 旧数据可能有 files 字段，转换为新格式
    const migrated: InstalledSkill[] = parsed
      .filter((s: any) => s.id && s.name)
      .map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
        path: s.path || '',
        enabled: s.enabled ?? false,
        installedAt: s.installedAt || new Date().toISOString(),
        fileTree: s.fileTree || '',
        fileCount: s.fileCount ?? Object.keys(s.files || {}).length,
        fileList: s.fileList || Object.keys(s.files || {}),
        sections: s.sections || [],
        codeBlocks: s.codeBlocks || [],
        deps: s.deps || { pip: [], npm: [], commands: [] },
      }))

    if (migrated.length > 0) {
      localStorage.setItem(META_KEY, JSON.stringify(migrated))
    }
    localStorage.removeItem(OLD_KEY)
    console.log(`[skillStore] 迁移完成: ${migrated.length} 个 skill`)
  } catch {
    // 迁移失败不阻塞，静默处理
  }
}

// 启动时执行迁移
migrateIfNeeded()

// ====== 元数据操作 ======

export function getSkillsMeta(): InstalledSkill[] {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s: any) => s.id && s.name)
  } catch { return [] }
}

export function getSkillMeta(id: string): InstalledSkill | undefined {
  return getSkillsMeta().find(s => s.id === id)
}

export function saveSkillMeta(skill: InstalledSkill): void {
  const skills = getSkillsMeta()
  // 防止重复
  const idx = skills.findIndex(s => s.id === skill.id)
  if (idx !== -1) {
    skills[idx] = skill
  } else {
    skills.push(skill)
  }
  localStorage.setItem(META_KEY, JSON.stringify(skills))
}

export function removeSkillMeta(id: string): void {
  const skills = getSkillsMeta().filter(s => s.id !== id)
  localStorage.setItem(META_KEY, JSON.stringify(skills))
}

export function updateSkillMeta(id: string, patch: Partial<InstalledSkill>): void {
  const skills = getSkillsMeta()
  const idx = skills.findIndex(s => s.id === id)
  if (idx !== -1) {
    skills[idx] = { ...skills[idx], ...patch }
    localStorage.setItem(META_KEY, JSON.stringify(skills))
  }
}

// ====== 文件操作（委托 IPC） ======

export async function storeSkillFiles(skillId: string, files: Record<string, string>): Promise<void> {
  if (!window.electronAPI?.skills) {
    throw new Error('Electron IPC 不可用（可能在浏览器环境？）')
  }
  const result = await window.electronAPI.skills.writeFiles(skillId, files)
  if (!result.success) {
    throw new Error('写入技能文件失败: ' + (result.error || '未知错误'))
  }
}

export async function loadSkillFile(skillId: string, filePath: string): Promise<string | null> {
  if (!window.electronAPI?.skills) return null
  const result = await window.electronAPI.skills.readFile(skillId, filePath)
  if (!result.success || result.content == null) return null
  return result.content
}

export async function deleteSkillFiles(skillId: string): Promise<void> {
  if (!window.electronAPI?.skills) return
  await window.electronAPI.skills.deleteFiles(skillId)
}

// ====== 组合操作 ======

export async function removeSkillCompletely(skillId: string): Promise<void> {
  await deleteSkillFiles(skillId)
  removeSkillMeta(skillId)
}
