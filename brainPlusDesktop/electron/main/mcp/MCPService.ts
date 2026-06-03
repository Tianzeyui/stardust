/**
 * MCP Service - Model Context Protocol 实现
 * 支持 SSE、StreamableHTTP、Stdio 三种传输模式
 */
import { spawn, type ChildProcess } from 'child_process'
import { app, net } from 'electron'
import fs from 'fs'
import path from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export interface MCPServer {
  id: string
  name: string
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  type: 'stdio' | 'sse' | 'streamableHttp'
  enabled: boolean
  headers?: Record<string, string>
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

const CONFIG_FILE = 'mcp-servers.json'

class MCPService {
  private clients: Map<string, Client> = new Map()
  private serverConfigs: Map<string, MCPServer> = new Map()

  constructor() {
    this.loadConfig()
  }

  // ====== 配置持久化 ======

  private configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE)
  }

  private loadConfig(): void {
    try {
      const raw = fs.readFileSync(this.configPath(), 'utf-8')
      const data = JSON.parse(raw)
      if (data.servers) {
        for (const s of data.servers) {
          this.serverConfigs.set(s.id, s)
        }
      }
    } catch (e: any) {
      // 首次运行文件不存在属正常，JSON 解析失败需警告
      if (e instanceof SyntaxError || e.message?.includes('JSON')) {
        console.warn('[MCPService] 配置文件 JSON 解析失败，将使用空配置:', e.message)
      }
    }
  }

  private saveConfig(): void {
    const servers = Array.from(this.serverConfigs.values())
    fs.writeFileSync(this.configPath(), JSON.stringify({ servers }, null, 2), 'utf-8')
  }

  // ====== 服务器管理 ======

  addServer(config: MCPServer): void {
    this.serverConfigs.set(config.id, { ...config })
    this.saveConfig()
  }

  removeServer(id: string): void {
    this.closeClient(id)
    this.serverConfigs.delete(id)
    this.saveConfig()
  }

  updateServer(id: string, patch: Partial<MCPServer>): void {
    const existing = this.serverConfigs.get(id)
    if (existing) {
      // 关键字段变更时断开旧连接（URL、命令、传输类型变了，旧连接已失效）
      const keyChanged = (patch.url !== undefined && patch.url !== existing.url)
        || (patch.command !== undefined && patch.command !== existing.command)
        || (patch.type !== undefined && patch.type !== existing.type)
      if (keyChanged) {
        this.closeClient(id)
      }
      this.serverConfigs.set(id, { ...existing, ...patch })
      this.saveConfig()
    }
  }

  getServers(): MCPServer[] {
    return Array.from(this.serverConfigs.values())
  }

  getServer(id: string): MCPServer | undefined {
    return this.serverConfigs.get(id)
  }

  // ====== 连接管理 ======

  async connect(server: MCPServer): Promise<Client> {
    const existing = this.clients.get(server.id)
    if (existing) return existing

    let transport

    if (server.type === 'stdio' && server.command) {
      transport = new StdioClientTransport({
        command: server.command,
        args: server.args || [],
        env: { ...process.env, ...server.env } as Record<string, string>,
      })
    } else if (server.type === 'sse' && server.url) {
      const customFetch = async (url: string | URL, init?: RequestInit) => {
        return net.fetch(typeof url === 'string' ? url : url.toString(), init)
      }
      transport = new SSEClientTransport(new URL(server.url), {
        fetch: customFetch,
        requestInit: {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            ...server.headers,
          },
        },
      })
    } else if (server.type === 'streamableHttp' && server.url) {
      const customFetch = async (url: string | URL, init?: RequestInit) => {
        return net.fetch(typeof url === 'string' ? url : url.toString(), init)
      }
      transport = new StreamableHTTPClientTransport(new URL(server.url), {
        fetch: customFetch,
        requestInit: {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            ...server.headers,
          },
        },
      })
    } else {
      throw new Error(`不支持的类型或缺少配置: type=${server.type}, url=${server.url}, command=${server.command}`)
    }

    const client = new Client(
      { name: 'BrainPlus', version: '1.0.0' },
      { capabilities: {} },
    )

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`连接超时 (30s): ${server.name}`)), 30000),
    )
    await Promise.race([client.connect(transport), timeout])

    this.clients.set(server.id, client)
    return client
  }

  disconnect(id: string): void {
    this.closeClient(id)
  }

  private closeClient(id: string): void {
    const client = this.clients.get(id)
    if (client) {
      try { client.close() } catch { /* ignore */ }
      this.clients.delete(id)
    }
  }

  async closeAll(): Promise<void> {
    for (const id of this.clients.keys()) {
      await this.closeClient(id)
    }
  }

  // ====== 工具 ======

  async listTools(serverId: string): Promise<MCPTool[]> {
    const server = this.serverConfigs.get(serverId)
    if (!server) throw new Error('服务器不存在')
    try {
      const client = await this.connect(server)
      const result = await client.listTools()
      console.log(`[MCPService] listTools ${server.name}: ${result.tools?.length || 0} tools`)
      return (result.tools || []).map((t: any) => {
        const schema = t.inputSchema || {}
        console.log(`[MCPService] tool "${t.name}" inputSchema:`, JSON.stringify(schema).slice(0, 300))
        return {
          name: t.name,
          description: t.description || '',
          inputSchema: schema,
          serverId: server.id,
          serverName: server.name,
        }
      })
    } catch (e: any) {
      console.error(`[MCPService] listTools error for ${server.name}:`, e.message, e.stack)
      throw e
    }
  }

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const client = this.clients.get(serverId)
    if (!client) return { success: false, error: '未连接到服务器' }
    try {
      const result = await client.callTool({ name: toolName, arguments: args })
      return { success: true, content: result.content as any[] }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  async getAllTools(): Promise<{ tools: MCPTool[]; errors: Array<{ serverName: string; error: string }> }> {
    const tools: MCPTool[] = []
    const errors: Array<{ serverName: string; error: string }> = []
    for (const s of this.getServers().filter((s) => s.enabled)) {
      try {
        tools.push(...(await this.listTools(s.id)))
      } catch (e: any) {
        errors.push({ serverName: s.name, error: e.message })
      }
    }
    return { tools, errors }
  }

  // ====== 资源 ======

  async listResources(serverId: string): Promise<any[]> {
    const server = this.serverConfigs.get(serverId)
    if (!server) throw new Error('服务器不存在')
    try {
      const client = await this.connect(server)
      const result = await client.listResources()
      return result.resources || []
    } catch (e: any) {
      console.error(`[MCPService] listResources error for ${server.name}:`, e.message)
      return []
    }
  }

  async readResource(serverId: string, uri: string): Promise<{ success: boolean; content?: any; error?: string }> {
    const client = this.clients.get(serverId)
    if (!client) return { success: false, error: '未连接到服务器' }
    try {
      const result = await client.readResource({ uri })
      return { success: true, content: result }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  // ====== 提示 ======

  async listPrompts(serverId: string): Promise<any[]> {
    const server = this.serverConfigs.get(serverId)
    if (!server) return []
    const client = await this.connect(server)
    try {
      const result = await client.listPrompts()
      return result.prompts || []
    } catch {
      return []
    }
  }

  async getPrompt(serverId: string, promptName: string, args: Record<string, unknown>): Promise<any> {
    const server = this.serverConfigs.get(serverId)
    if (!server) throw new Error('服务器不存在')
    try {
      const client = await this.connect(server)
      return await client.getPrompt({ name: promptName, arguments: args })
    } catch (e: any) {
      console.error(`[MCPService] getPrompt error for ${server.name}:`, e.message)
      throw e
    }
  }

  async getAllResources(): Promise<{ resources: any[]; errors: Array<{ serverName: string; error: string }> }> {
    const resources: any[] = []
    const errors: Array<{ serverName: string; error: string }> = []
    for (const s of this.getServers().filter((s) => s.enabled)) {
      try {
        const list = await this.listResources(s.id)
        for (const r of list) {
          resources.push({ ...r, serverId: s.id, serverName: s.name })
        }
      } catch (e: any) {
        errors.push({ serverName: s.name, error: e.message })
      }
    }
    return { resources, errors }
  }

  async getAllPrompts(): Promise<{ prompts: any[]; errors: Array<{ serverName: string; error: string }> }> {
    const prompts: any[] = []
    const errors: Array<{ serverName: string; error: string }> = []
    for (const s of this.getServers().filter((s) => s.enabled)) {
      try {
        const list = await this.listPrompts(s.id)
        for (const p of list) {
          prompts.push({ ...p, serverId: s.id, serverName: s.name })
        }
      } catch (e: any) {
        errors.push({ serverName: s.name, error: e.message })
      }
    }
    return { prompts, errors }
  }

  // ====== 清理 ======

  async cleanup(): Promise<void> {
    await this.closeAll()
    this.serverConfigs.clear()
  }
}

export const mcpService = new MCPService()
