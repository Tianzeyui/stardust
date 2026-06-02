export type ToolType = 'sandbox' | 'skill' | 'agent' | 'mcp'

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
}

export interface ConsoleLine {
  id: number
  time: string
  icon: string
  msg: string
  status: 'ok' | 'running' | 'error' | 'info'
}

export function detectToolType(name: string): ToolType {
  if (name.startsWith('sandbox_')) return 'sandbox'
  if (name === 'read_skill') return 'skill'
  if (['ask_user', 'show_progress', 'notify_complete', 'update_task_list'].includes(name))
    return 'agent'
  return 'mcp'
}
