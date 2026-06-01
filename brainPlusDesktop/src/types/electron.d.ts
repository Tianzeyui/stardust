export interface MCPServerConfig {
  id: string
  name: string
  url: string
  type: 'sse' | 'stdio' | 'streamableHttp'
  command: string
  args: string[]
  enabled: boolean
  headers?: Record<string, string>
  env?: Record<string, string>
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverId: string
  serverName: string
}

export interface MCPToolResult {
  success: boolean
  content?: Array<{ type: string; text?: string; data?: string }>
  error?: string
}

export interface MCPResource {
  name: string
  uri: string
  description?: string
  mimeType?: string
}

export interface MCPPrompt {
  name: string
  description?: string
  arguments?: Array<{ name: string; description?: string; required?: boolean }>
}

export interface ElectronAPI {
  platform: string
  mcp: {
    getServers: () => Promise<MCPServerConfig[]>
    addServer: (config: MCPServerConfig) => Promise<{ success: boolean }>
    removeServer: (serverId: string) => Promise<{ success: boolean }>
    updateServer: (serverId: string, patch: Partial<MCPServerConfig>) => Promise<{ success: boolean }>

    connect: (serverId: string) => Promise<{ success: boolean; error?: string }>
    disconnect: (serverId: string) => Promise<{ success: boolean }>

    listTools: (serverId: string) => Promise<MCPTool[]>
    getAllTools: () => Promise<{ tools: MCPTool[]; errors: Array<{ serverName: string; error: string }> }>
    callTool: (serverId: string, toolName: string, args: any) => Promise<MCPToolResult>

    listResources: (serverId: string) => Promise<MCPResource[]>
    readResource: (serverId: string, uri: string) => Promise<{ success: boolean; content?: any; error?: string }>

    listPrompts: (serverId: string) => Promise<MCPPrompt[]>
    getPrompt: (serverId: string, promptName: string, args: any) => Promise<any>
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
