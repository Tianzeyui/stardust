/**
 * 对话框 IPC handler
 */
import { ipcMain, BrowserWindow, dialog } from 'electron'

export function registerDialogIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('dialog:openDirectory', async () => {
    try {
      const result = await dialog.showOpenDialog(getMainWindow()!, {
        properties: ['openDirectory'],
        title: '选择 Skill 目录',
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '用户取消选择' }
      }
      return { success: true, path: result.filePaths[0] }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('dialog:openFile', async (_event, opts?: { filters?: Array<{ name: string; extensions: string[] }> }) => {
    try {
      const result = await dialog.showOpenDialog(getMainWindow()!, {
        properties: ['openFile', 'multiSelections'],
        title: '选择文件',
        filters: opts?.filters ?? [
          { name: '所有支持的文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'csv', 'txt', 'md'] },
          { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
          { name: '文档', extensions: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'csv', 'txt', 'md'] },
        ],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '用户取消选择' }
      }
      return { success: true, files: result.filePaths }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
}
