import { useState, useEffect } from 'react'
import { APP_VERSION } from '@/lib/version'

export function AboutTab() {
  const [changelog, setChangelog] = useState<Array<{ version: string; date: string; items: string[] }>>([])

  useEffect(() => {
    const CDN_URL = 'https://cdn.jsdelivr.net/gh/Tianzeyui/brainPlus@main/CHANGELOG.md'
    const parse = (text: string) => {
      const entries: typeof changelog = []
      const sections = text.split(/\n## /).slice(1)
      for (const sec of sections) {
        const lines = sec.trim().split('\n')
        const m = lines[0].match(/^v([\d.]+)\s*(?:\((.+?)\))?/)
        if (!m) continue
        entries.push({
          version: `v${m[1]}`, date: m[2] || '',
          items: lines.slice(1).filter(l => l.trim().startsWith('- ')).map(l => l.replace(/^-\s*/, '')),
        })
      }
      return entries
    }
    ;(async () => {
      try { const r = await fetch('/CHANGELOG.md'); if (r.ok) { setChangelog(parse(await r.text())); return } } catch {}
      try {
        const api = (window as any).electronAPI?.http
        if (api) { const r = await api.fetch(CDN_URL); if (r.success && r.status === 200) setChangelog(parse(r.data)) }
      } catch {}
    })()
  }, [])

  return (
    <div className="flex flex-col items-center text-center flex-1 overflow-auto">
      <div className="flex flex-col items-center pt-10 pb-8">
        <img src="/assets/icons/icon2.png" alt="BrainPlus" className="w-16 h-16 rounded-2xl mb-4 shadow-sm" />
        <h2 className="text-lg font-bold text-foreground">BrainPlus</h2>
        <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-[10px] font-medium text-primary">v{APP_VERSION}</span>
        <p className="text-xs text-muted-foreground/50 mt-3">开源自由的 AI Agent 平台</p>
      </div>
      {changelog.length > 0 && (
        <div className="w-full max-w-[260px] text-left mb-8">
          <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider mb-3 text-center">更新日志</p>
          <div className="relative pl-5 space-y-4 max-h-56 overflow-auto">
            <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
            {changelog.map((entry, i) => (
              <div key={entry.version} className="relative">
                <div className={`absolute -left-5 top-1.5 w-[15px] h-[15px] rounded-full border-2 flex items-center justify-center ${i === 0 ? 'border-primary bg-primary/10' : 'border-muted-foreground/20 bg-card'}`}>
                  <div className={`w-[5px] h-[5px] rounded-full ${i === 0 ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold">{entry.version}</span>
                  {entry.date && <span className="text-[9px] text-muted-foreground/40">{entry.date}</span>}
                </div>
                <ul className="space-y-0.5">
                  {entry.items.map((item, j) => <li key={j} className="text-[10px] text-muted-foreground/50 leading-relaxed">{item}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-auto pb-8">
        <a href="https://immersionvoid.cc/" target="_blank" className="inline-block hover:opacity-75 transition-opacity" title="沉浸位工作室官网">
          <img src="/assets/logo/immersionBitLogo.svg" alt="沉浸位工作室" className="w-24" />
        </a>
        <p className="text-[10px] text-muted-foreground/30 mt-2">© {__BUILD_YEAR__} 沉浸位工作室 · Apache 2.0</p>
      </div>
    </div>
  )
}
