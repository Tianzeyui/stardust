/**
 * Skill 磁盘持久化服务
 * 所有 Skill 文件存储在 app.getPath('userData')/skills/{skillId}/
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

function getSkillsDir(): string {
  return path.join(app.getPath('userData'), 'skills')
}

export function getSkillDir(skillId: string): string {
  return path.join(getSkillsDir(), skillId)
}

export async function writeSkillFiles(
  skillId: string,
  files: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const skillDir = getSkillDir(skillId)
    // 先清空旧文件（如果存在）
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true })
    }

    for (const [relPath, content] of Object.entries(files)) {
      const fullPath = path.join(skillDir, relPath)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content, 'utf-8')
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function readSkillFile(
  skillId: string,
  filePath: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const fullPath = path.join(getSkillDir(skillId), filePath)
    // 安全检查：防止路径穿越
    if (!fullPath.startsWith(getSkillDir(skillId))) {
      return { success: false, error: '非法文件路径' }
    }
    return { success: true, content: fs.readFileSync(fullPath, 'utf-8') }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function deleteSkillFiles(
  skillId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const dir = getSkillDir(skillId)
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

/** 应用退出时清理（可选） */
export async function cleanupSkillStore() {
  // 当前实现：所有文件在 skills/ 目录下正常保留
  // 如果未来需要清理空目录等，可在此实现
}
