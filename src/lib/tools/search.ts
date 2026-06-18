/**
 * 外部搜索工具：Bing + DuckDuckGo
 * 各引擎独立开关和配置。HTTP 请求经主进程 IPC 代理（绕过 CORS）。
 */
import { jsonSchema } from '../api'
import type { ToolMap } from './registry'
import {
  getDuckDuckGoEnabled, getDDGResultCount, getDDGTimeout,
  getBingEnabled, getBingResultCount, getBingTimeout,
} from '../config'

/** 搜索用 fetch：Electron 下走 IPC 代理，浏览器直接用 fetch */
async function searchFetch(url: string, timeoutMs: number): Promise<string> {
  const api = (window as any).electronAPI?.search
  if (api?.fetch) {
    const result = await api.fetch(url, timeoutMs)
    if (!result.success) throw new Error(result.error === 'timeout' ? 'timeout' : result.error || '请求失败')
    return result.data
  }
  // 浏览器环境回退
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally { clearTimeout(timer) }
}

// ====== Bing 网页搜索 ======

async function searchBing(query: string, limit: number, timeoutMs: number): Promise<string> {
  const url = `https://cn.bing.com/search?ensearch=1&q=${encodeURIComponent(query)}&count=${limit}`
  const html = await searchFetch(url, timeoutMs)

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const results = doc.querySelectorAll('li.b_algo')
  const parts: string[] = []

  results.forEach((li, i) => {
    if (i >= limit) return
    const titleEl = li.querySelector('h2 a')
    const snippetEl = li.querySelector('.b_caption p, p')
    const citeEl = li.querySelector('cite')
    const title = titleEl?.textContent?.trim() || ''
    const snippet = snippetEl?.textContent?.trim() || ''
    const link = citeEl?.textContent?.trim() || titleEl?.getAttribute('href') || ''

    if (title) {
      // 清理摘要中的日期前缀和 HTML 实体，限长 200 字
      const clean = snippet.replace(/^\d{4}年\d{1,2}月\d{1,2}日?\s*[·•]\s*/, '').substring(0, 200)
      parts.push(`**${title}**\n${link}${clean && clean !== title ? '\n> ' + clean : ''}`)
    }
  })

  if (parts.length === 0) return `Bing 未找到关于 "${query}" 的搜索结果。`
  return parts.join('\n\n')
}

// ====== DuckDuckGo Instant Answer ======

interface DDGResult {
  Abstract: string; AbstractText: string; AbstractURL: string
  AbstractSource: string; Heading: string
  RelatedTopics?: Array<{ Text: string; FirstURL: string }>
}

async function searchDDG(query: string, limit: number, timeoutMs: number): Promise<string> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
  const text = await searchFetch(url, timeoutMs)
  const data: DDGResult = JSON.parse(text)

  const parts: string[] = []
  if (data.Heading) parts.push(`## ${data.Heading}`)
  if (data.AbstractText) {
    parts.push(data.AbstractText)
    if (data.AbstractURL) parts.push(`来源: ${data.AbstractURL}`)
  }
  if (data.RelatedTopics?.length) {
    parts.push('\n### 相关结果')
    data.RelatedTopics
      .filter(t => t.FirstURL)
      .slice(0, limit)
      .forEach((t, i) => {
        const text = t.Text.replace(/<\/?[^>]+(>|$)/g, '').trim()
        if (text) parts.push(`${i + 1}. ${text} — ${t.FirstURL}`)
      })
  }
  if (parts.length === 0) return `DuckDuckGo 未找到关于 "${query}" 的搜索结果。`
  return parts.join('\n\n')
}

// ====== 注册工具 ======

export function registerSearchTools(tools: ToolMap) {
  if (getBingEnabled()) {
    const limit = getBingResultCount()
    tools['search_bing'] = {
      description: `使用 Bing 搜索互联网信息。适合中文查询、地点、新闻、实时信息。每次返回最多 ${limit} 条结果，包含标题、摘要和链接。`,
      inputSchema: jsonSchema({
        type: 'object',
        properties: { query: { type: 'string', description: '搜索关键词或问题' } },
        required: ['query'],
      }),
      execute: async ({ query }: { query: string }) => {
        try { return await searchBing(query, limit, getBingTimeout() * 1000) }
        catch (e: any) { return `Bing 搜索失败: ${e.message}` }
      },
    }
  }

  if (getDuckDuckGoEnabled()) {
    const limit = getDDGResultCount()
    tools['search_duckduckgo'] = {
      description: `使用 DuckDuckGo 搜索互联网信息（英文效果更佳）。返回事实摘要和相关链接。每次最多 ${limit} 条结果。`,
      inputSchema: jsonSchema({
        type: 'object',
        properties: { query: { type: 'string', description: '搜索关键词或问题，尽量具体清晰' } },
        required: ['query'],
      }),
      execute: async ({ query }: { query: string }) => {
        try { return await searchDDG(query, limit, getDDGTimeout() * 1000) }
        catch (e: any) { return `DuckDuckGo 搜索失败: ${e.message}` }
      },
    }
  }
}
