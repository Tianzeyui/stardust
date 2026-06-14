import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getA2AEnabled, saveA2AEnabled, getA2APort, saveA2APort, getA2AToken, saveA2AToken } from '@/lib/config'

export function A2ATab() {
  const [enabled, setEnabled] = useState(getA2AEnabled)
  const [port, setPort] = useState(getA2APort)
  const [token, setToken] = useState(getA2AToken)

  return (
    <div className="w-full space-y-6">
      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-2 text-sm font-semibold">A2A 服务器</legend>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          Agent-to-Agent 协议。开启后 BrainPlus 可以作为 A2A 服务端接收其他 Agent 的任务请求。
        </p>
        <div className="flex items-center gap-2 mb-3">
          <button className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`} onClick={() => {
            const v = !enabled; setEnabled(v); saveA2AEnabled(v)
            if (v) (window as any).electronAPI?.a2a?.start(port)
            else (window as any).electronAPI?.a2a?.stop()
          }}>
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'}`} />
          </button>
          <span className="text-xs text-muted-foreground">{enabled ? '运行中' : '已关闭'}</span>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <Label className="text-xs">端口</Label>
          <Input type="number" min={1024} max={65535} value={port} onChange={e => { const p = parseInt(e.target.value) || 9090; setPort(p); saveA2APort(p) }} className="h-8 w-24 text-center text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Token</Label>
          <Input value={token} onChange={e => { setToken(e.target.value); saveA2AToken(e.target.value); (window as any).electronAPI?.a2a?.setToken?.(e.target.value) }} placeholder="留空不鉴权" className="h-8 text-sm flex-1 font-mono" />
          <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={() => { const t = 'a2a_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24); setToken(t); saveA2AToken(t); (window as any).electronAPI?.a2a?.setToken?.(t) }}>
            <RefreshCw className="mr-1 h-3 w-3" />生成
          </Button>
        </div>
      </fieldset>
    </div>
  )
}
