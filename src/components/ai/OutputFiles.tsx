import { useState, useEffect } from 'react'
import { File, FolderOpen, ExternalLink, Trash2, X, ChevronDown, ChevronRight, Archive, FolderPlus, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileTree } from '@/components/files/FileTree'

interface OutputFilesProps {
  files: Array<{ name: string; path: string; size: number }>
  onRefresh: () => void
}

export function OutputFiles({ files, onRefresh }: OutputFilesProps) {
  const [expanded, setExpanded] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null) // file path
  const [archiveDest, setArchiveDest] = useState('')
  const [archiveBrowserPath, setArchiveBrowserPath] = useState('')
  const [archiveRefreshKey, setArchiveRefreshKey] = useState(0)
  const [newFolderName, setNewFolderName] = useState('')

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !archiveBrowserPath || !window.electronAPI?.fs) return
    await window.electronAPI.fs.mkdir(`${archiveBrowserPath}/${newFolderName.trim()}`)
    setNewFolderName('')
    setArchiveRefreshKey(n => n + 1)
  }

  useEffect(() => {
    if (archiveTarget && window.electronAPI?.workspace) {
      window.electronAPI.workspace.getPaths().then(ws => setArchiveBrowserPath(ws.root))
    }
  }, [archiveTarget])

  // 用浏览器路径或输入的路径
  const archiveDestPath = archiveDest.trim() || archiveBrowserPath

  const handleArchive = async () => {
    if (!archiveTarget || !archiveDestPath || !window.electronAPI?.fs) return
    const name = archiveTarget.split('/').pop() || 'file'
    const dest = `${archiveDestPath.replace(/\/+$/, '')}/${name}`
    try {
      const content = await window.electronAPI.fs.readFile(archiveTarget)
      if (content.success && content.content != null) {
        await window.electronAPI.fs.writeFile(dest, content.content)
        await window.electronAPI.workspace.deleteFile(archiveTarget)
        onRefresh()
      }
    } catch {}
    setArchiveTarget(null); setArchiveDest(''); setArchiveBrowserPath('')
  }

  if (files.length === 0) return null

  return (
    <div className="border-t border-border bg-muted/30">
      {/* 折叠态 */}
      {!expanded ? (
        <button
          className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full"
          onClick={() => setExpanded(true)}
        >
          <ChevronRight className="h-3 w-3" />
          <FolderOpen className="h-3 w-3" />
          <span>输出文件 ({files.length})</span>
        </button>
      ) : (
        <>
          {/* 展开态标题 */}
          <div className="flex items-center gap-2 px-4 py-1.5">
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setExpanded(false)}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            <FolderOpen className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">~/Stardust/workspace/.stardust/output/</span>
            <div className="flex-1" />
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => window.electronAPI?.workspace.openFile(files[0]?.path?.split('/').slice(0, -1).join('/') || '')}
              title="打开目录"
            >
              <ExternalLink className="h-3 w-3" />
            </button>
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={async () => { await window.electronAPI?.workspace?.clearOutputs(); onRefresh() }}
              title="清空"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>

          {/* 文件列表 */}
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {files.slice(0, 8).map((f) => (
              <div key={f.name} className="group flex items-center rounded-md border border-border bg-card transition-colors hover:bg-accent">
                <button
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
                  onClick={() => window.electronAPI?.workspace.openFile(f.path)}
                  title={`打开 ${f.name}`}
                >
                  <File className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate max-w-[120px]">{f.name}</span>
                </button>
                <button
                  className="px-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  onClick={() => { setArchiveTarget(f.path); setArchiveDest('') }}
                  title="归档到..."
                >
                  <Archive className="h-3 w-3" />
                </button>
                <button
                  className="pr-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  onClick={async () => { await window.electronAPI?.workspace?.deleteFile(f.path); onRefresh() }}
                  title="删除"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {files.length > 8 && (
              <span className="text-[10px] text-muted-foreground self-center">+{files.length - 8}</span>
            )}
          </div>
        </>
      )}

      {/* 归档弹窗 */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setArchiveTarget(null)}>
          <div className="rounded-lg border border-border bg-card shadow-lg w-[480px] max-h-[500px] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium">归档文件</p>
              <p className="text-xs text-muted-foreground truncate">{archiveTarget.split('/').pop()}</p>
            </div>

            {/* 路径栏 */}
            <div className="px-4 py-2 border-b border-border space-y-1.5">
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                  const parent = archiveBrowserPath.split('/').slice(0, -1).join('/') || '/'
                  if (parent && parent !== '/') setArchiveBrowserPath(parent)
                }} title="上级">
                  <ArrowLeft className="h-3 w-3" />
                </Button>
                <Input
                  className="h-6 text-xs font-mono flex-1"
                  value={archiveDest || archiveBrowserPath}
                  onChange={e => { setArchiveDest(e.target.value); setArchiveBrowserPath('') }}
                  placeholder="选择或输入目标目录..."
                />
              </div>
              <div className="flex items-center gap-1">
                <FolderPlus className="h-3 w-3 text-muted-foreground shrink-0" />
                <Input
                  className="h-6 text-xs flex-1"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                  placeholder="新建文件夹名称"
                />
                <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>创建</Button>
              </div>
            </div>

            {/* 目录树 */}
            <div className="flex-1 overflow-auto p-1 min-h-[200px]">
              <FileTree
                key={`${archiveBrowserPath}@${archiveRefreshKey}`}
                dirPath={archiveBrowserPath}
                selectedPath={null}
                onSelect={() => {}}
                onNavigate={setArchiveBrowserPath}
              />
            </div>

            {/* 底部按钮 */}
            <div className="px-4 py-2 border-t border-border flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground truncate flex-1 mr-2">
                目标：{archiveDestPath}
              </span>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setArchiveTarget(null); setArchiveDest(''); setArchiveBrowserPath('') }}>取消</Button>
                <Button size="sm" className="h-7 text-xs" onClick={handleArchive}>移动</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
