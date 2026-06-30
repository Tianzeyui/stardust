import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, FolderOpen, Blocks, Globe, RefreshCw, AlertCircle, GitBranch, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { pluginSystem } from '@/lib/pluginSystem'
import { CommunityPluginCard } from './CommunityPluginCard'
import {
  fetchCommunityPlugins,
  getCachedPlugins,
  cachePlugins,
  getCacheAgeMinutes,
  clearPluginCache,
  type CommunityPlugin,
} from '@/lib/communityPluginService'
import { getSavedRepos, addRepo, removeRepo, refreshRepo, recloneRepo, type PluginRepo } from '@/lib/repoService'

export function PluginsPage() {
  const [plugins, setPlugins] = useState(pluginSystem.getAllPlugins())
  const [path, setPath] = useState('')
  const [installing, setInstalling] = useState(false)
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState<'local' | 'community' | 'repos'>('local')

  // 社区插件状态
  const [communityPlugins, setCommunityPlugins] = useState<CommunityPlugin[]>([])
  const [communityLoading, setCommunityLoading] = useState(true)
  const [communityError, setCommunityError] = useState('')
  const [cacheAge, setCacheAge] = useState<number | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installProgress, setInstallProgress] = useState<{ current: number; total: number; file: string } | null>(null)

  // 仓库管理状态
  const [repos, setRepos] = useState<PluginRepo[]>(getSavedRepos)
  const [repoUrl, setRepoUrl] = useState('')
  const [repoAdding, setRepoAdding] = useState(false)
  const [repoMsg, setRepoMsg] = useState('')
  const [repoInstallingId, setRepoInstallingId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setPlugins(pluginSystem.getAllPlugins())
  }, [])

  useEffect(() => {
    refresh()
    const t = setTimeout(refresh, 2000)
    return () => clearTimeout(t)
  }, [refresh])

  // 加载社区插件列表
  const loadCommunity = async (forceRefresh = false) => {
    // 先读缓存
    if (!forceRefresh) {
      const cached = getCachedPlugins()
      if (cached && cached.length > 0) {
        setCommunityPlugins(cached)
        setCacheAge(getCacheAgeMinutes())
        setCommunityLoading(false)
      }
    }

    try {
      console.log('[community] fetching plugins...')
      const plugins = await fetchCommunityPlugins()
      console.log('[community] got', plugins.length, 'plugins')
      setCommunityPlugins(plugins)
      cachePlugins(plugins)
      setCacheAge(0)
      setCommunityError('')
    } catch (err: any) {
      console.error('[community] fetch failed:', err.message)
      setCommunityError(err.message || '无法加载社区插件')
      setCacheAge(getCacheAgeMinutes())
    } finally {
      setCommunityLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'community') {
      setCommunityLoading(true)
      loadCommunity()
    }
  }, [tab])

  // 监听安装进度
  useEffect(() => {
    const api = (window as any).electronAPI?.plugin
    if (!api) return
    const unsub = api.onGithubProgress?.((data: { pluginId: string; file: string; current: number; total: number }) => {
      setInstallProgress({ current: data.current, total: data.total, file: data.file })
    })
    return () => { unsub?.() }
  }, [])

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

  const handleCommunityInstall = async (plugin: CommunityPlugin) => {
    setInstallingId(plugin.id)
    setInstallProgress(null)
    const files = plugin.files || ['manifest.json', 'index.tsx', 'package.json']
    const result = await pluginSystem.installFromGithub(plugin.id, files)
    if (!result.success) {
      setMsg(`社区安装失败: ${result.error}`)
    } else {
      setMsg('社区插件安装成功！')
      refresh()
    }
    setInstallingId(null)
    setInstallProgress(null)
  }

  const isInstalled = (pluginId: string) => plugins.some(p => p.manifest.id === pluginId)

  // 仓库操作
  const handleAddRepo = async () => {
    if (!repoUrl.trim()) return
    setRepoAdding(true); setRepoMsg('')
    const result = await addRepo(repoUrl.trim())
    if (result.success) {
      setRepos(getSavedRepos())
      setRepoUrl('')
      setRepoMsg('仓库添加成功！')
    } else {
      setRepoMsg(`添加失败: ${result.error}`)
    }
    setRepoAdding(false)
  }

  const handleRefreshRepo = async (repoUrl: string) => {
    const result = await refreshRepo(repoUrl)
    if (result.success) {
      setRepos(getSavedRepos())
    } else {
      setRepoMsg(`刷新失败: ${result.error}`)
    }
  }

  const handleRecloneRepo = async (url: string) => {
    setRepoMsg('重新克隆中...')
    const result = await recloneRepo(url)
    if (result.success) {
      setRepos(getSavedRepos())
      setRepoMsg('重新克隆成功！')
    } else {
      setRepoMsg(`克隆失败: ${result.error}`)
    }
  }

  const handleRemoveRepo = (url: string) => {
    removeRepo(url)
    setRepos(getSavedRepos())
    setRepoMsg('')
  }

  const handleRepoInstall = async (repo: PluginRepo, plugin: CommunityPlugin) => {
    if (!repo.repoDir) return
    setRepoInstallingId(plugin.id)
    const srcPath = `${repo.repoDir}/${plugin.id}`
    const result = await pluginSystem.install(srcPath)
    if (result.success) {
      setMsg('安装成功！')
      refresh()
    } else {
      setMsg(`安装失败: ${result.error}`)
    }
    setRepoInstallingId(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* 页面标题 + Tab 切换 */}
        <div className="flex items-center gap-2 mb-1">
          <Blocks className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className="text-sm font-semibold">插件</h2>
          <div className="flex items-center gap-0.5 ml-4 bg-muted rounded-md p-0.5">
            <button
              className={`px-2.5 py-1 rounded text-xs transition-colors ${tab === 'local' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setTab('local')}
            >
              本地安装
            </button>
            <button
              className={`px-2.5 py-1 rounded text-xs transition-colors ${tab === 'community' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setTab('community')}
            >
              社区
            </button>
            <button
              className={`px-2.5 py-1 rounded text-xs transition-colors ${tab === 'repos' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setTab('repos')}
            >
              仓库
            </button>
          </div>
        </div>

        {msg && (
          <div className={`px-3 py-1.5 rounded text-xs ${msg.includes('失败') ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-600'}`}>
            {msg}
          </div>
        )}
        {/* === 本地安装 Tab === */}
        {tab === 'local' && (
          <>
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
              <p className="text-[10px] text-muted-foreground/50 mt-2">
                插件目录需包含 manifest.json 和 index.tsx
              </p>
            </div>

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
          </>
        )}

        {/* === 社区 Tab === */}
        {tab === 'community' && (
          <>
            {/* 工具栏 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium">社区插件</span>
                {cacheAge !== null && (
                  <span className="text-[10px] text-muted-foreground/50">
                    {cacheAge === 0 ? '刚刚更新' : `${cacheAge} 分钟前更新`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { clearPluginCache(); setCommunityLoading(true); loadCommunity(true) }}
                  disabled={communityLoading}
                >
                  <RefreshCw className={`mr-1 h-3 w-3 ${communityLoading ? 'animate-spin' : ''}`} />
                  刷新
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { clearPluginCache(); setCommunityPlugins([]); setCommunityLoading(true); loadCommunity(true) }}
                  title="清空本地缓存后重新拉取"
                >
                  <Trash2 className="mr-1 h-3 w-3" />清理缓存
                </Button>
              </div>
            </div>

            {/* 加载中 */}
            {communityLoading && communityPlugins.length === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="rounded-lg border border-border p-4 animate-pulse">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 bg-muted rounded w-24" />
                        <div className="h-3 bg-muted rounded w-full" />
                        <div className="h-3 bg-muted rounded w-16" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 错误 */}
            {communityError && communityPlugins.length === 0 && (
              <div className="py-12 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-xs text-muted-foreground">{communityError}</p>
                <Button variant="outline" size="sm" className="mt-3 h-7 text-xs" onClick={() => { setCommunityLoading(true); loadCommunity(true) }}>
                  重试
                </Button>
              </div>
            )}

            {/* 空态 */}
            {!communityLoading && !communityError && communityPlugins.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-xs text-muted-foreground">暂无社区插件</p>
              </div>
            )}

            {/* 插件列表 */}
            {communityPlugins.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {communityPlugins.map(p => (
                  <CommunityPluginCard
                    key={p.id}
                    plugin={p}
                    installed={isInstalled(p.id)}
                    installing={installingId === p.id}
                    progress={installingId === p.id ? installProgress : null}
                    onInstall={() => handleCommunityInstall(p)}
                  />
                ))}
              </div>
            )}

            {/* 底部提示 */}
            <p className="text-[10px] text-muted-foreground/40 text-center pt-2">
              插件来自 <a href="https://github.com/Tianzeyui/stardust-community-plugins" target="_blank" className="underline hover:text-muted-foreground">GitHub 社区仓库</a>
            </p>
          </>
        )}

        {/* === 仓库 Tab === */}
        {tab === 'repos' && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium">插件仓库</span>
              </div>
            </div>

            {/* 添加仓库 */}
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs font-medium mb-2">添加 Git 仓库</p>
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 text-sm flex-1"
                  value={repoUrl}
                  onChange={e => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/user/plugins.git"
                  onKeyDown={e => { if (e.key === 'Enter') handleAddRepo() }}
                />
                <Button size="sm" className="h-8 text-xs" onClick={handleAddRepo} disabled={repoAdding || !repoUrl.trim()}>
                  <Plus className="mr-1 h-3 w-3" />{repoAdding ? '克隆中...' : '添加'}
                </Button>
              </div>
              {repoMsg && (
                <p className={`text-xs mt-2 ${repoMsg.includes('失败') ? 'text-destructive' : 'text-green-500'}`}>
                  {repoMsg}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground/50 mt-2">
                需安装 Git。私有仓库请确保已配置 SSH Key 或凭据
              </p>
            </div>

            {/* 仓库列表 */}
            {repos.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-xs text-muted-foreground">暂无添加的仓库</p>
              </div>
            ) : (
              repos.map(repo => (
                <div key={repo.url} className="rounded-lg border border-border">
                  {/* 仓库头部 */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <p className="text-sm font-medium truncate">{repo.name}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">{repo.url}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      <span className="text-[10px] text-muted-foreground/50 mr-1">{repo.plugins.length} 个插件</span>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleRefreshRepo(repo.url)}>
                        <RefreshCw className="mr-1 h-3 w-3" />刷新
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleRecloneRepo(repo.url)} title="重新克隆整个仓库">
                        <Trash2 className="mr-1 h-3 w-3" />清理
                      </Button>
                      <button
                        className="text-muted-foreground/30 hover:text-destructive p-1"
                        onClick={() => { if (confirm(`确定移除仓库「${repo.name}」？`)) handleRemoveRepo(repo.url) }}
                        title="移除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 仓库插件列表 */}
                  <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {repo.plugins.length === 0 ? (
                      <p className="text-xs text-muted-foreground col-span-2 text-center py-4">
                        该仓库暂无插件（缺少 plugins.json）
                      </p>
                    ) : (
                      repo.plugins.map(p => (
                        <div key={p.id} className="flex items-center justify-between rounded border border-border p-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground/50 truncate">{p.description || p.id} · v{p.version}</p>
                          </div>
                          {isInstalled(p.id) ? (
                            <span className="text-[10px] text-green-500 shrink-0 ml-2">已安装</span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] shrink-0 ml-2"
                              onClick={() => handleRepoInstall(repo, p)}
                              disabled={repoInstallingId === p.id}
                            >
                              <Download className="mr-1 h-2.5 w-2.5" />
                              {repoInstallingId === p.id ? '安装中...' : '安装'}
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}

            <p className="text-[10px] text-muted-foreground/40 text-center pt-2">
              仓库需包含 plugins.json 索引文件
            </p>
          </>
        )}
      </div>
    </div>
  )
}
