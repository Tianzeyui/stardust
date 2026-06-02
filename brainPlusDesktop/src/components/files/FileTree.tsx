import { useState, useEffect, useCallback } from 'react'
import {
  Folder,
  FolderOpen,
  File,
  FileText,
  FileCode,
  FileJson,
  FileImage,
  ChevronRight,
  ChevronDown,
  Loader2,
} from 'lucide-react'

interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
}

interface FileTreeProps {
  dirPath: string
  selectedPath: string | null
  onSelect: (entry: FileEntry) => void
  depth?: number
}

/** 根据扩展名返回图标 */
function fileIcon(name: string): typeof File {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'md':
    case 'txt':
    case 'log':
      return FileText
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'py':
    case 'sh':
      return FileCode
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
      return FileJson
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'ico':
      return FileImage
    default:
      return File
  }
}

export function FileTree({ dirPath, selectedPath, onSelect, depth = 0 }: FileTreeProps) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(depth < 1) // 根级别默认展开

  const loadDir = useCallback(async () => {
    setLoading(true)
    try {
      const api = window.electronAPI?.fs
      if (!api) return

      const listResult = await api.listDir(dirPath)
      if (!listResult.success || !listResult.files) {
        setEntries([])
        return
      }

      const items: FileEntry[] = []
      for (const name of listResult.files) {
        // 跳过隐藏文件
        if (name.startsWith('.')) continue
        const childPath = `${dirPath}/${name}`
        const statResult = await api.stat(childPath)
        items.push({
          name,
          path: childPath,
          isDir: statResult.success && statResult.stat?.isDirectory === true,
          size: statResult.success ? statResult.stat?.size ?? 0 : 0,
        })
      }

      // 排序：目录在前，文件在后，字母序
      items.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      setEntries(items)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [dirPath])

  useEffect(() => {
    loadDir()
  }, [loadDir])

  if (loading && depth === 0) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        加载中...
      </div>
    )
  }

  return (
    <div>
      {/* 目录标题行（子目录可折叠） */}
      {depth > 0 && (
        <div
          className="flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer hover:bg-muted/50 text-xs"
          onClick={() => setExpanded(!expanded)}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{dirPath.split('/').pop()}</span>
        </div>
      )}

      {/* 展开时显示子内容 */}
      {(depth === 0 || expanded) && (
        <div>
          {loading && depth > 0 && (
            <div className="flex items-center gap-1 py-0.5 text-muted-foreground" style={{ paddingLeft: `${(depth + 1) * 16}px` }}>
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            </div>
          )}

          {entries.map(entry => (
            <div key={entry.path}>
              {entry.isDir ? (
                <FileTree
                  dirPath={entry.path}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                  depth={depth + 1}
                />
              ) : (
                <div
                  className={`flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer text-xs transition-colors ${
                    selectedPath === entry.path
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                  }`}
                  style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}
                  onClick={() => onSelect(entry)}
                >
                  {(() => {
                    const Icon = fileIcon(entry.name)
                    return <Icon className="h-3.5 w-3.5 shrink-0" />
                  })()}
                  <span className="truncate">{entry.name}</span>
                </div>
              )}
            </div>
          ))}

          {!loading && entries.length === 0 && (
            <p
              className="py-1 text-[11px] text-muted-foreground/50"
              style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}
            >
              空目录
            </p>
          )}
        </div>
      )}
    </div>
  )
}
