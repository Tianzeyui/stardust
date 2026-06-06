/**
 * 对话持久化存储 — userData/conversations/
 * 支持 projectId 绑定
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const dir = path.join(app.getPath('userData'), 'conversations')

function ensureDir() {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export interface ConversationItem {
  id: string
  title: string
  modelName?: string
  projectId?: string | null   // null = 全局对话，string = 绑定项目
  projectName?: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface CompressionSnapshot {
  originalTokens: number
  compressedTokens: number
  limit: number
  summary?: string
  messageCount: number
}

export interface Conversation {
  id: string
  title: string
  messages: any[]
  modelName?: string
  projectId?: string | null
  projectName?: string
  createdAt: string
  updatedAt: string
  compression?: CompressionSnapshot
}

function filePath(id: string): string {
  return path.join(dir, `${id}.json`)
}

export function listConversations(projectId?: string | null): ConversationItem[] {
  ensureDir()
  try {
    let items = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const raw = fs.readFileSync(path.join(dir, f), 'utf-8')
        const c = JSON.parse(raw)
        return {
          id: c.id,
          title: c.title || '新对话',
          modelName: c.modelName,
          projectId: c.projectId ?? null,
          projectName: c.projectName,
          messageCount: c.messages?.length || 0,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

    // projectId 筛选：undefined=全部, null=全局, string=指定项目
    if (projectId === null) {
      items = items.filter(c => !c.projectId)
    } else if (projectId) {
      items = items.filter(c => c.projectId === projectId)
    }
    return items
  } catch { return [] }
}

export function getConversation(id: string): Conversation | null {
  const p = filePath(id)
  if (!fs.existsSync(p)) return null
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null }
}

export function saveConversation(conv: Conversation): void {
  ensureDir()
  conv.updatedAt = new Date().toISOString()
  fs.writeFileSync(filePath(conv.id), JSON.stringify(conv, null, 2))
}

export function deleteConversation(id: string): boolean {
  const p = filePath(id)
  if (!fs.existsSync(p)) return false
  try { fs.unlinkSync(p); return true } catch { return false }
}

export function createConversation(title?: string, modelName?: string, projectId?: string | null, projectName?: string): Conversation {
  return {
    id: 'conv_' + Date.now(),
    title: title || '新对话',
    messages: [],
    modelName,
    projectId: projectId ?? null,
    projectName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
