/**
 * 工作区 IPC handler
 */
import { ipcMain, BrowserWindow } from 'electron'
import {
  initWorkspace,
  getWorkspacePaths,
  getWorkspaceInfo,
  listOutputFiles,
  openFile,
  deleteFile,
  clearOutputFiles,
  setWorkspaceRoot,
  pickWorkspaceRoot,
  resetWorkspaceRoot,
  isStardustWorkspace,
} from '../main/workspace.js'

export function registerWorkspaceIpc(): void {
  ipcMain.handle('workspace:getPaths', () => getWorkspacePaths())
  ipcMain.handle('workspace:info', () => getWorkspaceInfo())
  ipcMain.handle('workspace:setRoot', async (_event, newRoot: string) => setWorkspaceRoot(newRoot))
  ipcMain.handle('workspace:pickRoot', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    return pickWorkspaceRoot(win)
  })
  ipcMain.handle('workspace:resetRoot', () => { resetWorkspaceRoot(); return getWorkspaceInfo() })
  ipcMain.handle('workspace:isStardust', async (_event, dirPath: string) => isStardustWorkspace(dirPath))
  ipcMain.handle('workspace:listOutputs', () => listOutputFiles())
  ipcMain.handle('workspace:openFile', (_event, filePath: string) => openFile(filePath))
  ipcMain.handle('workspace:deleteFile', (_event, filePath: string) => deleteFile(filePath))
  ipcMain.handle('workspace:clearOutputs', () => clearOutputFiles())
}

// 在 app.whenReady 中调用
export { initWorkspace }
