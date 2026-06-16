/**
 * web_search 统一工具：多引擎 fallback 搜索
 */
import { jsonSchema } from 'ai'
import type { ToolMap } from './registry'

interface SearchResult {
  title: string; url: string; snippet: string
}

async function searchDDG(query: string): Promise<SearchResult[]> {
  const api = (window as any).electronAPI?.search
  if (!api?.duckduckgo) return []
  const r = await api.duckduckgo(query)
  if (r.success && r.data) return r.data.slice(0, 10) as SearchResult[]
  return []
}

async function searchBing(query: string): Promise<SearchResult[]> {
  const api = (window as any).electronAPI?.search
  if (!api?.bing) return []
  const r = await api.bing(query, 10)
  if (r.success && r.data) return r.data.slice(0, 10) as SearchResult[]
  return []
}

async function searchGoogle(query: string): Promise<SearchResult[]> {
  const { getGoogleApiKey, getGoogleCx } = await import('@/lib/config')
  const key = getGoogleApiKey(); const cx = getGoogleCx()
  if (!key || !cx) return []
  const api = (window as any).electronAPI?.search
  if (!api?.google) return []
  const r = await api.google(query, key, cx)
  return r.success && r.data ? r.data as SearchResult[] : []
}

async function searchBrave(query: string): Promise<SearchResult[]> {
  const { getBraveApiKey } = await import('@/lib/config')
  const key = getBraveApiKey()
  if (!key) return []
  const api = (window as any).electronAPI?.search
  if (!api?.brave) return []
  const r = await api.brave(query, key)
  return r.success && r.data ? r.data as SearchResult[] : []
}

async function searchAll(query: string): Promise<SearchResult[]> {
  // 优先级：Google → Brave → Bing → DDG
  for (const fn of [searchGoogle, searchBrave, searchBing, searchDDG]) {
    const r = await fn(query)
    if (r.length > 0) return r
  }
  return []
}

export function registerWebSearchTool(tools: ToolMap) {
  tools['web_search'] = {
    description: 'Search the web. Uses Google→Brave→Bing→DuckDuckGo fallback. Returns title, URL and snippet for each result. Max 10 results.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'number', description: 'Max results, default 5' },
      },
      required: ['query'],
    }),
    execute: async ({ query, count }: { query: string; count?: number }) => {
      const results = await searchAll(query)
      if (results.length === 0) return 'No results found. Try a different query.'
      const max = Math.min(count || 5, results.length)
      return results.slice(0, max).map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n')
    },
  }
}
