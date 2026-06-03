/**
 * Token 用量条 — 极简克制风
 *
 * 状态层次（中性灰，仅透明度区分）：
 * - 隐藏：usage < 30% 且未压缩
 * - 常态：淡灰细线 + 数字
 * - 警告：线条稍深 + 压缩按钮
 * - 压缩中：进度条呼吸动画 + 文字闪烁
 * - 已压缩：压缩前后对比
 */

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
  estimatedTokens,
  limit,
  wasCompressed,
  originalTokens,
  compressedTokens,
  compressing,
  onForceCompress,
}: TokenUsageBarProps) {
  const pct = Math.min((estimatedTokens / limit) * 100, 100)

  if (!wasCompressed && !compressing && pct < 30) return null

  const barAlpha =
    compressing ? 'opacity-50'
    : wasCompressed ? 'opacity-40'
    : pct > 90 ? 'opacity-60'
    : pct > 70 ? 'opacity-45'
    : 'opacity-30'

  const textAlpha =
    compressing ? 'opacity-50'
    : wasCompressed || pct > 70 ? 'opacity-60'
    : 'opacity-40'

  return (
    <div className="border-t border-border flex items-center gap-2 px-4 py-1 text-[10px] select-none">
      <span className="shrink-0 text-muted-foreground/30 text-[10px]">上下文</span>
      {/* 进度条 */}
      <div className="flex-1 h-0.5 bg-muted-foreground/10 rounded-none overflow-hidden">
        <div
          className={`h-full bg-muted-foreground rounded-none transition-all duration-700 ${barAlpha} ${
            compressing ? 'animate-pulse' : ''
          }`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>

      {/* 文字 */}
      {compressing ? (
        <span className={`tabular-nums shrink-0 text-muted-foreground animate-pulse ${textAlpha}`}>
          压缩中...
        </span>
      ) : (
        <span className={`tabular-nums shrink-0 text-muted-foreground ${textAlpha}`}>
          {wasCompressed && originalTokens && compressedTokens ? (
            <>
              <span className="opacity-50">{fmt(originalTokens)}</span>
              <span className="opacity-30 mx-0.5">→</span>
              {fmt(compressedTokens)}
            </>
          ) : (
            <>
              {fmt(estimatedTokens)}
              <span className="opacity-40"> / {fmt(limit)}</span>
            </>
          )}
        </span>
      )}

      {/* 手动压缩按钮 */}
      {!wasCompressed && !compressing && pct > 70 && onForceCompress && (
        <button
          className="shrink-0 text-[10px] text-muted-foreground/35 hover:text-muted-foreground/60 transition-colors"
          onClick={onForceCompress}
          title="压缩对话历史"
        >
          压缩
        </button>
      )}
    </div>
  )
}
