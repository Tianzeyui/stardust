import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, FolderOpen, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { pluginSystem } from '@/lib/pluginSystem'

export function PluginsPage() {
  const [plugins, setPlugins] = useState(pluginSystem.getAllPlugins())
  const [path, setPath] = useState('')
  const [installing, setInstalling] = useState(false)
  const [msg, setMsg] = useState('')

  const refresh = useCallback(() => {
    setPlugins(pluginSystem.getAllPlugins())
  }, [])

  useEffect(() => {
    refresh()
    // 启动后异步安装的插件可能延迟到达，2 秒后再刷一次
    const t = setTimeout(refresh, 2000)
    return () => clearTimeout(t)
  }, [refresh])

  const handleInstall = async () => {
    if (!path.trim()) return
    setInstalling(true); setMsg('')
    const result = await pluginSystem.install(path.trim())
    setMsg(result.success ? '安装成功！' : `失败: ${result.error}`)
    if (result.success) { setPath(''); refresh() }
    setInstalling(false)
  }

  const handlePickFolder = async () => {
    if (window.electronAPI?.dialog) {
      const result = await window.electronAPI.dialog.openDirectory()
      if (result?.path) setPath(result.path)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center gap-2 border-b border-border px-4">
        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
        <h2 className="text-sm font-semibold">插件</h2>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* 安装区域 */}
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs font-medium mb-2">安装插件</p>
          <div className="flex items-center gap-2">
            <Input className="h-8 text-sm flex-1" value={path}
              onChange={e => setPath(e.target.value)}
              placeholder="插件目录路径，如 /Users/xxx/my-plugin" />
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handlePickFolder} title="选择文件夹">
              <FolderOpen className="h-4 w-4" />
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={handleInstall} disabled={installing || !path.trim()}>
              <Plus className="mr-1 h-3 w-3" />{installing ? '安装中...' : '安装'}
            </Button>
          </div>
          {msg && <p className={`text-xs mt-2 ${msg.startsWith('失败') ? 'text-destructive' : 'text-green-500'}`}>{msg}</p>}
          <p className="text-[10px] text-muted-foreground/50 mt-2">
            插件目录需包含 manifest.json 和 index.js（导出 Plugin 对象）
          </p>
        </div>

        {/* 已安装列表 */}
        {plugins.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-xs text-muted-foreground">暂无已安装插件</p>
          </div>
        ) : (
          <div className="space-y-2">
            {plugins.map(p => (
              <div key={p.manifest.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.manifest.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.manifest.id} · v{p.manifest.version}
                    {p.manifest.description ? ` · ${p.manifest.description}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <button
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${p.enabled ? 'bg-primary' : 'bg-muted'}`}
                    onClick={() => { pluginSystem.setEnabled(p.manifest.id, !p.enabled); refresh() }}
                    title={p.enabled ? '停用' : '启用'}>
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${p.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                  <button className="text-muted-foreground/30 hover:text-destructive"
                    onClick={() => { if (confirm(`确定卸载「${p.manifest.name}」？`)) { pluginSystem.uninstall(p.manifest.id); refresh() } }}
                    title="卸载">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
