/**
 * Skill 磁盘存储 IPC handler
 */
import { ipcMain } from 'electron'
import {
  writeSkillFiles,
  readSkillFile,
  deleteSkillFiles,
} from '../main/skillDiskStore.js'

export function registerSkillIpc(): void {
  ipcMain.handle('skills:writeFiles', async (_event, skillId: string, files: Record<string, string>) => {
    return writeSkillFiles(skillId, files)
  })

  ipcMain.handle('skills:readFile', async (_event, skillId: string, filePath: string) => {
    return readSkillFile(skillId, filePath)
  })

  ipcMain.handle('skills:deleteFiles', async (_event, skillId: string) => {
    return deleteSkillFiles(skillId)
  })
}
