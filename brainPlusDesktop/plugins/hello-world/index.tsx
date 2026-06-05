/**
 * Hello World 插件 — React/TSX 版
 *
 * 演示能力：React 组件、shadcn/ui、lucide-react、Supabase 用户查询、Cloudinary 图片上传
 */
import React, { useState, useEffect, useRef } from 'react'
import { Bot, Sparkles, MessageSquare, User, Mail, Calendar, Key, Clock, Upload, Image, X, Loader2, Brain, FileText, Download, Eye, Database, Globe, Bell, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export function register(ctx: any) {
  const { supabase, cloudinary, ai, dialog, file: fileApi, fs, storage, http, ui, workspace, plugin, sandbox } = ctx.api

  const MyPage = () => {
    const [name, setName] = useState('')
    const [greeting, setGreeting] = useState('')

    // Supabase
    const [user, setUser] = useState<any>(null)
    const [userLoading, setUserLoading] = useState(true)
    const [userError, setUserError] = useState('')

    // Cloudinary
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
    const [uploadedUrl, setUploadedUrl] = useState('')
    const [uploadError, setUploadError] = useState('')

    // AI 对话
    const [aiPrompt, setAiPrompt] = useState('')
    const [aiReply, setAiReply] = useState('')
    const [aiLoading, setAiLoading] = useState(false)
    const [modelName, setModelName] = useState('')

    useEffect(() => { ai.getModelName().then(setModelName) }, [])

    // 文档处理
    const [docPath, setDocPath] = useState('')
    const [docText, setDocText] = useState('')
    const [docLoading, setDocLoading] = useState(false)
    const [docPreview, setDocPreview] = useState(false)

    const handleSelectDoc = async () => {
      try {
        const files = await dialog.openFile({
          filters: [{ name: '文档', extensions: ['pdf', 'docx', 'txt', 'md', 'pptx', 'xlsx'] }]
        })
        if (files.length > 0) {
          setDocPath(files[0])
          setDocText('')
          setDocPreview(false)
        }
      } catch (e: any) { /* 用户取消 */ }
    }

    const handleConvertDoc = async () => {
      if (!docPath) return
      setDocLoading(true); setDocText('')
      try {
        const text = await fileApi.convert(docPath)
        setDocText(text)
      } catch (e: any) { setDocText(`转换失败: ${e.message}`) }
      finally { setDocLoading(false) }
    }

    const handleSaveDoc = async () => {
      if (!docText) return
      const name = docPath.split('/').pop()!.replace(/\.[^.]+$/, '')
      const paths = await workspace.getPaths()
      const outPath = `${paths.output}/${name}.converted.md`
      await fs.writeFile(outPath, docText)
      ui.toast(`已保存到 ${outPath}`, 'success')
    }

    // 存储 + HTTP + Toast + Workspace 演示
    const [storeVal, setStoreVal] = useState(storage.get('demo_key') || '')
    const [httpResult, setHttpResult] = useState('')
    const [dirList, setDirList] = useState<string[]>([])

    const handleSaveStore = () => {
      storage.set('demo_key', storeVal)
      ui.toast('已保存到插件存储', 'success')
    }

    const handleHttpTest = async () => {
      setHttpResult('请求中…')
      try {
        const data = await http.fetch('https://api.github.com/zen', { timeout: 8000 })
        setHttpResult(data)
        ui.toast('HTTP 请求成功', 'success')
      } catch (e: any) { setHttpResult(`失败: ${e.message}`) }
    }

    // API 自检
    const [testResults, setTestResults] = useState<Array<{ name: string; status: 'pass' | 'fail' | 'skip' | 'running'; msg: string }>>([])
    const [testRunning, setTestRunning] = useState(false)

    const runTests = async () => {
      setTestRunning(true)
      const results: Array<{ name: string; status: 'pass' | 'fail' | 'skip' | 'running'; msg: string }> = []
      const add = (name: string, status: 'pass' | 'fail' | 'skip', msg: string) => {
        results.push({ name, status, msg }); setTestResults([...results])
      }
      const pass = (name: string, msg = '') => add(name, 'pass', msg)
      const fail = (name: string, e: any) => add(name, 'fail', e?.message || String(e))
      const skip = (name: string, msg = '') => add(name, 'skip', msg)

      // storage
      try { storage.set('_test', 'hello'); const v = storage.get('_test'); if (v === 'hello') pass('storage'); else fail('storage', new Error(`expected hello, got ${v}`)) } catch (e) { fail('storage', e) }

      // plugin.getDir
      try { const d = plugin.getDir(); if (d) pass('plugin.getDir', d.split('/').slice(-1)[0]); else fail('plugin.getDir', new Error('empty')) } catch (e) { fail('plugin.getDir', e) }

      // workspace
      try { const p = await workspace.getPaths(); if (p.output) pass('workspace.getPaths'); else fail('workspace.getPaths', new Error('no output')) } catch (e) { fail('workspace.getPaths', e) }
      try { await workspace.listOutputs(); pass('workspace.listOutputs') } catch (e) { fail('workspace.listOutputs', e) }

      // fs
      try { await fs.exists('.'); pass('fs.exists') } catch (e) { fail('fs.exists', e) }
      try { const files = await fs.listDir(); pass('fs.listDir', `${files.length} files`) } catch (e) { fail('fs.listDir', e) }
      try { const s = await fs.stat('manifest.json'); pass('fs.stat', `${s.size}B`) } catch (e) { fail('fs.stat', e) }
      try {
        if (await fs.exists('_test.txt')) await fs.unlink('_test.txt')
        await fs.writeFile('_test.txt', 'test'); const t = await fs.readFile('_test.txt')
        await fs.unlink('_test.txt'); if (t === 'test') pass('fs.readFile/writeFile/unlink'); else fail('fs.readFile/writeFile/unlink', new Error(`expected test, got ${t}`))
      } catch (e) { fail('fs.readFile/writeFile/unlink', e) }

      // ai
      try { const n = await ai.getModelName(); if (n) pass('ai.getModelName', n); else skip('ai.getModelName', '未配置模型') } catch (e) { fail('ai.getModelName', e) }

      // http (skip if offline)
      try { const data = await http.fetch('https://httpbin.org/get?test=1', { timeout: 5000 }); pass('http.fetch', `${data.length} chars`) } catch (e) { fail('http.fetch', e) }

      // ui.toast
      try { ui.toast('自检完成', 'success'); pass('ui.toast') } catch (e) { fail('ui.toast', e) }

      // dialog (skip — requires user interaction)
      skip('dialog.openFile', '需用户交互')

      // file.convert (skip — requires file path)
      skip('file.convert', '需文件路径')

      // sandbox
      try {
        if (!sandbox) { skip('sandbox', 'API 未暴露'); }
        else {
          const jsR = await sandbox.executeJS('"hello " + "sandbox"')
          if (jsR?.success !== false && jsR) pass('sandbox.executeJS', 'OK')
          else fail('sandbox.executeJS', new Error(jsR?.error || 'no result'))
        }
      } catch (e: any) { fail('sandbox', e) }

      setTestRunning(false)
    }

    const handleListDir = async () => {
      try {
        const files = await fs.listDir()
        setDirList(files)
        if (files.length === 0) ui.toast('目录为空')
      } catch (e: any) { ui.toast(e.message, 'error') }
    }

    const handleAiChat = async () => {
      if (!aiPrompt.trim()) return
      setAiLoading(true); setAiReply('')
      try {
        const reply = await ai.chat({ messages: [{ role: 'user', content: aiPrompt }] })
        setAiReply(reply)
      } catch (e: any) { setAiReply(`错误: ${e.message}`) }
      finally { setAiLoading(false) }
    }

    useEffect(() => {
      if (!supabase?.isConfigured()) { setUserLoading(false); return }
      const client = supabase.getClient()
      if (!client) { setUserError('Supabase 客户端未初始化'); setUserLoading(false); return }
      client.auth.getUser().then(({ data }: any) => {
        setUser(data?.user || null); setUserLoading(false)
      }).catch((e: any) => { setUserError(e.message); setUserLoading(false) })
    }, [])

    const handleGreet = () => setGreeting(`你好，${name || '世界'}！`)

    const handleUpload = async (file: File) => {
      if (!file.type.startsWith('image/')) return
      setUploadState('uploading')
      try {
        const url = await cloudinary.upload(file)
        setUploadedUrl(url)
        setUploadState('done')
      } catch (e: any) {
        setUploadError(e.message)
        setUploadState('error')
      }
    }

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files?.[0]
      if (file) handleUpload(file)
    }

    const formatTime = (iso: string) =>
      iso ? new Date(iso).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

    return (
      <div className="p-4 space-y-3">
        {/* 欢迎卡 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <Bot className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">Hello World 插件</h2>
                <p className="text-[10px] text-muted-foreground">React/TSX · v1.0.0 · permissions: ai, supabase, cloudinary, sandbox, files</p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              使用 <Badge variant="secondary" className="text-[10px] px-1 py-0">React</Badge> + <Badge variant="secondary" className="text-[10px] px-1 py-0">TypeScript</Badge> 编写，
              演示 <Badge variant="secondary" className="text-[10px] px-1 py-0">ctx.api.supabase</Badge> 用户查询、
              <Badge variant="secondary" className="text-[10px] px-1 py-0">ctx.api.cloudinary</Badge> 图片上传、
              <Badge variant="secondary" className="text-[10px] px-1 py-0">ctx.api.dialog</Badge> 文档转换等能力。
            </div>
          </CardContent>
        </Card>

        {/* 当前用户 — Supabase */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="text-xs font-semibold text-foreground">当前登录用户</h3>
              <Badge variant="secondary" className="text-[10px] px-1 py-0">supabase</Badge>
            </div>
            {userLoading ? <p className="text-[11px] text-muted-foreground">加载中…</p>
            : userError ? <p className="text-[11px] text-destructive">{userError}</p>
            : user ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  [Mail, '邮箱', user.email],
                  [Key, '用户 ID', (user.id || '').slice(0, 8) + '…'],
                  [Calendar, '注册时间', formatTime(user.created_at)],
                  [Clock, '最后登录', formatTime(user.last_sign_in_at)],
                ].map(([Icon, label, val], i) => (
                  <div key={i} className="flex items-center gap-2 rounded border border-border bg-muted/30 px-3 py-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0"><p className="text-[10px] text-muted-foreground">{label}</p><p className="text-[11px] font-medium text-foreground truncate">{val}</p></div>
                  </div>
                ))}
              </div>
            ) : <p className="text-[11px] text-muted-foreground">未登录。请先在设置中配置 Supabase 并登录。</p>}
          </CardContent>
        </Card>

        {/* Cloudinary 图片上传 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="text-xs font-semibold text-foreground">图片上传</h3>
              <Badge variant="secondary" className="text-[10px] px-1 py-0">cloudinary</Badge>
            </div>

            {!cloudinary?.isConfigured() ? (
              <p className="text-[11px] text-muted-foreground">请先在设置中配置 Cloudinary。</p>
            ) : uploadState === 'done' ? (
              <div className="space-y-2">
                <div className="relative rounded-md overflow-hidden border border-border bg-muted/10">
                  <img src={uploadedUrl} alt="uploaded" className="w-full max-h-48 object-contain" />
                  <button onClick={() => { setUploadState('idle'); setUploadedUrl('') }}
                    className="absolute top-1 right-1 h-5 w-5 rounded bg-background/80 border border-border flex items-center justify-center hover:bg-background transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground break-all font-mono">{uploadedUrl}</p>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3 w-3 mr-1" />重新上传
                </Button>
              </div>
            ) : (
              <div
                className={`relative rounded-md border-2 border-dashed transition-colors cursor-pointer
                  ${uploadState === 'uploading' ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-muted-foreground/30 hover:bg-accent/50'}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                {uploadState === 'uploading' ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> 上传中…
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-6 gap-1.5">
                    <Image className="h-5 w-5 text-muted-foreground/40" />
                    <p className="text-[11px] text-muted-foreground">点击或拖拽图片到这里</p>
                    <p className="text-[10px] text-muted-foreground/50">支持 JPG、PNG、GIF、WebP</p>
                  </div>
                )}
              </div>
            )}
            {uploadState === 'error' && (
              <p className="mt-2 text-[11px] text-destructive">{uploadError}</p>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleUpload(f); }} />
          </CardContent>
        </Card>

        {/* 文档处理 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="text-xs font-semibold text-foreground">文档处理</h3>
              <Badge variant="secondary" className="text-[10px] px-1 py-0">files</Badge>
            </div>
            {!docPath ? (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleSelectDoc}>
                <Upload className="h-3 w-3 mr-1" />选择文档
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="text-[11px] text-foreground bg-muted/50 px-2 py-0.5 rounded truncate flex-1">{docPath.split('/').pop()}</code>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] shrink-0" onClick={handleSelectDoc}>更换</Button>
                  <Button size="sm" className="h-7 text-[11px] shrink-0" onClick={handleConvertDoc} disabled={docLoading}>
                    {docLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : '转换'}
                  </Button>
                </div>
                {docText && (
                  <>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" className="h-6 text-[10px]"
                        onClick={() => setDocPreview(!docPreview)}>
                        <Eye className="h-3 w-3 mr-1" />{docPreview ? '收起预览' : '预览'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={handleSaveDoc}>
                        <Download className="h-3 w-3 mr-1" />保存 .md
                      </Button>
                      <span className="text-[10px] text-muted-foreground ml-auto">{docText.length} 字符</span>
                    </div>
                    {docPreview && (
                      <div className="rounded border border-border bg-muted/20 p-3 max-h-48 overflow-auto text-[11px] text-foreground leading-relaxed whitespace-pre-wrap">
                        {docText.slice(0, 2000)}{docText.length > 2000 ? '\n\n…（预览截断）' : ''}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI 对话 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="text-xs font-semibold text-foreground">AI 模型调用</h3>
              <Badge variant="secondary" className="text-[10px] px-1 py-0">ai</Badge>
              {modelName && <span className="text-[10px] text-muted-foreground ml-auto">{modelName}</span>}
            </div>
            {!modelName ? (
              <p className="text-[11px] text-muted-foreground">请先在设置中配置并启用一个 AI 模型。</p>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <textarea placeholder="输入提示词…" value={aiPrompt}
                    onChange={(e) => setAiPrompt((e.target as HTMLTextAreaElement).value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiChat() } }}
                    className="flex-1 min-h-[48px] rounded border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-ring resize-none" />
                  <Button size="sm" onClick={handleAiChat} disabled={aiLoading} className="h-8 text-xs shrink-0">
                    {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : '发送'}
                  </Button>
                </div>
                {aiReply && (
                  <div className="mt-2 rounded border border-border bg-muted/20 px-3 py-2 text-xs text-foreground leading-relaxed max-h-32 overflow-auto whitespace-pre-wrap">{aiReply}</div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* 打招呼 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="text-xs font-semibold text-foreground">试试打招呼</h3>
            </div>
            <div className="flex items-center gap-2">
              <Input placeholder="输入名字…" value={name}
                onChange={(e) => setName((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGreet()}
                className="h-8 text-xs flex-1" />
              <Button size="sm" onClick={handleGreet} className="h-8 text-xs shrink-0">打招呼</Button>
            </div>
            {greeting && (
              <div className="mt-2 rounded border border-border bg-muted/20 px-3 h-8 flex items-center text-xs text-foreground">{greeting}</div>
            )}
          </CardContent>
        </Card>

        {/* 基础能力 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="text-xs font-semibold text-foreground">基础能力</h3>
              <span className="text-[10px] text-muted-foreground ml-auto">storage · http · ui · workspace</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {/* 存储 */}
              <div className="rounded border border-border bg-muted/30 px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-foreground">存储</span>
                </div>
                <div className="flex items-center gap-1">
                  <input placeholder="输入值…" value={storeVal}
                    onChange={(e: any) => setStoreVal(e.target.value)}
                    className="flex-1 h-7 rounded border border-input bg-background px-2 text-[11px] outline-none focus:ring-1 focus:ring-ring" />
                  <Button size="sm" className="h-7 text-[10px] px-2" onClick={handleSaveStore}>保存</Button>
                </div>
              </div>
              {/* HTTP */}
              <div className="rounded border border-border bg-muted/30 px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-foreground">HTTP 请求</span>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-[10px] w-full" onClick={handleHttpTest}>请求 GitHub API</Button>
                {httpResult && <p className="text-[10px] text-muted-foreground truncate">{httpResult}</p>}
              </div>
              {/* Toast */}
              <div className="rounded border border-border bg-muted/30 px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-foreground">Toast 通知</span>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1" onClick={() => ui.toast('操作成功', 'success')}>成功</Button>
                  <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1" onClick={() => ui.toast('操作失败', 'error')}>错误</Button>
                  <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1" onClick={() => ui.toast('提示信息')}>提示</Button>
                </div>
              </div>
              {/* 插件目录 */}
              <div className="rounded border border-border bg-muted/30 px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-foreground">插件 & Workspace</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <Button size="sm" variant="outline" className="h-7 text-[10px]"
                    onClick={() => ui.toast(plugin.getDir(), 'info')}>插件目录</Button>
                  <Button size="sm" variant="outline" className="h-7 text-[10px]"
                    onClick={handleListDir}>列出文件</Button>
                  <Button size="sm" variant="outline" className="h-7 text-[10px]"
                    onClick={async () => { const p = await workspace.getPaths(); ui.toast(p.output, 'info') }}>输出路径</Button>
                  <Button size="sm" variant="outline" className="h-7 text-[10px]"
                    onClick={async () => { const files = await workspace.listOutputs(); ui.toast(files.length ? `${files[0].name} 等 ${files.length} 个文件` : '无文件') }}>输出列表</Button>
                </div>
                {dirList.length > 0 && (
                  <p className="text-[10px] text-muted-foreground truncate">{dirList.join(' · ')}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI 工具 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="text-xs font-semibold text-foreground">AI 工具</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['plugin__plugin_hello', '传入 name 返回个性化问候'],
                ['plugin__plugin_time', '获取当前日期和时间'],
              ].map(([tool, desc]) => (
                <div key={tool} className="rounded border border-border bg-muted/30 px-3 py-2">
                  <code className="text-[11px] font-medium text-foreground">{tool}</code>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* API 自检 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-base">🧪</span>
                <h3 className="text-xs font-semibold text-foreground">API 自检</h3>
              </div>
              <Button size="sm" className="h-7 text-[11px]" onClick={runTests} disabled={testRunning}>
                {testRunning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                {testRunning ? '测试中…' : '运行测试'}
              </Button>
            </div>
            {testResults.length > 0 && (
              <div className="grid gap-1 sm:grid-cols-2">
                {testResults.map(r => (
                  <div key={r.name} className={`flex items-center gap-2 rounded px-2 py-1 text-[11px] ${
                    r.status === 'pass' ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30' :
                    r.status === 'fail' ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30' :
                    'text-muted-foreground bg-muted/30'
                  }`}>
                    <span className="font-mono shrink-0 w-4 text-center">
                      {r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : '−'}
                    </span>
                    <span className="truncate">{r.name}</span>
                    {r.msg && <span className="text-[10px] opacity-60 ml-auto shrink-0">{r.msg}</span>}
                  </div>
                ))}
              </div>
            )}
            {testResults.length > 0 && !testRunning && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                {testResults.filter(r => r.status === 'pass').length} 通过 · {testResults.filter(r => r.status === 'fail').length} 失败 · {testResults.filter(r => r.status === 'skip').length} 跳过
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  ctx.registerNav({ id: 'hello-world', label: 'Hello World', icon: 'Package', order: 90 })
  ctx.registerRoute('hello-world', () => Promise.resolve({ default: MyPage }))
}
