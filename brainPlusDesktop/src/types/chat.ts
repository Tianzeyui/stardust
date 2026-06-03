export type ToolType = 'sandbox' | 'skill' | 'agent' | 'mcp' | 'gateway' | 'workspace'

export interface ToolCallStatus {
  id: string
  name: string
  type: ToolType
  status: 'running' | 'done' | 'error'
  input?: unknown
  result?: string
}

export interface MessageAttachment {
  name: string
  type: 'image' | 'document'
  status: 'done' | 'error'
  error?: string
}

export interface UIMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  streaming?: boolean
  toolCall?: ToolCallStatus
  attachments?: MessageAttachment[]
  modelName?: string
  trace?: string  // 可观测性信息
}

export interface ConsoleLine {
  id: number
  time: string
  icon: string
  msg: string
  status: 'ok' | 'running' | 'error' | 'info'
}

/** 压缩事件数据 */
export interface CompressionEventData {
  wasCompressed: boolean
  originalTokens: number
  compressedTokens: number
  limit: number
  summary?: string
}

export function detectToolType(name: string): ToolType {
  if (name.startsWith('sandbox_')) return 'sandbox'
  if (name === 'read_skill') return 'skill'
  if (['ask_user', 'show_progress', 'notify_complete', 'update_task_list', 'delegate_task'].includes(name))
    return 'agent'
  // MCP 网关工具（目录发现、资源/提示读取）
  if (['mcp_list_resources', 'mcp_read_resource', 'mcp_list_prompts', 'mcp_get_prompt'].includes(name))
    return 'gateway'
  // enable_tool 本质是代理 MCP 业务工具调用，视觉上归类为 MCP
  if (name === 'enable_tool') return 'mcp'
  // 工作区工具
  if (name.startsWith('workspace_')) return 'workspace'
  // 真正的 MCP 业务工具（serverName__toolName 格式）
  return 'mcp'
}
