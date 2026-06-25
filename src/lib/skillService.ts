/**
 * Skill 业务编排层
 * 组合 skillParser + skillStore，提供高层 API
 */
import type { InstalledSkill, SkillInstallValidation } from '@/types/skill'
import { parseSkillMd, parseSections, parseCodeBlocks, scanDeps, scanDirectory, type FsTools } from './skillParser'
import {
  getSkillsMeta,
  saveSkillMeta,
  removeSkillCompletely,
  updateSkillMeta,
  storeSkillFiles,
} from './skillStore'

// ====== 构建 FsTools（基于 Electron IPC） ======

function createFsTools(): FsTools {
  const api = window.electronAPI?.fs
  if (!api) {
    throw new Error('Electron FS API 不可用，请在桌面应用中操作')
  }
  return {
    stat: (path) => api.stat(path),
    listDir: (path) => api.listDir(path),
    readFile: (path) => api.readFile(path),
  }
}

// ====== 安装验证 ======

export async function validateInstallPath(dirPath: string): Promise<SkillInstallValidation> {
  const errors: string[] = []
  const api = window.electronAPI?.fs

  if (!api) {
    return { pathExists: false, isDirectory: false, hasSkillMd: false, alreadyInstalled: false,
      errors: ['Electron FS API 不可用'] }
  }

  // 1. 路径存在？
  const exists = await api.exists(dirPath)
  if (!exists) {
    return { pathExists: false, isDirectory: false, hasSkillMd: false, alreadyInstalled: false,
      errors: [`路径不存在: ${dirPath}`] }
  }

  // 2. 是目录？
  const statResult = await api.stat(dirPath)
  const isDirectory = statResult.success && statResult.stat?.isDirectory === true
  if (!isDirectory) {
    errors.push('所选路径不是目录')
    return { pathExists: true, isDirectory: false, hasSkillMd: false, alreadyInstalled: false, errors }
  }

  // 3. 包含 SKILL.md？
  const hasSkillMd = await api.exists(`${dirPath}/SKILL.md`)
  if (!hasSkillMd) {
    errors.push('目录中未找到 SKILL.md 文件')
  }

  // 4. 已经安装过？
  const installed = getSkillsMeta()
  const alreadyInstalled = installed.some(s => s.path === dirPath)
  if (alreadyInstalled) {
    errors.push('该 Skill 已经安装')
  }

  return { pathExists: true, isDirectory: true, hasSkillMd, alreadyInstalled, errors }
}

// ====== Skill CRUD ======

export function getInstalledSkills(): InstalledSkill[] {
  return getSkillsMeta()
}

export async function installSkill(dirPath: string): Promise<InstalledSkill> {
  // 1. 验证
  const validation = await validateInstallPath(dirPath)
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join('; '))
  }

  // 2. 扫描目录
  const fsTools = createFsTools()
  const { tree, files } = await scanDirectory(dirPath, fsTools)

  // 3. 解析 SKILL.md
  const dirName = dirPath.split('/').pop() || dirPath.split('\\').pop() || '未命名'
  let name = dirName
  let description = ''
  let sections: InstalledSkill['sections'] = []
  let codeBlocks: InstalledSkill['codeBlocks'] = []

  const skillMd = files['SKILL.md']
  if (skillMd) {
    const meta = parseSkillMd(skillMd)
    if (meta) {
      name = meta.name || name
      description = meta.description || description
    }
    sections = parseSections(skillMd)
    codeBlocks = parseCodeBlocks(skillMd)
  }

  if (!description) {
    description = `${Object.keys(files).length}个文件`
  }

  // 4. 扫描依赖
  const deps = scanDeps(files)

  // 5. 生成 ID
  const id = 'skill_' + Date.now()

  // 6. 写入磁盘
  await storeSkillFiles(id, files)

  // 7. 保存元数据
  const skill: InstalledSkill = {
    id,
    name,
    description,
    path: dirPath,
    installedAt: new Date().toISOString(),
    fileTree: `${name}/\n${tree}`,
    fileCount: Object.keys(files).length,
    fileList: Object.keys(files),
    sections,
    codeBlocks,
    deps,
  }

  saveSkillMeta(skill)
  return skill
}

export async function uninstallSkill(skillId: string): Promise<void> {
  await removeSkillCompletely(skillId)
}

export async function reloadSkillFiles(skillId: string): Promise<Record<string, string> | null> {
  const skill = getSkillsMeta().find(s => s.id === skillId)
  if (!skill) return null

  // 清除旧磁盘文件，重新扫描原始路径
  const fsTools = createFsTools()
  const { files } = await scanDirectory(skill.path, fsTools)
  await storeSkillFiles(skillId, files)
  return files
}

// ====== 导出解析函数（供 chatService 等使用） ======
export { parseSkillMd, parseSections, parseCodeBlocks, scanDeps } from './skillParser'
