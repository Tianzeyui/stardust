/**
 * Shell 操作 IPC handler
 */
import { ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'

export function registerShellIpc(): void {
  ipcMain.handle('shell:openInExplorer', async (_event, targetPath: string) => {
    try {
      const stat = fs.statSync(targetPath)
      if (stat.isFile()) {
        shell.showItemInFolder(targetPath)
      } else {
        shell.openPath(targetPath)
      }
    } catch {
      shell.openPath(path.dirname(targetPath))
    }
  })

  ipcMain.handle('shell:openInTerminal', async (_event, targetPath: string) => {
    let dirPath: string
    try {
      const stat = fs.statSync(targetPath)
      dirPath = stat.isDirectory() ? targetPath : path.dirname(targetPath)
    } catch {
      dirPath = path.dirname(targetPath)
    }

    const platform = process.platform
    if (platform === 'darwin') {
      exec(`open -a Terminal "${dirPath}"`)
    } else if (platform === 'win32') {
      exec(`start cmd /K "cd /d ${dirPath}"`)
    } else {
      // 尝试常见终端
      const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'x-terminal-emulator']
      for (const term of terminals) {
        try {
          exec(`cd "${dirPath}" && ${term}`)
          break
        } catch { continue }
      }
    }
  })

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
}
