import { useState, useEffect, useCallback } from 'react'
import { Brain, Loader2, ChevronDown, Trash2 } from 'lucide-react'
import type { Memory } from '@/lib/memory/types'
import type { MemoryManager } from '@/lib/memory/manager'

interface Props {
  manager: MemoryManager | null
  enabled: boolean
  onToggle: () => void
  shortCount: number
}

export function MemoryPopup({ manager, enabled, onToggle, shortCount }: Props) {
  const [show, setShow] = useState(false)
  const [shortTerm, setShortTerm] = useState<Memory[]>([])
  const [longTerm, setLongTerm] = useState<Memory[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'short' | 'long'>('short')

  const load = useCallback(async () => {
    if (!manager) return
    setLoading(true)
    setShortTerm(await manager.getShortTermList())
    setLongTerm(await manager.getLongTermList())
    setLoading(false)
  }, [manager])

  // manager 变化时（切项目）重新加载
  useEffect(() => { load() }, [load])
  useEffect(() => { if (show) load() }, [show, load])

  // 按钮显示数量，优先用实际加载的数据
  const displayCount = shortTerm.length > 0 ? shortTerm.length : shortCount

  return (
    <div className="relative shrink-0">
      <button
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${enabled ? 'text-primary/70 hover:text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
        onClick={() => setShow(!show)}
        title="记忆管理"
      >
        <Brain className="h-3 w-3" />
        <span>记忆{displayCount > 0 ? ` ${displayCount}` : ''}</span>
      </button>

      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)} />
          <div className="absolute left-0 bottom-full z-50 mb-1 w-64 rounded-lg border border-border bg-card shadow-lg">
            {/* 开关 */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-medium">记忆</span>
              <button
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`}
                onClick={onToggle}
              >
                <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${enabled ? 'translate-x-3' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* 标签切换 */}
            <div className="flex border-b border-border">
              <button
                className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${tab === 'short' ? 'text-foreground border-b border-primary' : 'text-muted-foreground'}`}
                onClick={() => setTab('short')}
              >
                短期 ({shortTerm.length})
              </button>
              <button
                className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${tab === 'long' ? 'text-foreground border-b border-primary' : 'text-muted-foreground'}`}
                onClick={() => setTab('long')}
              >
                长期 ({longTerm.length})
              </button>
            </div>

            {/* 内容 */}
            <div className="max-h-48 overflow-auto p-1">
              {loading ? (
                <p className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />加载中...
                </p>
              ) : tab === 'short' ? (
                shortTerm.length === 0 ? (
                  <p className="py-6 text-center text-[10px] text-muted-foreground">
                    {enabled ? '暂无短期记忆，对话中自动提取' : '记忆已关闭，开启后自动提取'}
                  </p>
                ) : (
                  shortTerm.map(m => (
                    <div key={m.id} className="flex items-start gap-1.5 px-2 py-1 text-[11px]">
                      <span className="text-muted-foreground/40 mt-0.5">•</span>
                      <span className="flex-1">{m.content}</span>
                      <button className="shrink-0 text-muted-foreground/20 hover:text-destructive mt-0.5"
                        onClick={async () => { await manager?.deleteShortTerm(m.id); load() }}>
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))
                )
              ) : (
                longTerm.length === 0 ? (
                  <p className="py-6 text-center text-[10px] text-muted-foreground">暂无长期记忆</p>
                ) : (
                  longTerm.map(m => (
                    <div key={m.id} className="flex items-start gap-1.5 px-2 py-1 text-[11px]">
                      <span className="text-muted-foreground/40 mt-0.5">•</span>
                      <span className="flex-1">{m.content}</span>
                      <span className="text-[9px] text-muted-foreground/40">{m.importance}</span>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
