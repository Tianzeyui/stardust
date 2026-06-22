/**
 * 权限管理 IPC handler
 */
import { ipcMain, app } from 'electron'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'

function getPermissionsFile(workspaceRoot: string): string {
  return join(workspaceRoot, '.brainplus', 'settings.local.json')
}

function getGlobalPermissionsFile(): string {
  return join(app.getPath('userData'), 'permissions.json')
}

export function registerPermissionIpc(): void {
  ipcMain.handle('perm:check', async (_event, workspaceRoot: string, type: string, value: string) => {
    try {
      const files = [getPermissionsFile(workspaceRoot), getGlobalPermissionsFile()]
      for (const f of files) {
        if (existsSync(f)) {
          const data = JSON.parse(readFileSync(f, 'utf-8'))
          if (data.deny?.some((e: any) => e.type === type && value.startsWith(e.pattern))) return false
          if (data.allow?.some((e: any) => e.type === type && value.startsWith(e.pattern))) return true
        }
      }
      return false
    } catch { return false }
  })

  ipcMain.handle('perm:grant', async (_event, workspaceRoot: string, type: string, pattern: string) => {
    try {
      const f = getPermissionsFile(workspaceRoot)
      mkdirSync(dirname(f), { recursive: true })
      let data: any = { version: 1, allow: [], deny: [] }
      if (existsSync(f)) data = JSON.parse(readFileSync(f, 'utf-8'))
      data.allow.push({ type, pattern, approvedAt: Date.now() })
      writeFileSync(f, JSON.stringify(data, null, 2), 'utf-8')
      return true
    } catch { return false }
  })
}
