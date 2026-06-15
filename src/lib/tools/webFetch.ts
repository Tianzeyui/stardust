/**
 * web_fetch 工具：抓取网页内容并转为纯文本
 */
import { jsonSchema } from 'ai'
import type { ToolMap } from './registry'

/** 剥离 HTML 标签 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function registerWebFetchTool(tools: ToolMap) {
  tools['web_fetch'] = {
    description: '抓取网页内容并返回纯文本。用于查阅在线文档、API 参考、博客文章等。自动剥离 HTML 标签。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        url: { type: 'string', description: '要抓取的网页 URL' },
      },
      required: ['url'],
    }),
    execute: async ({ url }: { url: string }) => {
      const api = (window as any).electronAPI?.http
      if (!api) return 'HTTP API 不可用（仅桌面版本）'
      try {
        const result = await api.fetch(url, { timeout: 15000 })
        if (!result.success) return `抓取失败: ${result.error}`
        const text = stripHtml(result.data || '')
        const maxLen = 15000
        return text.length > maxLen
          ? text.slice(0, maxLen) + `\n\n... (内容过长已截断，共 ${text.length} 字符，${result.status})`
          : text
      } catch (e: any) {
        return `抓取异常: ${e.message}`
      }
    },
  }
}
