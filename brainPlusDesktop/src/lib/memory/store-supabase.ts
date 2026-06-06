/**
 * 长期记忆存储 — Supabase
 * 仅在已登录 + Supabase 已配置时可用，否则静默降级为空操作
 */
import { getSupabaseClient } from '../supabase'
import type { Memory, MemoryStore } from './types'

function warn(msg: string, ...args: any[]) {
  console.warn(`[memory:supabase] ${msg}`, ...args)
}

export function createSupabaseMemoryStore(getUserId: () => string | null, getProjectId?: () => string | null): MemoryStore {
  function encodeCategory(cat: string, pid?: string): string {
    return pid ? `${cat}|${pid}` : cat
  }
  function decodeCategory(raw: string): { category: string; projectId?: string } {
    const parts = raw.split('|')
    return parts.length === 2
      ? { category: parts[0], projectId: parts[1] }
      : { category: parts[0] }
  }

  return {
    async getAll() {
      const sb = getSupabaseClient()
      const uid = getUserId()
      if (!sb || !uid) return []
      const currentProjectId = getProjectId?.()
      try {
        const { data } = await sb
          .from('user_memories')
          .select('*')
          .eq('user_id', uid)
          .order('importance', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(50)
        return (data || [])
          .map((r: any) => {
            const decoded = decodeCategory(r.category || 'general')
            return {
              id: r.id,
              content: r.content,
              category: decoded.category,
              importance: r.importance ?? 0,
              source: r.source ?? 'extracted',
              projectId: decoded.projectId,
              createdAt: new Date(r.created_at).getTime(),
              updatedAt: new Date(r.updated_at).getTime(),
            } satisfies Memory
          })
          // 项目隔离：只返回当前项目或无项目的记忆
          .filter(m => {
            if (currentProjectId) return m.projectId === currentProjectId
            return !m.projectId
          })
      } catch (e) { warn('getAll failed', e); return [] }
    },

    async add(m) {
      const sb = getSupabaseClient()
      const uid = getUserId()
      if (!sb || !uid) {
        warn('add skipped:', { hasClient: !!sb, userId: uid })
        return
      }
      try {
        const session = await sb.auth.getSession()
        if (!session.data.session) { warn('add skipped: no session'); return }
        const encodedCategory = encodeCategory(m.category, m.projectId)
        const { error } = await sb.from('user_memories').insert({
          user_id: uid,
          content: m.content,
          category: encodedCategory,
          importance: m.importance,
          source: m.source,
        })
        if (error) { warn('add returned error:', error.message, error.code); return }
        console.log('[memory:supabase] 长期记忆已存储:', m.content.slice(0, 40))
      } catch (e) { warn('add failed', e) }
    },

    async update(id, patch) {
      const sb = getSupabaseClient()
      const uid = getUserId()
      if (!sb || !uid) { warn('update skipped: no auth'); return }
      try {
        const session = await sb.auth.getSession()
        if (!session.data.session) { warn('update skipped: no session'); return }
        const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
        if (patch.content) updateData.content = patch.content
        if (patch.category) updateData.category = patch.category
        if (patch.importance != null) updateData.importance = patch.importance
        const { error } = await sb.from('user_memories').update(updateData).eq('id', id).eq('user_id', uid)
        if (error) warn('update returned error', error.message, error.code)
      } catch (e) { warn('update failed', e) }
    },

    async delete(id) {
      const sb = getSupabaseClient()
      const uid = getUserId()
      if (!sb || !uid) { warn('delete skipped: no auth'); return }
      try {
        const session = await sb.auth.getSession()
        if (!session.data.session) { warn('delete skipped: no session'); return }
        const { error } = await sb.from('user_memories').delete().eq('id', id).eq('user_id', uid)
        if (error) warn('delete returned error', error.message, error.code)
      } catch (e) { warn('delete failed', e) }
    },

    async clear() {
      const sb = getSupabaseClient()
      const uid = getUserId()
      if (!sb || !uid) { warn('clear skipped: no auth'); return }
      try {
        const { error } = await sb.from('user_memories').delete().eq('user_id', uid)
        if (error) warn('clear returned error', error.message, error.code)
      } catch (e) { warn('clear failed', e) }
    },
  }
}
