/** 记忆分层类型定义 */

export interface Memory {
  id: string
  content: string         // "用户是前端工程师"
  category: 'preference' | 'fact' | 'project' | 'general'
  importance: number      // 0-10，越高越重要
  source: 'extracted' | 'manual'
  createdAt: number       // timestamp
  updatedAt: number
}

export interface MemoryStore {
  getAll(): Promise<Memory[]>
  add(m: Memory): Promise<void>
  update(id: string, patch: Partial<Memory>): Promise<void>
  delete(id: string): Promise<void>
  clear(): Promise<void>
}

export interface MemoryManagerOptions {
  shortTermLimit: number   // 短期记忆上限，默认 10
  longTermLimit: number    // 长期记忆上限，默认 50
  injectLimit: number      // 每次注入 system prompt 上限，默认 5
  promoteThreshold: number // 积累多少条新事实后升级长期记忆，默认 5
}
