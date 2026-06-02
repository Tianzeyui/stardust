import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { mcpService, type MCPServer } from './main/mcp/MCPService.js'
import { executeJS, executePython, preInit } from './main/sandboxService.js'
import { initWorkspace, getWorkspacePaths, listOutputFiles, openFile, deleteFile, clearOutputFiles } from './main/workspace.js'
import { writeSkillFiles, readSkillFile, deleteSkillFiles } from './main/skillDiskStore.js'
import { convertWithMarkitdown, isImageFile, isConvertible } from './main/fileConvert.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ==================== MCP IPC Handlers ====================

// 服务器 CRUD
ipcMain.handle('mcp:getServers', () => mcpService.getServers())

ipcMain.handle('mcp:addServer', (_event, config: MCPServer) => {
  mcpService.addServer(config)
  return { success: true }
})

ipcMain.handle('mcp:removeServer', (_event, serverId: string) => {
  mcpService.removeServer(serverId)
  return { success: true }
})

ipcMain.handle('mcp:updateServer', (_event, serverId: string, patch: Partial<MCPServer>) => {
  mcpService.updateServer(serverId, patch)
  return { success: true }
})

// 连接
ipcMain.handle('mcp:connect', async (_event, serverId: string) => {
  const server = mcpService.getServer(serverId)
  if (!server) throw new Error('服务器不存在')
  try {
    await mcpService.connect(server)
    return { success: true }
  } catch (e: any) {
    console.error('[MCP IPC] connect error:', e.message, e.stack)
    return { success: false, error: e.message }
  }
})

ipcMain.handle('mcp:disconnect', async (_event, serverId: string) => {
  await mcpService.disconnect(serverId)
  return { success: true }
})

// 工具
ipcMain.handle('mcp:listTools', async (_event, serverId: string) => {
  try {
    return mcpService.listTools(serverId)
  } catch (e: any) {
    console.error('[MCP IPC] listTools error:', e.message)
    return []
  }
})

ipcMain.handle('mcp:getAllTools', async () => {
  return mcpService.getAllTools()
})

ipcMain.handle('mcp:callTool', async (_event, serverId: string, toolName: string, args: Record<string, unknown>) => {
  return mcpService.callTool(serverId, toolName, args)
})

// 资源
ipcMain.handle('mcp:listResources', async (_event, serverId: string) => {
  return mcpService.listResources(serverId)
})

ipcMain.handle('mcp:readResource', async (_event, serverId: string, uri: string) => {
  return mcpService.readResource(serverId, uri)
})

// 提示
ipcMain.handle('mcp:listPrompts', async (_event, serverId: string) => {
  return mcpService.listPrompts(serverId)
})

ipcMain.handle('mcp:getPrompt', async (_event, serverId: string, promptName: string, args: Record<string, unknown>) => {
  return mcpService.getPrompt(serverId, promptName, args)
})

// ==================== Dialog IPC ====================

ipcMain.handle('dialog:openDirectory', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
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

// ==================== File Dialog IPC ====================

ipcMain.handle('dialog:openFile', async (_event, opts?: { filters?: Array<{ name: string; extensions: string[] }> }) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
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

// ==================== File Convert IPC ====================

ipcMain.handle('file:checkType', async (_event, filePath: string) => {
  return { isImage: isImageFile(filePath), isConvertible: isConvertible(filePath) }
})

ipcMain.handle('file:convert', async (event, filePath: string) => {
  const result = await convertWithMarkitdown(filePath, (msg) => {
    event.sender.send('file:convertProgress', { filePath, message: msg })
  })
  return result
})

// ==================== File System IPC ====================

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  try {
    return { success: true, content: fs.readFileSync(filePath, 'utf-8') }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('fs:readFileBase64', async (_event, filePath: string) => {
  try {
    const buf = fs.readFileSync(filePath)
    return { success: true, content: buf.toString('base64') }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('fs:exists', async (_event, filePath: string) => {
  return fs.existsSync(filePath)
})

ipcMain.handle('fs:listDir', async (_event, dirPath: string) => {
  try {
    const files = fs.readdirSync(dirPath)
    return { success: true, files }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('fs:stat', async (_event, filePath: string) => {
  try {
    const stat = fs.statSync(filePath)
    return {
      success: true,
      stat: {
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      },
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('fs:mkdir', async (_event, dirPath: string) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true })
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('fs:unlink', async (_event, filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath)
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true })
      } else {
        fs.unlinkSync(filePath)
      }
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

// ==================== Skills Disk IPC ====================

ipcMain.handle('skills:writeFiles', async (_event, skillId: string, files: Record<string, string>) => {
  return writeSkillFiles(skillId, files)
})

ipcMain.handle('skills:readFile', async (_event, skillId: string, filePath: string) => {
  return readSkillFile(skillId, filePath)
})

ipcMain.handle('skills:deleteFiles', async (_event, skillId: string) => {
  return deleteSkillFiles(skillId)
})

// ==================== Sandbox IPC ====================

ipcMain.handle('sandbox:executeJS', async (_event, code: string, packages?: string[]) => {
  return executeJS(code, packages)
})

ipcMain.handle('sandbox:executePython', async (_event, code: string, packages?: string[]) => {
  return executePython(code, packages)
})

// ==================== Workspace IPC ====================

ipcMain.handle('workspace:getPaths', () => getWorkspacePaths())
ipcMain.handle('workspace:listOutputs', () => listOutputFiles())
ipcMain.handle('workspace:openFile', (_event, filePath: string) => openFile(filePath))
ipcMain.handle('workspace:deleteFile', (_event, filePath: string) => deleteFile(filePath))
ipcMain.handle('workspace:clearOutputs', () => clearOutputFiles())

// ==================== App Lifecycle ====================

app.whenReady().then(() => {
  preInit()
  initWorkspace()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

app.on('before-quit', async () => {
  await mcpService.cleanup()
})
