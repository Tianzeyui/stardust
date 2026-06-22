/**
 * 对话持久化 IPC handler
 */
import { ipcMain } from 'electron'
import {
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  createConversation,
} from '../main/conversationStore.js'

export function registerConversationIpc(): void {
  ipcMain.handle('conv:list', (_e, projectId?: string | null) => listConversations(projectId))
  ipcMain.handle('conv:get', (_e, id: string) => getConversation(id))
  ipcMain.handle('conv:save', (_e, conv: any) => { saveConversation(conv); return true })
  ipcMain.handle('conv:delete', (_e, id: string) => deleteConversation(id))
  ipcMain.handle('conv:create', (_e, title?: string, modelName?: string, projectId?: string | null, projectName?: string) =>
    createConversation(title, modelName, projectId, projectName))
}
