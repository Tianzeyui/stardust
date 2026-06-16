import { useState, useEffect, useCallback } from 'react'
import { BarChart3, Zap, Clock, MessageSquare, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getTraces, getTotalStats, type TraceRecord } from '@/lib/traceStore'

function fmt(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function fmtDuration(ms: number): string {
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60000)}min`
}

function toDateKey(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN')
}

export function UsageStatsPage({ onClose }: { onClose?: () => void }) {
  const [traces, setTraces] = useState<TraceRecord[]>([])
  const [tab, setTab] = useState<'overview' | 'trend' | 'daily'>('overview')

  const refresh = useCallback(() => setTraces(getTraces()), [])
  useEffect(() => { refresh() }, [refresh])

  const stats = getTotalStats()
  const cacheHits = traces.filter(t => (t.cachedTokens || 0) > 0)
  const totalCached = cacheHits.reduce((s, t) => s + (t.cachedTokens || 0), 0)
  const totalInput = traces.reduce((s, t) => s + t.inputTokens, 0)
  const cacheRate = totalInput > 0 ? Math.round(totalCached / totalInput * 100) : 0

  // 日统计聚合
  const dailyMap = new Map<string, { tokens: number; count: number; tools: number }>()
  for (const t of traces) {
    const key = toDateKey(t.timestamp)
    const d = dailyMap.get(key) || { tokens: 0, count: 0, tools: 0 }
    d.tokens += t.inputTokens + t.outputTokens + t.agentTokens
    d.count++
    d.tools += t.toolCalls
    dailyMap.set(key, d)
  }
  const dailyStats = Array.from(dailyMap.entries()).map(([date, d]) => ({ date, ...d }))

  const maxDaily = Math.max(...dailyStats.map(d => d.tokens), 1)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 h-11">
        {onClose && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <span className="text-sm font-medium">用量统计</span>
        <div className="flex items-center gap-1 ml-4">
          {(['overview', 'trend', 'daily'] as const).map(t => (
            <button key={t}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${tab === t ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setTab(t)}>
              {t === 'overview' ? '总览' : t === 'trend' ? '趋势' : '日统计'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {tab === 'overview' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Zap className="h-3.5 w-3.5" /> 总 Token</div>
              <p className="text-xl font-bold">{fmt(stats.totalTokens)}</p>
              <p className="text-[10px] text-muted-foreground/50">{stats.totalConversations} 次对话</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><BarChart3 className="h-3.5 w-3.5" /> 平均/次</div>
              <p className="text-xl font-bold">{fmt(stats.avgTokensPerConv)}</p>
              <p className="text-[10px] text-muted-foreground/50">tok/对话</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Zap className="h-3.5 w-3.5" /> 缓存命中</div>
              <p className="text-xl font-bold">{cacheRate}%</p>
              <p className="text-[10px] text-muted-foreground/50">{cacheHits.length} 次命中，{fmt(totalCached)} tok</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><MessageSquare className="h-3.5 w-3.5" /> 工具调用</div>
              <p className="text-xl font-bold">{stats.totalToolCalls}</p>
              <p className="text-[10px] text-muted-foreground/50">总计</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Clock className="h-3.5 w-3.5" /> 总耗时</div>
              <p className="text-xl font-bold">{fmtDuration(stats.totalDuration)}</p>
              <p className="text-[10px] text-muted-foreground/50">累计</p>
            </div>
          </div>
        )}

        {tab === 'trend' && (
          traces.length === 0 ? (
            <p className="py-12 text-xs text-muted-foreground text-center">暂无数据</p>
          ) : (
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs font-medium mb-3">Token 趋势（最近 10 次）</p>
              <div className="space-y-1.5">
                {traces.slice(0, 10).reverse().map(t => {
                  const total = t.inputTokens + t.outputTokens + t.agentTokens
                  const max = Math.max(...traces.slice(0, 10).map(x => x.inputTokens + x.outputTokens + x.agentTokens), 1)
                  return (
                    <div key={t.id} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-24 shrink-0 truncate">{toDateKey(t.timestamp)}</span>
                      <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                        <div className="h-full bg-primary/60 rounded-sm flex items-center justify-end pr-1 transition-all" style={{ width: `${Math.max(2, (total / max) * 100)}%` }}>
                          <span className="text-[9px] text-primary-foreground font-medium">{fmt(total)}</span>
                        </div>
                      </div>
                      {t.agentTokens > 0 && <span className="text-[9px] text-muted-foreground/50 w-10 shrink-0">+{fmt(t.agentTokens)}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}

        {tab === 'daily' && (
          dailyStats.length === 0 ? (
            <p className="py-12 text-xs text-muted-foreground text-center">暂无数据</p>
          ) : (
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs font-medium mb-3">每日 Token 消耗</p>
              <div className="space-y-2">
                {dailyStats.map(d => {
                  const w = Math.max(2, (d.tokens / maxDaily) * 100)
                  return (
                    <div key={d.date} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-20 shrink-0">{d.date}</span>
                      <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                        <div className="h-full bg-primary/60 rounded-sm flex items-center justify-end pr-1 transition-all" style={{ width: `${w}%` }}>
                          <span className="text-[9px] text-primary-foreground font-medium">{fmt(d.tokens)}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground/50 w-12 shrink-0">{d.count}次</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}

        {/* 历史列表 */}
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-medium">最近对话</span>
            <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={refresh}>刷新</button>
          </div>
          {traces.length === 0 ? (
            <p className="px-4 py-8 text-xs text-muted-foreground text-center">完成对话后自动记录</p>
          ) : (
            <div className="divide-y divide-border">
              {traces.slice(0, 30).map(t => (
                <div key={t.id} className="flex items-center justify-between px-4 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-muted-foreground">{toDateKey(t.timestamp)} {new Date(t.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</p>
                    <p className="text-[10px] text-muted-foreground/50">
                      {fmt(t.inputTokens + t.outputTokens + t.agentTokens)} tok
                      {t.agentTokens > 0 ? ` (含子Agent ${fmt(t.agentTokens)})` : ''}
                      {' · '}{t.toolCalls} 工具 · {fmtDuration(t.duration)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
