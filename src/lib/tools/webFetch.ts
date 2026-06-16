/**
 * web_fetch 工具：网页抓取，支持分页
 */
import { jsonSchema } from 'ai'
import type { ToolMap } from './registry'

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim()
}

export function registerWebFetchTool(tools: ToolMap) {
  tools['web_fetch'] = {
    description: 'Fetch a web page and return plain text. Supports pagination via offset+length (default length=3000, max 10000). Returns total char count so you can page through large pages.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Web page URL to fetch' },
        offset: { type: 'number', description: 'Starting char position (0-based), default 0' },
        length: { type: 'number', description: 'Chars to read, default 3000, max 10000' },
      },
      required: ['url'],
    }),
    execute: async ({ url, offset, length }: { url: string; offset?: number; length?: number }) => {
      const api = (window as any).electronAPI?.http
      if (!api) return 'HTTP API unavailable (desktop only)'
      try {
        const result = await api.fetch(url, { timeout: 15000 })
        if (!result.success) return `Fetch failed: ${result.error}`
        const text = stripHtml(result.data || '')
        const total = text.length
        const off = Math.max(0, offset || 0)
        const len = Math.min(length || 3000, 10000)
        const slice = text.slice(off, off + len)
        if (off + len >= total) {
          return slice + `\n\n--- ${total} chars total (end of page) ---`
        }
        return slice + `\n\n--- Chars ${off + 1}-${off + len} of ${total} --- Use offset=${off + len} for next page`
      } catch (e: any) {
        return `Fetch error: ${e.message}`
      }
    },
  }
}
