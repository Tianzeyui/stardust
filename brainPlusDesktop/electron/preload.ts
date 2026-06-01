const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  mcp: {
    getServers: () => ipcRenderer.invoke('mcp:getServers'),
    addServer: (config: any) => ipcRenderer.invoke('mcp:addServer', config),
    removeServer: (serverId: string) => ipcRenderer.invoke('mcp:removeServer', serverId),
    updateServer: (serverId: string, patch: any) => ipcRenderer.invoke('mcp:updateServer', serverId, patch),

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
