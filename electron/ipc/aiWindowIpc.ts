/**
 * AI 模型独立窗口 IPC handler
 */
import { ipcMain, BrowserWindow, app } from 'electron'
import https from 'https'
import http from 'http'

export function registerAiWindowIpc(appIcon: string | undefined): void {
  ipcMain.handle('ai:openModel', async (_e, url: string, iconUrl?: string) => {
    // 尝试下载模型图标作为窗口图标
    let winIcon = appIcon
    if (iconUrl) {
      try {
        const { nativeImage } = require('electron')
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
}
