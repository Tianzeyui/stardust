/**
 * 配置持久化 IPC handler
 */
import { ipcMain } from 'electron'
import {
  getSupabase,
  saveSupabase,
  clearSupabase,
  getCloudinary,
  saveCloudinary,
  clearCloudinary,
  getAIModels,
  saveAIModels,
} from '../main/configStore.js'

export function registerConfigIpc(): void {
  ipcMain.handle('config:getSupabase', () => getSupabase())
  ipcMain.handle('config:saveSupabase', (_e, c: any) => saveSupabase(c))
  ipcMain.handle('config:clearSupabase', () => { clearSupabase(); return true })

  ipcMain.handle('config:getCloudinary', () => getCloudinary())
  ipcMain.handle('config:saveCloudinary', (_e, c: any) => saveCloudinary(c))
  ipcMain.handle('config:clearCloudinary', () => { clearCloudinary(); return true })

  ipcMain.handle('config:getAIModels', () => getAIModels())
  ipcMain.handle('config:saveAIModels', (_e, models: any[]) => saveAIModels(models))
}
