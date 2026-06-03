/**
 * 对话持久化存储 — userData/conversations/
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
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface CompressionSnapshot {
  originalTokens: number
  compressedTokens: number
  limit: number
  summary?: string
  /** 压缩时的消息数量，用于检测压缩状态是否过期 */
  messageCount: number
}

export interface Conversation {
  id: string
  title: string
  messages: any[]
  modelName?: string
  createdAt: string
  updatedAt: string
  compression?: CompressionSnapshot
}

function filePath(id: string): string {
  return path.join(dir, `${id}.json`)
}

export function listConversations(): ConversationItem[] {
  ensureDir()
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const raw = fs.readFileSync(path.join(dir, f), 'utf-8')
        const c = JSON.parse(raw)
        return {
          id: c.id,
          title: c.title || '新对话',
          modelName: c.modelName,
          messageCount: c.messages?.length || 0,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
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

export function createConversation(title?: string, modelName?: string): Conversation {
  return {
    id: 'conv_' + Date.now(),
    title: title || '新对话',
    messages: [],
    modelName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
