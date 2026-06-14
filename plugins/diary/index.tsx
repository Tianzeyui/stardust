/**
 * 日记插件 — 挂载现有 DiaryPage 组件 + 注册 AI 工具
 * 工具通过 ctx.api.supabase 直接操作数据库，避免 import 别名问题
 */
export function register(ctx: any) {
  ctx.registerNav({ id: 'diary', label: '日记', icon: 'BookOpen', order: 60 })
  ctx.registerRoute('diary', () => import('@/components/diary/DiaryPage'))

  ctx.onToolRegister((tools: Record<string, any>) => {
    // 公共 helper：获取 Supabase client
    function getClient() {
      const client = ctx.api.supabase.getClient()
      if (!client) throw new Error('Supabase 未配置')
      return client
    }

    tools['diary_create'] = {
      description: '创建或更新日记条目。指定日期和内容（支持 Markdown）。同一天重复调用会更新已有条目。',
      inputSchema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: '日期，格式 YYYY-MM-DD' },
          content: { type: 'string', description: '日记内容（Markdown）' },
          title: { type: 'string', description: '日记标题（可选）' },
          mood: { type: 'string', description: '心情标签（可选），如 开心/平静/焦虑' },
        },
        required: ['date', 'content'],
      },
      execute: async (args: { date: string; content: string; title?: string; mood?: string }) => {
        try {
          const sb = getClient()
          const { data: { user } } = await sb.auth.getUser()
          if (!user) throw new Error('未登录')
          const { error } = await sb.from('diary_entries').upsert(
            { user_id: user.id, entry_date: args.date, content: args.content, title: args.title || '', mood: args.mood || '' },
            { onConflict: 'user_id,entry_date' },
          )
          if (error) throw error
          return `日记已保存：${args.date}${args.title ? `「${args.title}」` : ''}`
        } catch (e: any) {
          return `保存日记失败：${e.message}`
        }
      },
    }

    tools['diary_search'] = {
      description: '搜索或列出日记条目。可按日期范围筛选。',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '起始日期 YYYY-MM-DD（可选）' },
          to: { type: 'string', description: '结束日期 YYYY-MM-DD（可选）' },
          keyword: { type: 'string', description: '内容关键词（可选，客户端过滤）' },
        },
      },
      execute: async (args: { from?: string; to?: string; keyword?: string }) => {
        try {
          const sb = getClient()
          let query = sb.from('diary_entries').select('*').order('entry_date', { ascending: false })
          if (args.from) query = query.gte('entry_date', args.from)
          if (args.to) query = query.lte('entry_date', args.to)
          const { data, error } = await query
          if (error) throw error
          let entries = (data || []) as any[]
          if (args.keyword) {
            const kw = args.keyword.toLowerCase()
            entries = entries.filter(e =>
              (e.title || '').toLowerCase().includes(kw) ||
              (e.content || '').toLowerCase().includes(kw)
            )
          }
          if (entries.length === 0) return '未找到匹配的日记条目。'
          return entries.slice(0, 20).map((e: any) =>
            `- **${e.entry_date}**${e.title ? ` ${e.title}` : ''}${e.mood ? ` [${e.mood}]` : ''}: ${(e.content || '(空)').slice(0, 100)}${(e.content?.length ?? 0) > 100 ? '...' : ''}`
          ).join('\n') + (entries.length > 20 ? `\n... 共 ${entries.length} 条，仅显示前 20 条` : '')
        } catch (e: any) {
          return `搜索日记失败：${e.message}`
        }
      },
    }

    tools['diary_get'] = {
      description: '获取指定日期的日记。',
      inputSchema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: '日期，格式 YYYY-MM-DD' },
        },
        required: ['date'],
      },
      execute: async (args: { date: string }) => {
        try {
          const sb = getClient()
          const { data, error } = await sb.from('diary_entries').select('*').eq('entry_date', args.date).maybeSingle()
          if (error) throw error
          if (!data) return `${args.date} 没有日记记录。`
          const e = data as any
          return `## ${e.entry_date}${e.title ? ` ${e.title}` : ''}${e.mood ? ` [${e.mood}]` : ''}\n\n${e.content}`
        } catch (e: any) {
          return `获取日记失败：${e.message}`
        }
      },
    }

    tools['diary_update'] = {
      description: '更新指定日期的日记内容。可部分更新（只改 title/content/mood）。',
      inputSchema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: '日期，格式 YYYY-MM-DD' },
          content: { type: 'string', description: '新的日记内容（可选）' },
          title: { type: 'string', description: '新的标题（可选）' },
          mood: { type: 'string', description: '新的心情标签（可选）' },
        },
        required: ['date'],
      },
      execute: async (args: { date: string; content?: string; title?: string; mood?: string }) => {
        try {
          const sb = getClient()
          const { data } = await sb.from('diary_entries').select('id').eq('entry_date', args.date).maybeSingle()
          if (!data) return `${args.date} 没有日记记录，请使用 diary_create 创建。`
          const patch: any = {}
          if (args.content !== undefined) patch.content = args.content
          if (args.title !== undefined) patch.title = args.title
          if (args.mood !== undefined) patch.mood = args.mood
          if (Object.keys(patch).length === 0) return '未指定任何要更新的字段。'
          const { error } = await sb.from('diary_entries').update(patch).eq('id', (data as any).id)
          if (error) throw error
          return `已更新 ${args.date} 的日记。`
        } catch (e: any) {
          return `更新日记失败：${e.message}`
        }
      },
    }
  })
}
