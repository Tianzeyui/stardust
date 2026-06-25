import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getAgentMaxSteps, saveAgentMaxSteps, getCompressThreshold, saveCompressThreshold, getCtxWindow, saveCtxWindow, DEFAULT_CTX_WINDOW } from '@/lib/config'
import { MemoryPanel } from '../MemoryPanel'

export function AgentTab() {
  const [maxSteps, setMaxSteps] = useState(getAgentMaxSteps)
  const [compressThreshold, setCompressThreshold] = useState(getCompressThreshold)
  const [ctxWindow, setCtxWindow] = useState(getCtxWindow)

  return (
    <div className="w-full space-y-6">
      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-2 text-sm font-semibold">最大任务步数</legend>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">AI 在一次对话中最多执行多少步工具调用。建议值 10-50。</p>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { const n = Math.max(5, maxSteps - 5); setMaxSteps(n); saveAgentMaxSteps(n) }} disabled={maxSteps <= 5}>−</Button>
          <Input type="number" min={5} max={100} value={maxSteps} onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 5 && v <= 100) { setMaxSteps(v); saveAgentMaxSteps(v) } }} className="h-8 w-20 text-center text-sm" />
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { const n = Math.min(100, maxSteps + 5); setMaxSteps(n); saveAgentMaxSteps(n) }} disabled={maxSteps >= 100}>+</Button>
          <span className="ml-3 text-xs text-muted-foreground">默认 25 步</span>
        </div>
      </fieldset>
      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-2 text-sm font-semibold">上下文压缩</legend>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">上下文窗口</Label><p className="text-[10px] text-muted-foreground/50 mb-1">兜底值：模型列表中有contextWindow字段时优先用它，否则用此值</p><div className="flex items-center gap-1"><Input type="number" min={4096} step={1024} value={ctxWindow} onChange={e => { const v = parseInt(e.target.value) || DEFAULT_CTX_WINDOW; setCtxWindow(v); saveCtxWindow(v) }} className="h-8 w-24 text-center text-sm" /><span className="text-xs text-muted-foreground">tok</span></div></div>
          <div><Label className="text-xs">压缩阈值</Label><p className="text-[10px] text-muted-foreground/50 mb-1">达到上限的%时触发</p><div className="flex items-center gap-1"><Input type="number" min={30} max={95} value={compressThreshold} onChange={e => { const v = parseInt(e.target.value); if (v >= 30 && v <= 95) { setCompressThreshold(v); saveCompressThreshold(v) } }} className="h-8 w-20 text-center text-sm" /><span className="text-xs text-muted-foreground">%</span></div></div>
        </div>
      </fieldset>
      <MemoryPanel />
    </div>
  )
}
