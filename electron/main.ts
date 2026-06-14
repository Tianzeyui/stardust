import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import { fileURLToPath } from 'url'
import { mcpService, type MCPServer } from './main/mcp/MCPService.js'
import { startA2AServer, stopA2AServer, completeA2ATask, getA2ATask, syncAgents, setA2AToken } from './main/a2aServer.js'
import { executeJS, executePython, preInit } from './main/sandboxService.js'
import { initWorkspace, getWorkspacePaths, listOutputFiles, openFile, deleteFile, clearOutputFiles } from './main/workspace.js'
import { writeSkillFiles, readSkillFile, deleteSkillFiles } from './main/skillDiskStore.js'
import { downloadPluginFiles } from './main/pluginDownloader.js'
import { convertWithMarkitdown, isImageFile, isConvertible } from './main/fileConvert.js'
import {
  getModelStatus,
  getModelDir,
  downloadModel,
  deleteModel,
  onModelEvent,
  isModelInstalled,
  setModelEnabled,
} from './main/localModelManager.js'
import { loadModel, chatLocal, unloadModel } from './main/localInference.js'
import {
  listConversations, getConversation, saveConversation,
  deleteConversation, createConversation,
} from './main/conversationStore.js'
import {
  getSupabase, saveSupabase as saveSupabaseCfg, clearSupabase as clearSupabaseCfg,
  getCloudinary, saveCloudinary as saveCloudinaryCfg, clearCloudinary as clearCloudinaryCfg,
  getAIModels as getAIModelsCfg, saveAIModels as saveAIModelsCfg,
} from './main/configStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// macOS 开发模式下替换菜单栏显示名称
if (process.platform === 'darwin') app.setName('BrainPlus')

let mainWindow: BrowserWindow | null = null

const appIconPath = path.join(__dirname, '../public/assets/icons/icon.png')
const appIcon = fs.existsSync(appIconPath) ? appIconPath : undefined

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'BrainPlus',
    icon: appIcon,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    ...(process.platform !== 'darwin' ? {
      titleBarOverlay: { color: '#ffffff', symbolColor: '#1a1a1a', height: 36 },
    } : {}),
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
    return await mcpService.listTools(serverId)
  } catch (e: any) {
    console.error('[MCP IPC] listTools error:', e.message)
    throw e  // 向上传播，前端可 catch 并展示错误
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
ipcMain.handle('mcp:getAllResources', async () => {
  return mcpService.getAllResources()
})

ipcMain.handle('mcp:readResource', async (_event, serverId: string, uri: string) => {
  return mcpService.readResource(serverId, uri)
})

// 提示
ipcMain.handle('mcp:listPrompts', async (_event, serverId: string) => {
  return mcpService.listPrompts(serverId)
})
ipcMain.handle('mcp:getAllPrompts', async () => {
  return mcpService.getAllPrompts()
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

ipcMain.handle('sandbox:executeJS', async (_event, code: string, packages?: string[], outputDir?: string) => {
  return executeJS(code, packages, outputDir)
})

ipcMain.handle('sandbox:executePython', async (_event, code: string, packages?: string[], outputDir?: string) => {
  return executePython(code, packages, outputDir)
})

// ==================== Workspace IPC ====================

ipcMain.handle('workspace:getPaths', () => getWorkspacePaths())
ipcMain.handle('workspace:listOutputs', () => listOutputFiles())
ipcMain.handle('workspace:openFile', (_event, filePath: string) => openFile(filePath))
ipcMain.handle('workspace:deleteFile', (_event, filePath: string) => deleteFile(filePath))
ipcMain.handle('workspace:clearOutputs', () => clearOutputFiles())

// ==================== Shell IPC ====================

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
    // Linux: try common terminals
    const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'x-terminal-emulator']
    for (const term of terminals) {
      try {
        exec(`cd "${dirPath}" && ${term}`)
        break
      } catch { continue }
    }
  }
})

// ==================== Config IPC ====================

ipcMain.handle('config:getSupabase', () => getSupabase())
ipcMain.handle('config:saveSupabase', (_e, c: any) => saveSupabaseCfg(c))
ipcMain.handle('config:clearSupabase', () => { clearSupabaseCfg(); return true })

ipcMain.handle('config:getCloudinary', () => getCloudinary())
ipcMain.handle('config:saveCloudinary', (_e, c: any) => saveCloudinaryCfg(c))
ipcMain.handle('config:clearCloudinary', () => { clearCloudinaryCfg(); return true })

ipcMain.handle('config:getAIModels', () => getAIModelsCfg())
ipcMain.handle('config:saveAIModels', (_e, models: any[]) => saveAIModelsCfg(models))

// ==================== Local Model IPC ====================

ipcMain.handle('model:getStatus', () => getModelStatus())

ipcMain.handle('model:download', async (_event, id: string) => {
  return downloadModel(id)
})

ipcMain.handle('model:delete', async (_event, id: string) => {
  return { success: deleteModel(id) }
})

ipcMain.handle('model:isInstalled', async (_event, id: string) => {
  return isModelInstalled(id)
})

ipcMain.handle('model:toggleEnabled', async (_event, id: string, enabled: boolean) => {
  setModelEnabled(id, enabled)
  return true
})

ipcMain.handle('model:openDir', async () => {
  shell.openPath(getModelDir())
  return true
})

ipcMain.handle('model:load', async (_event, id: string) => {
  return loadModel(id)
})

ipcMain.handle('model:unload', async () => {
  await unloadModel()
  return true
})

// 本地模型流式聊天
ipcMain.on('model:chat', async (event, id: string, messages: Array<{ role: string; content: string }>) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return

  try {
    console.log('[model:chat] 加载模型:', id)
    const loadResult = await loadModel(id)
    if (!loadResult.success) {
      console.error('[model:chat] 加载失败:', loadResult.error)
      win.webContents.send('model:chatError', { error: loadResult.error || '加载失败' })
      return
    }
    console.log('[model:chat] 模型已加载，开始推理')

    const stream = chatLocal(messages)
    for await (const chunk of stream) {
      if (win.isDestroyed()) break
      win.webContents.send('model:chatChunk', { text: chunk })
    }
    if (!win.isDestroyed()) {
      win.webContents.send('model:chatDone', {})
    }
  } catch (e: any) {
    console.error('[model:chat] 推理异常:', e.message, e.stack)
    if (!win.isDestroyed()) {
      win.webContents.send('model:chatError', { error: e.message || '推理异常' })
    }
  }
})

// 模型事件 → 推送
ipcMain.on('model:subscribe', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return

  const unsubProgress = onModelEvent('download:progress', (id: string, loaded: number, total: number) => {
    if (!win.isDestroyed()) win.webContents.send('model:downloadProgress', { id, loaded, total })
  })
  const unsubDone = onModelEvent('download:done', (id: string, success: boolean, error: string) => {
    if (!win.isDestroyed()) win.webContents.send('model:downloadDone', { id, success, error })
  })

  event.sender.on('destroyed', () => { unsubProgress(); unsubDone() })
  event.returnValue = true
})

// ==================== Conversation IPC ====================

ipcMain.handle('conv:list', (_e, projectId?: string | null) => listConversations(projectId))
ipcMain.handle('conv:get', (_e, id: string) => getConversation(id))
ipcMain.handle('conv:save', (_e, conv: any) => { saveConversation(conv); return true })
ipcMain.handle('conv:delete', (_e, id: string) => deleteConversation(id))
ipcMain.handle('conv:create', (_e, title?: string, modelName?: string, projectId?: string | null, projectName?: string) => createConversation(title, modelName, projectId, projectName))

// ==================== AI 模型独立窗口 ====================

ipcMain.handle('ai:openModel', async (_e, url: string, iconUrl?: string) => {
  // 尝试下载模型图标作为窗口图标
  let winIcon = appIcon
  if (iconUrl) {
    try {
      const { nativeImage } = require('electron')
      const https = require('https')
      const http = require('http')
      const imgData: Buffer = await new Promise((resolve, reject) => {
        const get = iconUrl.startsWith('https') ? https.get : http.get
        get(iconUrl, (res: any) => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => resolve(Buffer.concat(chunks)))
        }).on('error', reject)
      })
      winIcon = nativeImage.createFromBuffer(imgData)
    } catch { /* 回退到默认图标 */ }
  }

  const modelWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    title: 'AI 模型',
    icon: winIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  modelWindow.setMenu(null)
  modelWindow.loadURL(url)

  modelWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    modelWindow.webContents.loadURL(`data:text/html,<h2 style="font-family:sans-serif;text-align:center;margin-top:40vh;color:%23666">无法加载页面</h2><p style="text-align:center;color:%23999">${desc}</p>`)
  })
})

// ==================== 关于窗口 ====================

function showAbout() {
  mainWindow?.webContents.send('showAbout')
}

// ==================== App Lifecycle ====================

app.whenReady().then(() => {
  preInit()
  startA2AServer(9090)  // A2A HTTP Server
  initWorkspace()
  createWindow()
  // macOS Dock 图标 + 关于信息
  if (process.platform === 'darwin' && appIcon && app.dock) {
    app.dock.setIcon(appIcon)
  }
  app.setAboutPanelOptions({
    applicationName: 'BrainPlus',
    applicationVersion: app.getVersion(),
    copyright: `© ${__BUILD_YEAR__} 沉浸位工作室`,
    credits: 'AI 赋能创作，让灵感自由流淌。',
    website: 'https://github.com/Tianzeyui/brainPlus',
    iconPath: appIcon,
  })
  // Windows/Linux 移除菜单栏；macOS 保留应用名 + Edit 菜单
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: 'BrainPlus',
        submenu: [
          { label: '关于 BrainPlus', click: showAbout },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
    ]))
  } else {
    Menu.setApplicationMenu(null)
  }
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

// ==================== A2A IPC ====================

ipcMain.handle('a2a:completeTask', (_e, taskId: string, output: string, error?: string) => {
  completeA2ATask(taskId, output, error)
  return true
})

ipcMain.handle('a2a:getTask', (_e, taskId: string) => {
  return getA2ATask(taskId) || null
})

ipcMain.handle('a2a:getPort', () => 9090)
ipcMain.handle('a2a:syncAgents', (_e, agents: any[]) => { syncAgents(agents); return true })
ipcMain.handle('a2a:start', (_e, port: number) => { startA2AServer(port); return true })
ipcMain.handle('a2a:stop', () => { stopA2AServer(); return true })
ipcMain.handle('a2a:status', () => ({ running: true, port: 9090 }))  // TODO: track actual running state
ipcMain.handle('a2a:setToken', (_e, token: string) => { setA2AToken(token); return true })

// ==================== Plugin IPC ====================

ipcMain.handle('plugin:load', async (_e, dirPath: string) => {
  try {
    const fs = await import('fs')
    const path = await import('path')
    const manifestPath = path.join(dirPath, 'manifest.json')
    if (!fs.existsSync(manifestPath)) return { success: false, error: '未找到 manifest.json' }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    return { success: true, manifest, pluginDir: dirPath }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

// 安装插件：复制到 appData 目录，后续与原路径无关
ipcMain.handle('plugin:install', async (_e, dirPath: string) => {
  try {
    const fs = await import('fs')
    const path = await import('path')
    const manifestPath = path.join(dirPath, 'manifest.json')
    if (!fs.existsSync(manifestPath)) return { success: false, error: '未找到 manifest.json' }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    const pluginId = manifest.id || path.basename(dirPath)

    // 目标目录：{userData}/plugins/{pluginId}/
    const pluginsDir = path.join(app.getPath('userData'), 'plugins')
    const destDir = path.join(pluginsDir, pluginId)

    // 如果已存在，先删除旧版本再覆盖
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true })
    fs.mkdirSync(destDir, { recursive: true })

    // 递归复制
    fs.cpSync(dirPath, destDir, { recursive: true })

    // 安装 npm 依赖
    const pkgPath = path.join(destDir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
        if (!pkg.name) { pkg.name = pluginId; pkg.private = true; fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8') }
        if (!fs.existsSync(path.join(destDir, 'node_modules'))) {
          const { execFile } = await import('child_process')
          await new Promise<void>((resolve, reject) => {
            execFile('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: destDir, timeout: 120000 }, (err) => {
              if (err) reject(err); else resolve()
            })
          })
        }
      }
    }

    // 加载 manifest
    return { success: true, manifest, pluginDir: destDir }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('plugin:installDeps', async (_e, dirPath: string) => {
  try {
    const fs = await import('fs')
    const path = await import('path')
    const pkgPath = path.join(dirPath, 'package.json')
    if (!fs.existsSync(pkgPath)) return { success: true }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    if (!pkg.dependencies || Object.keys(pkg.dependencies).length === 0) return { success: true }
    if (!pkg.name) {
      pkg.name = path.basename(dirPath)
      pkg.private = true
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8')
    }
    if (fs.existsSync(path.join(dirPath, 'node_modules'))) return { success: true }
    const { execFile } = await import('child_process')
    return new Promise((resolve) => {
      execFile('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: dirPath, timeout: 120000 }, (err) => {
        if (err) resolve({ success: false, error: err.message })
        else resolve({ success: true })
      })
    })
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('plugin:compile', async (_e, dirPath: string) => {
  try {
    const fs = await import('fs')
    const path = await import('path')
    const tsxPath = path.join(dirPath, 'index.tsx')
    const jsxPath = path.join(dirPath, 'index.jsx')
    const entryPath = fs.existsSync(tsxPath) ? tsxPath : fs.existsSync(jsxPath) ? jsxPath : null
    if (!entryPath) return { success: false, error: '未找到 index.tsx 或 index.jsx' }

    const esbuild = await import('esbuild')
    const result = await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'browser',
      // 强制 transform 模式（忽略项目 tsconfig 的 react-jsx），用 React.createElement
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      tsconfigRaw: JSON.stringify({ compilerOptions: { jsx: 'react' } }),
      external: ['react', 'react-dom', 'lucide-react', '@/lib/utils', '@/components/ui/*', '@/components/diary/*', '@/components/inspiration/*'],
      target: 'es2020',
      banner: { js: "const React = require('react');" },
      plugins: [{
        name: 'resolve-at-alias',
        setup(build) {
          // 将动态 import 中的 @/ 替换为 /src/，浏览器才能解析
          build.onResolve({ filter: /^@\/components\/(diary|inspiration)\// }, args => ({
            path: args.path.replace('@/', '/src/'), external: true,
          }))
        },
      }],
    })
    const code = result.outputFiles?.[0]?.text || ''
    return { success: true, code }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

// 卸载插件：删除 appData 中的插件目录
ipcMain.handle('plugin:uninstall', async (_e, pluginId: string) => {
  try {
    const fs = await import('fs')
    const path = await import('path')
    const destDir = path.join(app.getPath('userData'), 'plugins', pluginId)
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true })
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

// 从社区仓库安装插件（通过 jsDelivr CDN 下载）
ipcMain.handle('plugin:installFromGithub', async (event, pluginId: string, fileList: string[], manifestId?: string) => {
  try {
    const pluginsDir = path.join(app.getPath('userData'), 'plugins')
    const actualId = manifestId || pluginId
    const destDir = path.join(pluginsDir, actualId)

    // 如果已存在，先删除
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true })
    fs.mkdirSync(destDir, { recursive: true })

    // 通过 jsDelivr CDN 下载所有文件
    await downloadPluginFiles(pluginId, fileList, destDir, (file, current, total) => {
      event.sender.send('plugin:githubProgress', { pluginId, file, current, total })
    })

    // 读取 manifest 用于返回
    const manifestPath = path.join(destDir, 'manifest.json')
    const manifest = fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      : { id: actualId }

    // 安装 npm 依赖（复用现有逻辑）
    const pkgPath = path.join(destDir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
        if (!pkg.name) { pkg.name = actualId; pkg.private = true; fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8') }
        if (!fs.existsSync(path.join(destDir, 'node_modules'))) {
          const { execFile } = await import('child_process')
          await new Promise<void>((resolve, reject) => {
            execFile('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: destDir, timeout: 120000 }, (err) => {
              if (err) reject(err); else resolve()
            })
          })
        }
      }
    }

    return { success: true, manifest, pluginDir: destDir }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

// 搜索代理：主进程发起 HTTP 请求（绕过渲染进程 CORS 限制）
ipcMain.handle('search:fetch', async (_e, url: string, timeout: number) => {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const text = await res.text()
      return { success: true, data: text }
    } finally { clearTimeout(timer) }
  } catch (e: any) {
    if (e.name === 'AbortError') return { success: false, error: 'timeout' }
    return { success: false, error: e.message }
  }
})

// 通用 HTTP 代理（插件用）
ipcMain.handle('http:fetch', async (_e, url: string, opts?: { method?: string; headers?: Record<string, string>; body?: string; timeout?: number }) => {
  try {
    const timeout = opts?.timeout || 15000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const res = await fetch(url, {
        method: opts?.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/json,*/*',
          ...(opts?.headers || {}),
        },
        body: opts?.body || undefined,
        signal: controller.signal,
      })
      const text = await res.text()
      return { success: true, data: text, status: res.status }
    } finally { clearTimeout(timer) }
  } catch (e: any) {
    if (e.name === 'AbortError') return { success: false, error: 'timeout' }
    return { success: false, error: e.message }
  }
})

app.on('before-quit', async () => {
  await mcpService.cleanup()
})
