/**
 * 前端 MCP 客户端封装
 * 统一处理 Electron IPC 和 Web fallback
 */
import type { MCPServerConfig, MCPTool, MCPToolResult, MCPResource, MCPPrompt } from '@/types/electron'
import { getMCPServers, saveMCPServers, type MCPServerConfig as LocalMCPServer } from './config'

function api() {
  return window.electronAPI?.mcp
}

function isElectron() {
  return !!window.electronAPI?.mcp
}

// ====== 服务器 CRUD ======

export async function getServers(): Promise<MCPServerConfig[]> {
  if (isElectron()) return api()!.getServers()
  // Web fallback: 从 localStorage 读取
  const local = getMCPServers()
  return local.map(s => ({
    id: s.id, name: s.name, url: s.url,
    type: s.type as MCPServerConfig['type'],
    command: s.command, args: s.args, enabled: s.enabled,
  }))
}

export async function addServer(config: MCPServerConfig): Promise<void> {
  if (isElectron()) {
    await api()!.addServer(config)
  } else {
    const servers = getMCPServers()
    servers.push({
      id: config.id, name: config.name, url: config.url || '',
      type: config.type, command: config.command || '',
      args: config.args || [], enabled: config.enabled,
    })
    saveMCPServers(servers)
  }
}

export async function removeServer(serverId: string): Promise<void> {
  if (isElectron()) {
    await api()!.removeServer(serverId)
  } else {
    saveMCPServers(getMCPServers().filter(s => s.id !== serverId))
  }
}

export async function updateServer(serverId: string, patch: Partial<MCPServerConfig>): Promise<void> {
  if (isElectron()) {
    await api()!.updateServer(serverId, patch)
  } else {
    const servers = getMCPServers()
    const idx = servers.findIndex(s => s.id === serverId)
    if (idx !== -1) {
      servers[idx] = { ...servers[idx], ...patch }
      saveMCPServers(servers)
    }
  }
}

// ====== 连接 ======

export async function connect(serverId: string): Promise<{ success: boolean; error?: string }> {
  if (isElectron()) {
    return api()!.connect(serverId)
  }
  return { success: false, error: '非 Electron 环境' }
}

export async function disconnect(serverId: string): Promise<void> {
  if (isElectron()) {
    await api()!.disconnect(serverId)
  }
}

// ====== 工具 ======

export async function listTools(serverId: string): Promise<MCPTool[]> {
  if (isElectron()) return api()!.listTools(serverId)
  return []
}

export async function getAllTools(): Promise<{ tools: MCPTool[]; errors: Array<{ serverName: string; error: string }> }> {
  if (isElectron()) return api()!.getAllTools()
  return { tools: [], errors: [] }
}

export async function callTool(serverId: string, toolName: string, args: any): Promise<MCPToolResult> {
  if (isElectron()) return api()!.callTool(serverId, toolName, args)
  return { success: false, error: '当前环境不支持 MCP 工具调用' }
}

// ====== 资源 ======

export async function listResources(serverId: string): Promise<MCPResource[]> {
  if (isElectron()) return api()!.listResources(serverId)
  return []
}

export async function readResource(serverId: string, uri: string): Promise<{ success: boolean; content?: any; error?: string }> {
  if (isElectron()) return api()!.readResource(serverId, uri)
  return { success: false, error: '当前环境不支持 MCP 资源读取' }
}

// ====== 提示 ======

export async function listPrompts(serverId: string): Promise<MCPPrompt[]> {
  if (isElectron()) return api()!.listPrompts(serverId)
  return []
}

export async function getPrompt(serverId: string, promptName: string, args: any): Promise<any> {
  if (isElectron()) return api()!.getPrompt(serverId, promptName, args)
  return null
}
