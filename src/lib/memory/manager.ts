/**
 * MemoryManager — 分层记忆管理
 * 短期记忆 (localStorage per-conversation) + 长期记忆 (Supabase)
 */
import type { ChatMessage } from '../api'
import type { Memory, MemoryStore } from './types'

/** 提取事实的 system prompt */
const EXTRACT_PROMPT =
  '从以下对话中提取关于用户的持久信息（偏好/事实/技能/项目）。' +
  '每条一行 "- 关键词: 描述"。提取"是什么"，不提取"做了什么临时操作"。' +
  '无新信息返回 "(none)"。保持简洁，不超过 10 行。'

/** 中文 + 英文分词（复用 toolDisclosure 相同逻辑） */
function tokenize(text: string): string[] {
  const lower = text.toLowerCase()
  const tokens: string[] = []
  const words = lower.match(/[a-z0-9]+/g) || []
  tokens.push(...words)
  const chinese = lower.match(/[一-鿿]+/g) || []
  tokens.push(...chinese.flatMap(s => s.split('')))
  return [...new Set(tokens)]
}

/** 简单关键词匹配得分 */
function matchScore(memory: Memory, keywords: string[]): number {
  let score = 0
  const text = memory.content.toLowerCase()
  for (const kw of keywords) {
    if (kw.length < 2) continue
    if (text.includes(kw)) score += 1
    if (memory.category === 'preference') score += 1
    if (memory.importance >= 5) score += 2
  }
  return score
}

function generateId(): string {
  return 'mem_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export class MemoryManager {
  private shortTerm: MemoryStore
  private longTerm: MemoryStore
  private opts: {
    shortTermLimit: number
    longTermLimit: number
    injectLimit: number
    promoteThreshold: number
  }
  constructor(
    shortTerm: MemoryStore,
    longTerm: MemoryStore,
    opts?: {
      shortTermLimit?: number
      longTermLimit?: number
      injectLimit?: number
      promoteThreshold?: number
    },
  ) {
    this.shortTerm = shortTerm
    this.longTerm = longTerm
    this.opts = {
      shortTermLimit: opts?.shortTermLimit ?? 10,
      longTermLimit: opts?.longTermLimit ?? 50,
      injectLimit: opts?.injectLimit ?? 5,
      promoteThreshold: opts?.promoteThreshold ?? 3,
    }
  }

  /** 从对话消息中提取结构化事实 */
  async extract(messages: ChatMessage[]): Promise<Memory[]> {
    const text = messages
      .map(m => {
        const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : m.role
        const content = typeof m.content === 'string' ? m.content : ''
        return `[${role}]: ${content.slice(0, 500)}`
      })
      .join('\n')

    try {
      const { delegateToModel } = await import('../chatService')
      const { result } = await delegateToModel('fast', text, EXTRACT_PROMPT)
      if (!result || result.trim() === '(none)') return []

      return result
        .split('\n')
        .map(line => line.replace(/^[•\-\s]*/, '').trim())
        .filter(line => line.length > 5 && line.includes(':'))
        .map(line => {
          const colonIdx = line.indexOf(':')
          const content = colonIdx > 0 ? line.slice(colonIdx + 1).trim() : line
          return {
            id: generateId(),
            content: content.length > 120 ? content.slice(0, 120) : content,
            category: detectCategory(content),
            importance: calcImportance(content),
            source: 'extracted' as const,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          } satisfies Memory
        })
    } catch {
      return []
    }
  }

  /** 存入短期记忆（去重 + 上限淘汰） */
  async saveToShortTerm(memories: Memory[]) {
    const existing = await this.shortTerm.getAll()

    for (const m of memories) {
      // 去重：短文本用包含关系，长文本用相似度
      const duplicate = existing.find(e => {
        if (m.content.length < 15 || e.content.length < 15) {
          return m.content.includes(e.content) || e.content.includes(m.content)
        }
        return similarity(e.content, m.content) > 0.4
      })
      if (duplicate) {
        // 更新已有的
        existing[existing.indexOf(duplicate)] = {
          ...duplicate,
          content: m.content,
          importance: Math.max(duplicate.importance, m.importance),
          updatedAt: Date.now(),
        }
        continue
      }
      existing.push(m)
    }

    // 上限淘汰：FIFO，优先保留 importance 高的
    while (existing.length > this.opts.shortTermLimit) {
      const toRemove = existing.reduce((worst, m, i) =>
        !worst || m.importance < worst.importance ? m : worst, null as Memory | null)
      if (toRemove) {
        existing.splice(existing.indexOf(toRemove), 1)
      } else {
        existing.shift() // 全等，FIFO
      }
    }

    await this.shortTerm.clear()
    for (const m of existing) {
      await this.shortTerm.add(m)
    }

    // 短期记忆累计 ≥ 阈值时升级长期记忆（基于实际总量，不依赖实例变量）
    const total = (await this.shortTerm.getAll()).length
    console.log(`[memory] 短期记忆: ${total}/${this.opts.promoteThreshold}`)
    if (total >= this.opts.promoteThreshold) {
      console.log('[memory] 触发长期记忆升级...')
      await this.promoteToLongTerm()
      console.log('[memory] 长期记忆升级完成')
    }
  }

  /** 将短期记忆升级为长期记忆（语义去重 + importance 评分 + 上限淘汰） */
  private async promoteToLongTerm() {
    const shortTerm = await this.shortTerm.getAll()
    const longTerm = await this.longTerm.getAll()

    let added = 0
    for (const stm of shortTerm) {
      if (stm.importance < 1) continue  // 1 是基础门槛（表达了一个基本事实）
      // 去重：短文本用包含关系，长文本用相似度
      const dup = longTerm.find(l => {
        if (stm.content.length < 15 || l.content.length < 15) {
          return stm.content.includes(l.content) || l.content.includes(stm.content)
        }
        return similarity(l.content, stm.content) > 0.4
      })
      if (dup) {
        await this.longTerm.update(dup.id, {
          content: stm.content,
          importance: Math.max(dup.importance, stm.importance),
          updatedAt: Date.now(),
        })
        continue
      }
      added++
      // 不带 id，让 Supabase 生成 UUID
      await this.longTerm.add(stm)
    }

    // 淘汰：按 importance 降序，保留前 N 条
    if (added > 0) {
      const current = await this.longTerm.getAll()
      if (current.length > this.opts.longTermLimit) {
        const sorted = [...current].sort((a, b) => b.importance - a.importance || a.createdAt - b.createdAt)
        const toDelete = sorted.slice(this.opts.longTermLimit)
        for (const m of toDelete) {
          try { await this.longTerm.delete(m.id) } catch {}
        }
      }
    }
  }

  /** 构建注入 system prompt 的记忆文本 */
  async getInjectionText(lastMessage: string): Promise<string | undefined> {
    const shortTerm = await this.shortTerm.getAll()
    const longTerm = await this.longTerm.getAll()

    let result = ''

    // 短期：全部注入（≤10 条）
    if (shortTerm.length > 0) {
      result += '## 当前会话记忆\n' + shortTerm.map(m => `- ${m.content}`).join('\n') + '\n'
    }

    // 长期：关键词匹配加权 + importance 兜底，始终注入 Top-N
    if (longTerm.length > 0) {
      const keywords = tokenize(lastMessage)
      const scored = longTerm
        .map(m => ({
          m,
          score: matchScore(m, keywords) * 2 + m.importance,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, this.opts.injectLimit)

      if (scored.length > 0) {
        result += '\n## 关于你的记忆\n' + scored.map(s => `- ${s.m.content}`).join('\n')
      }
    }

    return result || undefined
  }

  /** 获取短期记忆列表（UI 展示用） */
  async getShortTermList(): Promise<Memory[]> {
    return this.shortTerm.getAll()
  }

  /** 获取长期记忆列表（UI 展示用） */
  async getLongTermList(): Promise<Memory[]> {
    return this.longTerm.getAll()
  }

  /** 手动添加短期记忆 */
  async addShortTermManual(content: string) {
    await this.shortTerm.add({
      id: generateId(),
      content,
      category: 'general',
      importance: 3,
      source: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }

  /** 编辑短期记忆 */
  async editShortTerm(id: string, patch: { content?: string; importance?: number }) {
    await this.shortTerm.update(id, { ...patch, updatedAt: Date.now() })
  }

  /** 编辑长期记忆 */
  async editLongTerm(id: string, patch: { content?: string; importance?: number }) {
    await this.longTerm.update(id, { ...patch, updatedAt: Date.now() })
  }

  /** 删除短期记忆 */
  async deleteShortTerm(id: string) { await this.shortTerm.delete(id) }

  /** 删除长期记忆 */
  async deleteLongTerm(id: string) { await this.longTerm.delete(id) }

  /** 清空短期记忆 */
  async clearShortTerm() { await this.shortTerm.clear() }
  /** 清空长期记忆 */
  async clearLongTerm() { await this.longTerm.clear() }

  /** 手动添加长期记忆 */
  async addManual(content: string) {
    await this.longTerm.add({
      id: generateId(),
      content,
      category: detectCategory(content),
      importance: 5,
      source: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }
}

// ====== 工具函数 ======

function detectCategory(text: string): Memory['category'] {
  const t = text.toLowerCase()
  if (t.includes('偏好') || t.includes('喜欢') || t.includes('风格') || t.includes('习惯')) return 'preference'
  if (t.includes('项目') || t.includes('开发') || t.includes('brainplus') || t.includes('代码')) return 'project'
  return 'general'
}

function calcImportance(text: string): number {
  let score = 1  // 基础分：能被提取出来就是一个事实
  if (text.includes('我是') || text.includes('叫')) score += 3  // 身份声明
  if (text.includes('工程师') || text.includes('设计') || text.includes('开发')) score += 1
  if (text.includes('偏好') || text.includes('风格') || text.includes('喜欢')) score += 2
  return Math.min(10, score)
}

/** 简单 Jaccard 相似度（单词级） */
function similarity(a: string, b: string): number {
  const ta = new Set(tokenize(a))
  const tb = new Set(tokenize(b))
  if (ta.size === 0 || tb.size === 0) return 0
  const intersection = new Set([...ta].filter(x => tb.has(x)))
  const union = new Set([...ta, ...tb])
  return intersection.size / union.size
}
