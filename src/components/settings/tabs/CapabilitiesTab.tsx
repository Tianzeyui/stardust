import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Code, Search, Check, RefreshCw, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getJSSandboxEnabled, saveJSSandboxEnabled,
  getPythonSandboxEnabled, savePythonSandboxEnabled,
  getDuckDuckGoEnabled, saveDuckDuckGoEnabled,
  getDDGResultCount, saveDDGResultCount, getDDGTimeout, saveDDGTimeout,
  getBingEnabled, saveBingEnabled,
  getBingResultCount, saveBingResultCount, getBingTimeout, saveBingTimeout,
  getGraphEnabled, saveGraphEnabled,
  getTerminalEnabled, saveTerminalEnabled,
} from '@/lib/config'

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`} onClick={onToggle}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  )
}

function NumberField({ label, value, setValue, min, max, unit }: {
  label: string; value: number; setValue: (n: number) => void; min: number; max: number; unit: string
}) {
  return (
    <div>
      <Label className="text-[11px]">{label}</Label>
      <div className="flex items-center gap-1 mt-0.5">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setValue(Math.max(min, value - 1))} disabled={value <= min}>−</Button>
        <Input type="number" min={min} max={max} value={value} onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= min && v <= max) setValue(v) }} className="h-8 w-14 text-center text-sm" />
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setValue(Math.min(max, value + 1))} disabled={value >= max}>+</Button>
        <span className="text-[10px] text-muted-foreground ml-1">{unit}</span>
      </div>
    </div>
  )
}

export function CapabilitiesTab() {
  const [capExpanded, setCapExpanded] = useState<Record<string, boolean>>({ sandbox: true, search: true, graph: true, terminal: true })
  const [sandboxJS, setSandboxJS] = useState(getJSSandboxEnabled)
  const [sandboxPython, setSandboxPython] = useState(getPythonSandboxEnabled)
  const [ddgEnabled, setDdgEnabled] = useState(getDuckDuckGoEnabled)
  const [ddgResultCount, setDdgResultCount] = useState(getDDGResultCount)
  const [ddgTimeout, setDdgTimeout] = useState(getDDGTimeout)
  const [bingEnabled, setBingEnabled] = useState(getBingEnabled)
  const [bingResultCount, setBingResultCount] = useState(getBingResultCount)
  const [bingTimeout, setBingTimeout] = useState(getBingTimeout)

  // 终端
  const [terminalEnabled, setTerminalEnabled] = useState(getTerminalEnabled)

  // 图数据库
  const [graphEnabled, setGraphEnabled] = useState(getGraphEnabled)
  const [graphUri, setGraphUri] = useState('')
  const [graphUser, setGraphUser] = useState('')
  const [graphPass, setGraphPass] = useState('')
  const [graphLoaded, setGraphLoaded] = useState(false)
  const [graphTesting, setGraphTesting] = useState(false)
  const [graphTestMsg, setGraphTestMsg] = useState('')

  const [hasSavedPwd, setHasSavedPwd] = useState(false)

  useEffect(() => {
    const api = (window as any).electronAPI?.graph
    if (api) api.getConfig().then((cfg: any) => {
      if (cfg) {
        setGraphUri(cfg.uri || '')
        setGraphUser(cfg.username || '')
        setHasSavedPwd(!!cfg.password)
      }
      setGraphLoaded(true)
    }).catch(() => { setGraphLoaded(true) })
  }, [])

  // 自动保存（仅在配置加载完成后触发，防抖 800ms）
  const graphLastSaved = useRef<{ uri: string; user: string; pass: string }>({ uri: '', user: '', pass: '' })
  useEffect(() => {
    if (!graphEnabled || !graphLoaded) return
    const timer = setTimeout(() => {
      const cur = { uri: graphUri, user: graphUser, pass: graphPass }
      if (cur.uri === graphLastSaved.current.uri && cur.user === graphLastSaved.current.user && cur.pass === graphLastSaved.current.pass) return
      const api = (window as any).electronAPI?.graph
      if (api && graphUri) {
        api.configure(graphUri, graphUser, graphPass).then(() => {
          graphLastSaved.current = cur
        }).catch(() => {})
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [graphUri, graphUser, graphPass, graphEnabled, graphLoaded])

  return (
    <div className="w-full space-y-3">
      <p className="text-xs text-muted-foreground rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 border border-blue-200 dark:border-blue-900">
        在此管理 BrainPlus 的各项扩展能力。关闭某项后，AI 和插件将无法使用对应功能。
      </p>

      {/* 执行环境 */}
      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setCapExpanded(p => ({ ...p, sandbox: !p.sandbox }))}>
          <div className="flex items-center gap-3"><Code className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm font-medium text-foreground">执行环境</p><p className="text-[10px] text-muted-foreground">JavaScript / Python 沙箱</p></div></div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${capExpanded.sandbox ? '' : '-rotate-90'}`} />
        </div>
        {capExpanded.sandbox && (
          <div className="border-t border-border px-4 py-3 space-y-2">
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 flex items-center justify-between">
              <div><p className="text-xs font-medium text-foreground">JavaScript 沙箱</p><p className="text-[10px] text-muted-foreground">Node.js + npm 包，Worker 线程隔离执行</p></div>
              <Toggle enabled={sandboxJS} onToggle={() => { setSandboxJS(v => { const nv = !v; saveJSSandboxEnabled(nv); return nv }) }} />
            </div>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 flex items-center justify-between">
              <div><p className="text-xs font-medium text-foreground">Python 沙箱</p><p className="text-[10px] text-muted-foreground">Python 3 / uv + pip 包，进程隔离执行</p></div>
              <Toggle enabled={sandboxPython} onToggle={() => { setSandboxPython(v => { const nv = !v; savePythonSandboxEnabled(nv); return nv }) }} />
            </div>
          </div>
        )}
      </div>

      {/* 外部搜索 */}
      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setCapExpanded(p => ({ ...p, search: !p.search }))}>
          <div className="flex items-center gap-3"><Search className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm font-medium text-foreground">外部搜索</p><p className="text-[10px] text-muted-foreground">互联网搜索引擎</p></div></div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${capExpanded.search ? '' : '-rotate-90'}`} />
        </div>
        {capExpanded.search && (
          <div className="border-t border-border px-4 py-3 space-y-2">
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-medium text-foreground">Bing</p><p className="text-[10px] text-muted-foreground">网页搜索，中文支持好，全球可用</p></div>
                <Toggle enabled={bingEnabled} onToggle={() => { setBingEnabled(v => { const nv = !v; saveBingEnabled(nv); return nv }) }} />
              </div>
              {bingEnabled && <div className="grid grid-cols-2 gap-3"><NumberField label="搜索结果数" value={bingResultCount} setValue={n => { setBingResultCount(n); saveBingResultCount(n) }} min={1} max={20} unit="条" /><NumberField label="超时" value={bingTimeout} setValue={n => { setBingTimeout(n); saveBingTimeout(n) }} min={3} max={60} unit="秒" /></div>}
            </div>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-medium text-foreground">DuckDuckGo</p><p className="text-[10px] text-muted-foreground">Instant Answer API，英文效果好，隐私优先</p></div>
                <Toggle enabled={ddgEnabled} onToggle={() => { setDdgEnabled(v => { const nv = !v; saveDuckDuckGoEnabled(nv); return nv }) }} />
              </div>
              {ddgEnabled && <div className="grid grid-cols-2 gap-3"><NumberField label="搜索结果数" value={ddgResultCount} setValue={n => { setDdgResultCount(n); saveDDGResultCount(n) }} min={1} max={20} unit="条" /><NumberField label="超时" value={ddgTimeout} setValue={n => { setDdgTimeout(n); saveDDGTimeout(n) }} min={3} max={60} unit="秒" /></div>}
            </div>
          </div>
        )}
      </div>

      {/* 终端 */}
      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setCapExpanded(p => ({ ...p, terminal: !p.terminal }))}>
          <div className="flex items-center gap-3"><Terminal className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm font-medium text-foreground">终端</p><p className="text-[10px] text-muted-foreground">允许助手执行终端命令</p></div></div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${capExpanded.terminal ? '' : '-rotate-90'}`} />
        </div>
        {capExpanded.terminal && (
          <div className="border-t border-border px-4 py-3">
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 flex items-center justify-between">
              <div><p className="text-xs font-medium text-foreground">run_terminal</p><p className="text-[10px] text-muted-foreground">助手可执行终端命令，执行前需用户确认</p></div>
              <Toggle enabled={terminalEnabled} onToggle={() => { setTerminalEnabled(v => { const nv = !v; saveTerminalEnabled(nv); return nv }) }} />
            </div>
          </div>
        )}
      </div>

      {/* 图数据库 */}
      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setCapExpanded(p => ({ ...p, graph: !p.graph }))}>
          <div className="flex items-center gap-3">
            <svg className="h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M6.5 17.5L10.5 7"/><path d="M17.5 17.5L13.5 7"/><path d="M12 7v2"/></svg>
            <div>
              <p className="text-sm font-medium text-foreground">图数据库</p>
              <p className="text-[10px] text-muted-foreground">Neo4j AuraDB，为插件提供图数据库能力</p>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${capExpanded.graph ? '' : '-rotate-90'}`} />
        </div>
        {capExpanded.graph && (
          <div className="border-t border-border px-4 py-3 space-y-2">
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-foreground">Neo4j</p>
                <p className="text-[10px] text-muted-foreground">图数据库引擎，支持 Cypher 查询，自动按插件名隔离数据</p>
              </div>
              <Toggle enabled={graphEnabled} onToggle={() => { const v = !graphEnabled; setGraphEnabled(v); saveGraphEnabled(v) }} />
            </div>
            {graphEnabled && (
              <>
                <Input className="h-7 text-xs" placeholder="bolt://localhost:7687" value={graphUri} onChange={e => setGraphUri(e.target.value)} />
                <div className="flex gap-2">
                  <Input className="flex-1 h-7 text-xs" placeholder="用户名" value={graphUser} onChange={e => setGraphUser(e.target.value)} />
                  <Input className="flex-1 h-7 text-xs" type="password" placeholder={hasSavedPwd ? '已保存' : '密码'} value={graphPass} onChange={e => setGraphPass(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => {
                    setGraphTesting(true); setGraphTestMsg('')
                    const api = (window as any).electronAPI?.graph
                    if (!api) { setGraphTestMsg('API 不可用'); setGraphTesting(false); return }
                    try { await api.configure(graphUri, graphUser, graphPass); const r = await api.testConnection(); setGraphTestMsg(r.success ? '连接成功' : '连接失败: ' + (r.error || '')) } catch (e: any) { setGraphTestMsg(e.message) }
                    setGraphTesting(false)
                  }} disabled={graphTesting}><RefreshCw className={`mr-1 h-3 w-3 ${graphTesting ? 'animate-spin' : ''}`} />测试连接</Button>
                  {graphTestMsg && <span className={`text-[10px] ${graphTestMsg.startsWith('连接成功') ? 'text-green-500' : 'text-destructive'}`}>{graphTestMsg}</span>}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
