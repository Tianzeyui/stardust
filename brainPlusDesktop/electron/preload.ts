const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  },

  workspace: {
    getPaths: () => ipcRenderer.invoke('workspace:getPaths'),
    listOutputs: () => ipcRenderer.invoke('workspace:listOutputs'),
    openFile: (filePath: string) => ipcRenderer.invoke('workspace:openFile', filePath),
    deleteFile: (filePath: string) => ipcRenderer.invoke('workspace:deleteFile', filePath),
    clearOutputs: () => ipcRenderer.invoke('workspace:clearOutputs'),
  },

  sandbox: {
    executeJS: (code: string, packages?: string[]) => ipcRenderer.invoke('sandbox:executeJS', code, packages),
    executePython: (code: string, packages?: string[]) => ipcRenderer.invoke('sandbox:executePython', code, packages),
  },

  fs: {
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    exists: (filePath: string) => ipcRenderer.invoke('fs:exists', filePath),
    listDir: (dirPath: string) => ipcRenderer.invoke('fs:listDir', dirPath),
    stat: (filePath: string) => ipcRenderer.invoke('fs:stat', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    mkdir: (dirPath: string) => ipcRenderer.invoke('fs:mkdir', dirPath),
    unlink: (filePath: string) => ipcRenderer.invoke('fs:unlink', filePath),
  },

  skills: {
    writeFiles: (skillId: string, files: Record<string, string>) =>
      ipcRenderer.invoke('skills:writeFiles', skillId, files),
    readFile: (skillId: string, filePath: string) =>
      ipcRenderer.invoke('skills:readFile', skillId, filePath),
    deleteFiles: (skillId: string) =>
      ipcRenderer.invoke('skills:deleteFiles', skillId),
  },

  mcp: {
    getServers: () => ipcRenderer.invoke('mcp:getServers'),
    addServer: (config: any) => ipcRenderer.invoke('mcp:addServer', config),
    removeServer: (serverId: string) => ipcRenderer.invoke('mcp:removeServer', serverId),
    updateServer: (serverId: string, patch: any) => ipcRenderer.invoke('mcp:updateServer', serverId),

    connect: (serverId: string) => ipcRenderer.invoke('mcp:connect', serverId),
    disconnect: (serverId: string) => ipcRenderer.invoke('mcp:disconnect', serverId),

    listTools: (serverId: string) => ipcRenderer.invoke('mcp:listTools', serverId),
    getAllTools: () => ipcRenderer.invoke('mcp:getAllTools'),
    callTool: (serverId: string, toolName: string, args: any) =>
      ipcRenderer.invoke('mcp:callTool', serverId, toolName, args),

    listResources: (serverId: string) => ipcRenderer.invoke('mcp:listResources', serverId),
    readResource: (serverId: string, uri: string) =>
      ipcRenderer.invoke('mcp:readResource', serverId, uri),

    listPrompts: (serverId: string) => ipcRenderer.invoke('mcp:listPrompts', serverId),
    getPrompt: (serverId: string, promptName: string, args: any) =>
      ipcRenderer.invoke('mcp:getPrompt', serverId, promptName, args),
  },
})
