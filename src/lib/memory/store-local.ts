/**
 * 短期记忆存储 — localStorage
 * 按会话隔离，每个 convId 一个 key
 */
import type { Memory, MemoryStore } from './types'

const PREFIX = 'stardust_memory_'

function key(convId: string): string {
  return PREFIX + convId
}

export function createLocalMemoryStore(convId: string): MemoryStore {
  return {
    async getAll() {
      try {
        const raw = localStorage.getItem(key(convId))
        return raw ? JSON.parse(raw) : []
      } catch { return [] }
    },

    async add(m) {
      const all = await this.getAll()
      all.push(m)
      localStorage.setItem(key(convId), JSON.stringify(all))
    },

    async update(id, patch) {
      const all = await this.getAll()
      const idx = all.findIndex(m => m.id === id)
      if (idx === -1) return
      all[idx] = { ...all[idx], ...patch, updatedAt: Date.now() }
      localStorage.setItem(key(convId), JSON.stringify(all))
    },

    async delete(id) {
      const all = await this.getAll()
      localStorage.setItem(key(convId), JSON.stringify(all.filter(m => m.id !== id)))
    },

    async clear() {
      localStorage.removeItem(key(convId))
    },
  }
}

/** 清理当前会话外的过期短期记忆（可选，提供清理入口但不在 Manager 内自动调用） */
export function cleanOldMemories(maxAge: number = 7 * 24 * 3600 * 1000) {
  const now = Date.now()
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(k) || '[]') as Memory[]
        if (data.length === 0 || (now - (data[data.length - 1]?.updatedAt ?? 0)) > maxAge) {
          localStorage.removeItem(k)
        }
      } catch { localStorage.removeItem(k) }
    }
  }
}
