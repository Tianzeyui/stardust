import { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen,
  FolderSearch,
  RefreshCw,
  ExternalLink,
  ArrowUp,
  Home,
  Loader2,
  File,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/useToast'
import { FileTree } from './FileTree'

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
  const [initDone, setInitDone] = useState(false)

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
        if (await api.exists(ws.input)) {
          dirs.push({ name: '工作区输入', path: ws.input })
        }
        if (await api.exists(ws.root)) {
          dirs.push({ name: '工作区', path: ws.root })
        }

        // 默认打开第一个存在的目录
        if (dirs.length > 0) {
          setRootDirs(dirs)
          setCurrentPath(dirs[0].path)
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
  const handleRefresh = useCallback(() => {
    setSelectedFile(null)
    setFileContent(null)
    // 触发 FileTree 重新加载：调整 currentPath 强制刷新
    setCurrentPath(prev => prev + '')
  }, [])

  // 上级目录
  const handleGoUp = useCallback(() => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/'
    // 安全检查：不允许超出根目录范围
    if (parent && parent !== '/') {
      setCurrentPath(parent)
      setSelectedFile(null)
      setFileContent(null)
    }
  }, [currentPath])

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
      <div className="border-b border-border px-4 py-2 flex items-center gap-2">
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

        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleGoUp} title="上级目录">
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleRefresh} title="刷新">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1" onClick={handleBrowse}>
          <FolderSearch className="h-3.5 w-3.5" />
          <span className="text-[11px]">浏览</span>
        </Button>
      </div>

      {/* 路径栏 */}
      <div className="border-b border-border px-4 py-1.5">
        <Input
          className="h-7 text-xs font-mono"
          value={currentPath}
          onChange={e => setCurrentPath(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              setSelectedFile(null)
              setFileContent(null)
            }
          }}
          placeholder="输入目录路径后回车..."
        />
      </div>

      {/* 主内容：左文件树 + 右预览 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧文件树 */}
        <div className="w-64 shrink-0 border-r border-border overflow-auto">
          {currentPath ? (
            <div className="py-1">
              <FileTree
                key={currentPath}
                dirPath={currentPath}
                selectedPath={selectedFile?.path ?? null}
                onSelect={handleSelectFile}
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
              <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {selectedFile.path}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
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
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
                    {fileContent.length > 200000
                      ? fileContent.slice(0, 200000) + '\n\n... (内容过长，已截断)'
                      : fileContent}
                  </pre>
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
    </div>
  )
}
