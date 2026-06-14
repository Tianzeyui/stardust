/**
 * Token 用量——输入框下方紧凑按钮 + 弹出面板
 */
import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
// Using BarChart3 icon — consistent with "上下文" theme

export interface TokenUsageBarProps {
  estimatedTokens: number
  limit: number
  wasCompressed: boolean
  originalTokens?: number
  compressedTokens?: number
  compressing?: boolean
  onForceCompress?: () => void
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

export function TokenUsageBar({
  estimatedTokens, limit, wasCompressed,
  originalTokens, compressedTokens, compressing, onForceCompress,
}: TokenUsageBarProps) {
  const [show, setShow] = useState(false)
  const pct = Math.min((estimatedTokens / limit) * 100, 100)

  return (
    <div className="relative shrink-0">
      <button
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground transition-colors"
        onClick={() => setShow(!show)}
        title="上下文用量"
      >
        <BarChart3 className="h-3 w-3" />
        <span>{Math.round(pct)}%</span>
      </button>

      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)} />
          <div className="absolute left-0 bottom-full z-50 mb-1 w-56 rounded-lg border border-border bg-card shadow-lg p-3">
            <p className="text-xs font-medium mb-2">上下文用量</p>
            {/* 进度条 */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  compressing ? 'bg-primary/40 animate-pulse'
                  : pct > 90 ? 'bg-destructive/60'
                  : pct > 70 ? 'bg-primary/60'
                  : 'bg-primary/30'
                }`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-2">
              <span>{fmt(estimatedTokens)} / {fmt(limit)}</span>
              <span>{Math.round(pct)}%</span>
            </div>
            {wasCompressed && originalTokens && compressedTokens && (
              <p className="text-[10px] text-muted-foreground/60 mb-2">
                已压缩: {fmt(originalTokens)} → {fmt(compressedTokens)}
              </p>
            )}
            {compressing && (
              <p className="text-[10px] text-muted-foreground/60 animate-pulse mb-2">正在压缩对话历史...</p>
            )}
            {!compressing && onForceCompress && (
              <button className="w-full text-[10px] text-primary/70 hover:text-primary text-center py-1"
                onClick={() => { onForceCompress(); setShow(false) }}>{wasCompressed ? '重新压缩' : '压缩'}</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
