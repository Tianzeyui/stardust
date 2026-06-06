import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FolderOpen,
  FolderSearch,
  RefreshCw,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
  Home,
  Loader2,
  File,
  Plus,
  FolderPlus,
  FilePlus,
  Upload,
  Copy,
  Scissors,
  ClipboardPaste,
  Trash2,
  Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/useToast'
import { FileTree } from './FileTree'
import { MdEditor } from '@/components/editor/MdEditor'

interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
}

const TEXT_EXTS = new Set([
  'md', 'txt', 'log', 'json', 'yaml', 'yml', 'toml', 'xml', 'html', 'css',
  'js', 'ts', 'jsx', 'tsx', 'py', 'sh', 'bash', 'zsh', 'rb', 'go', 'rs',
  'java', 'c', 'cpp', 'h', 'hpp', 'swift', 'kt', 'sql', 'graphql', 'env',
  'gitignore', 'dockerfile', 'editorconfig', 'csv', 'tsv',
])

function isTextFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return TEXT_EXTS.has(ext)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileManagerPage() {
  const [currentPath, setCurrentPath] = useState('')
  const [rootDirs, setRootDirs] = useState<Array<{ name: string; path: string }>>([])
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [initDone, setInitDone] = useState(false)
  const [showNewMenu, setShowNewMenu] = useState(false)
  const [newItemPrompt, setNewItemPrompt] = useState<{ type: 'folder' | 'file'; ext: string } | null>(null)
  const [newItemName, setNewItemName] = useState('')
  // 剪贴板
  const [clipboard, setClipboard] = useState<{ path: string; name: string; op: 'copy' | 'cut' } | null>(null)
  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{ entry: FileEntry; x: number; y: number } | null>(null)

  // 初始化：获取工作区路径作为根目录
  useEffect(() => {
    async function init() {
      if (!window.electronAPI?.workspace) return
      try {
        const ws = await window.electronAPI.workspace.getPaths()
        const api = window.electronAPI!.fs

        const dirs: Array<{ name: string; path: string }> = []
        // 检查 workspace 各子目录是否存在
        if (await api.exists(ws.output)) {
          dirs.push({ name: '工作区输出', path: ws.output })
        }
        if (await api.exists(ws.root)) {
          dirs.push({ name: '工作区', path: ws.root })
        }

        // 默认打开第一个存在的目录
        if (dirs.length > 0) {
          setRootDirs(dirs)
          const p = dirs[0].path
          setCurrentPath(p)
          fwdRef.current = []
        }
      } catch { /* 忽略 */ }
      setInitDone(true)
    }
    init()
  }, [])

  // 浏览目录
  const handleBrowse = useCallback(async () => {
    if (!window.electronAPI?.dialog) return
    const result = await window.electronAPI.dialog.openDirectory()
    if (result.success && result.path) {
      setCurrentPath(result.path)
      setSelectedFile(null)
      setFileContent(null)
    }
  }, [])

  // 刷新当前目录
  const [refreshKey, setRefreshKey] = useState(0)
  const handleRefresh = useCallback(() => {
    setSelectedFile(null); setFileContent(null)
    setRefreshKey(n => n + 1)
  }, [])

  // 前进栈
  const fwdRef = useRef<string[]>([])
  const [, forceUpdate] = useState(0)

  const goDir = (p: string) => {
    const clean = p.replace(/\/+/g, '/')
    fwdRef.current = []
    setCurrentPath(clean); setSelectedFile(null); setFileContent(null)
    forceUpdate(n => n + 1)
  }

  const parentDir = (() => {
    const parts = currentPath.replace(/[\\/]+$/, '').split(/[\\/]/)
    if (parts.length <= 1) return null
    const p = parts.slice(0, -1).join('/')
    const isWin = window.electronAPI?.platform === 'win32'
    if (isWin && parts.length <= 2) return null // C: 根目录
    const inWorkspace = rootDirs.some(d => currentPath.replace(/\\/g, '/').startsWith(d.path))
    if (!inWorkspace) return null
    return p
  })()

  const goBack = () => {
    if (!parentDir) return
    fwdRef.current.push(currentPath)
    setCurrentPath(parentDir); setSelectedFile(null); setFileContent(null)
    forceUpdate(n => n + 1)
  }

  const goForward = () => {
    if (fwdRef.current.length === 0) return
    setCurrentPath(fwdRef.current.pop()!); setSelectedFile(null); setFileContent(null)
    forceUpdate(n => n + 1)
  }

  // 上传外部文件到当前目录
  const handleUploadFile = useCallback(async () => {
    if (!window.electronAPI?.dialog || !window.electronAPI?.fs || !currentPath) return
    const result = await window.electronAPI.dialog.openFile({ filters: [{ name: '所有文件', extensions: ['*'] }] })
    if (!result.success || !result.files) return
    for (const src of result.files) {
      const name = src.split(/[\\/]/).pop() || 'file'
      const dest = `${currentPath}/${name}`
      try {
        const content = await window.electronAPI.fs.readFile(src)
        if (content.success && content.content != null) {
          await window.electronAPI.fs.writeFile(dest, content.content)
        }
      } catch {}
    }
    handleRefresh()
  }, [currentPath, handleRefresh])

  // 选中文件
  const handleSelectFile = useCallback(async (entry: FileEntry) => {
    if (entry.isDir) return // 目录由 FileTree 处理展开
    setSelectedFile(entry)
    setLoadingContent(true)

    try {
      const api = window.electronAPI?.fs
      if (!api) return

      if (isTextFile(entry.name) && entry.size < 500 * 1024) {
        // 文本文件且 <500KB：读取并显示内容
        const result = await api.readFile(entry.path)
        if (result.success && result.content != null) {
          setFileContent(result.content)
        } else {
          setFileContent(null)
        }
      } else {
        // 二进制文件或大文件：显示文件信息
        setFileContent(null)
      }
    } catch {
      setFileContent(null)
    } finally {
      setLoadingContent(false)
    }
  }, [])

  // 新建
  const handleCreate = useCallback(async () => {
    if (!newItemPrompt || !newItemName.trim() || !currentPath || !window.electronAPI?.fs) return
    const name = newItemName.trim()
    const fullPath = `${currentPath}/${name}${newItemPrompt.type === 'file' ? '.' + newItemPrompt.ext : ''}`

    if (newItemPrompt.type === 'folder') {
      const r = await window.electronAPI.fs.mkdir(fullPath)
      if (!r.success) { toast({ title: '创建失败', description: r.error, variant: 'destructive' }); return }
    } else {
      const r = await window.electronAPI.fs.writeFile(fullPath, '')
      if (!r.success) { toast({ title: '创建失败', description: r.error, variant: 'destructive' }); return }
    }
    setNewItemPrompt(null); setNewItemName(''); setShowNewMenu(false)
    handleRefresh()
  }, [newItemPrompt, newItemName, currentPath, handleRefresh])

  // 复制/剪切/删除
  const handleCopy = useCallback((entry: FileEntry, op: 'copy' | 'cut') => {
    setClipboard({ path: entry.path, name: entry.name, op })
    toast({ title: op === 'copy' ? '已复制' : '已剪切', description: entry.name })
  }, [])

  const handleDelete = useCallback(async (entry: FileEntry) => {
    if (!window.electronAPI?.fs) return
    await window.electronAPI.fs.unlink(entry.path)
    toast({ title: '已删除', description: entry.name })
    setSelectedFile(null); setFileContent(null); setContextMenu(null)
    handleRefresh()
  }, [handleRefresh])

  const handleContextMenu = useCallback((entry: FileEntry, x: number, y: number) => {
    setContextMenu({ entry, x, y })
  }, [])

  const handlePaste = useCallback(async () => {
    if (!clipboard || !currentPath || !window.electronAPI?.fs) return
    const dest = `${currentPath}/${clipboard.name}`
    try {
      const content = await window.electronAPI.fs.readFile(clipboard.path)
      if (!content.success) { toast({ title: '粘贴失败', description: content.error, variant: 'destructive' }); return }
      await window.electronAPI.fs.writeFile(dest, content.content || '')
      if (clipboard.op === 'cut') {
        await window.electronAPI.fs.unlink(clipboard.path)
        toast({ title: '已移动', description: clipboard.name })
      } else {
        toast({ title: '已粘贴', description: clipboard.name })
      }
      setClipboard(null)
      handleRefresh()
    } catch (e: any) {
      toast({ title: '粘贴失败', description: e.message, variant: 'destructive' })
    }
  }, [clipboard, currentPath, handleRefresh])

  // 编辑
  const startEdit = useCallback(() => {
    if (fileContent != null) { setEditContent(fileContent); setEditing(true) }
  }, [fileContent])
  const saveEdit = useCallback(async () => {
    if (!selectedFile || !window.electronAPI?.fs) return
    await window.electronAPI.fs.writeFile(selectedFile.path, editContent)
    setFileContent(editContent); setEditing(false)
    toast({ title: '已保存', description: selectedFile.name })
  }, [selectedFile, editContent])
  const cancelEdit = useCallback(() => { setEditing(false); setEditContent('') }, [])

  // 用系统默认程序打开
  const handleOpenExternally = useCallback(async () => {
    if (!selectedFile || !window.electronAPI?.workspace) return
    await window.electronAPI.workspace.openFile(selectedFile.path)
  }, [selectedFile])

  if (!initDone) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm">初始化文件系统...</span>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶部栏 */}
      <div className="flex h-11 items-center gap-2 px-4">
        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
        <h2 className="text-sm font-semibold shrink-0">文件</h2>

        {/* 根目录快捷切换 */}
        {rootDirs.length > 1 && (
          <div className="flex items-center gap-1 ml-2">
            {rootDirs.map(dir => (
              <button
                key={dir.path}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  currentPath === dir.path
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                onClick={() => { setCurrentPath(dir.path); setSelectedFile(null); setFileContent(null) }}
              >
                <Home className="h-3 w-3 inline mr-1" />
                {dir.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* 新建下拉 */}
        <div className="relative">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setShowNewMenu(!showNewMenu)} title="新建">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          {showNewMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNewMenu(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 w-32 rounded-lg border border-border bg-card shadow-lg py-1">
                <button className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                  onClick={() => { setNewItemPrompt({ type: 'folder', ext: '' }); setNewItemName(''); setShowNewMenu(false) }}>
                  <FolderPlus className="h-3.5 w-3.5" /> 文件夹
                </button>
                <button className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                  onClick={() => { setNewItemPrompt({ type: 'file', ext: 'md' }); setNewItemName(''); setShowNewMenu(false) }}>
                  <FilePlus className="h-3.5 w-3.5" /> .md 文件
                </button>
                <button className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                  onClick={() => { setNewItemPrompt({ type: 'file', ext: 'json' }); setNewItemName(''); setShowNewMenu(false) }}>
                  <FilePlus className="h-3.5 w-3.5" /> .json 文件
                </button>
                <button className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                  onClick={() => { setNewItemPrompt({ type: 'file', ext: 'yml' }); setNewItemName(''); setShowNewMenu(false) }}>
                  <FilePlus className="h-3.5 w-3.5" /> .yml 文件
                </button>
              </div>
            </>
          )}
        </div>

        {clipboard && (
          <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={handlePaste} title={`粘贴 ${clipboard.name}`}>
            <ClipboardPaste className="h-3.5 w-3.5" />
            <span className="text-[10px] text-muted-foreground max-w-[80px] truncate">{clipboard.name}</span>
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleUploadFile} title="上传文件到当前目录">
          <Upload className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleRefresh} title="刷新">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1" onClick={handleBrowse}>
          <FolderSearch className="h-3.5 w-3.5" />
          <span className="text-[11px]">浏览</span>
        </Button>
      </div>

      {/* 路径栏 + 新建（统一 border-b 区域） */}
      <div className="border-b border-border px-4 py-1.5 flex items-center gap-1">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={goBack} disabled={!parentDir} title="后退">
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={goForward} disabled={fwdRef.current.length === 0} title="前进">
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <Input
          className="h-7 text-xs font-mono flex-1"
          value={currentPath}
          onChange={e => setCurrentPath(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { setSelectedFile(null); setFileContent(null) }
          }}
          placeholder="输入目录路径后回车..."
        />
      </div>

      {/* 新建文件/文件夹命名 */}
      {newItemPrompt && (
        <div className="px-4 py-1.5 flex items-center gap-2 bg-muted/30">
          <span className="text-xs text-muted-foreground shrink-0">
            {newItemPrompt.type === 'folder' ? '新建文件夹：' : `新建 .${newItemPrompt.ext} 文件：`}
          </span>
          <Input
            className="h-7 w-48 text-xs"
            value={newItemName}
            onChange={e => setNewItemName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setNewItemPrompt(null); setNewItemName('') }
            }}
            placeholder={newItemPrompt.type === 'folder' ? '文件夹名' : '文件名（不含扩展名）'}
            autoFocus
          />
          <Button size="sm" className="h-7 text-xs" onClick={handleCreate} disabled={!newItemName.trim()}>创建</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setNewItemPrompt(null); setNewItemName('') }}>取消</Button>
        </div>
      )}

      {/* 主内容：左文件树 + 右预览 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧文件树 */}
        <div className="w-64 shrink-0 border-r border-border overflow-auto">
          {currentPath ? (
            <div className="py-1">
              <FileTree
                key={`${currentPath}@${refreshKey}`}
                dirPath={currentPath}
                selectedPath={selectedFile?.path ?? null}
                onSelect={handleSelectFile}
                onNavigate={goDir}
                onContextMenu={handleContextMenu}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <FolderOpen className="h-10 w-10 opacity-20" />
              <p className="text-xs">点击「浏览」选择目录</p>
            </div>
          )}
        </div>

        {/* 右侧预览 */}
        <div className="flex-1 overflow-auto min-w-0">
          {!selectedFile ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <File className="h-12 w-12 opacity-20" />
              <p className="text-sm">选择文件以预览</p>
            </div>
          ) : loadingContent ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* 文件信息头 */}
              <div className="flex h-11 items-center justify-between px-4 bg-muted/30">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {selectedFile.path}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleCopy(selectedFile, 'copy')} title="复制">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleCopy(selectedFile, 'cut')} title="剪切">
                    <Scissors className="h-3.5 w-3.5" />
                  </Button>
                  {isTextFile(selectedFile.name) && (
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={startEdit} title="编辑">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleDelete(selectedFile)} title="删除">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    {formatSize(selectedFile.size)}
                  </span>
                  {window.electronAPI?.workspace && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={handleOpenExternally}
                      title="用默认程序打开"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* 内容 */}
              <div className="flex-1 overflow-auto p-4">
                {fileContent != null ? (
                  editing ? (
                    <div className="flex flex-col h-full">
                      {selectedFile.name.endsWith('.md') ? (
                        <MdEditor value={editContent} onChange={setEditContent} defaultMode="edit" minHeight="400px" />
                      ) : (
                        <textarea
                          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{ minHeight: '400px' }}
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          spellCheck={false}
                        />
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Button size="sm" className="h-7 text-xs" onClick={saveEdit}>保存</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>取消</Button>
                      </div>
                    </div>
                  ) : (
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
                      {fileContent.length > 200000
                        ? fileContent.slice(0, 200000) + '\n\n... (内容过长，已截断)'
                        : fileContent}
                    </pre>
                  )
                ) : (
                  <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                    <File className="h-10 w-10 opacity-20" />
                    <p className="text-xs">二进制文件或文件过大，无法预览</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={handleOpenExternally}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      用默认程序打开
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 rounded-lg border border-border bg-card shadow-lg py-1 w-36"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
              onClick={() => { handleCopy(contextMenu.entry, 'copy'); setContextMenu(null) }}>
              <Copy className="h-3.5 w-3.5" /> 复制
            </button>
            <button className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
              onClick={() => { handleCopy(contextMenu.entry, 'cut'); setContextMenu(null) }}>
              <Scissors className="h-3.5 w-3.5" /> 剪切
            </button>
            <div className="border-t border-border my-0.5" />
            <button className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
              onClick={() => handleDelete(contextMenu.entry)}>
              <Trash2 className="h-3.5 w-3.5" /> 删除
            </button>
          </div>
        </>
      )}
    </div>
  )
}
