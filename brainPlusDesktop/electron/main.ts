import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { mcpService, type MCPServer } from './main/mcp/MCPService.js'

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

// ==================== App Lifecycle ====================

app.whenReady().then(createWindow)

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
