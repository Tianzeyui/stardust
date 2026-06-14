import { useState, useEffect, useCallback } from 'react'
import {
  Folder, File, FileText, FileCode, FileJson, FileImage, Loader2,
  Copy, Scissors, Trash2,
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
  onNavigate: (dirPath: string) => void
  onContextMenu?: (entry: FileEntry, x: number, y: number) => void
}

function fileIcon(name: string): typeof File {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'md': case 'txt': case 'log': return FileText
    case 'js': case 'ts': case 'jsx': case 'tsx': case 'py': case 'sh': return FileCode
    case 'json': case 'yaml': case 'yml': case 'toml': return FileJson
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'ico': return FileImage
    default: return File
  }
}

export function FileTree({ dirPath, selectedPath, onSelect, onNavigate, onContextMenu }: FileTreeProps) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)

  const loadDir = useCallback(async () => {
    setLoading(true)
    try {
      const api = window.electronAPI?.fs
      if (!api) return
      const listResult = await api.listDir(dirPath)
      if (!listResult.success || !listResult.files) { setEntries([]); return }

      const items: FileEntry[] = []
      for (const name of listResult.files) {
        if (name.startsWith('.')) continue
        const childPath = `${dirPath.replace(/[\\/]+$/, '')}/${name}`
        const statResult = await api.stat(childPath)
        items.push({
          name, path: childPath,
          isDir: statResult.success && statResult.stat?.isDirectory === true,
          size: statResult.success ? statResult.stat?.size ?? 0 : 0,
        })
      }
      items.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setEntries(items)
    } catch { setEntries([]) } finally { setLoading(false) }
  }, [dirPath])

  useEffect(() => { loadDir() }, [loadDir])

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> 加载中...
      </div>
    )
  }

  return (
    <div>
      {entries.map(entry => (
        <div key={entry.path}
          className={`flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer text-xs transition-colors ${
            selectedPath === entry.path
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => entry.isDir ? onNavigate(entry.path) : onSelect(entry)}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onContextMenu?.(entry, e.clientX, e.clientY)
          }}
        >
          {entry.isDir ? (
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (() => {
            const Icon = fileIcon(entry.name)
            return <Icon className="h-3.5 w-3.5 shrink-0" />
          })()}
          <span className="truncate">{entry.name}</span>
        </div>
      ))}
      {!loading && entries.length === 0 && (
        <p className="py-2 text-[11px] text-muted-foreground/50 text-center">空目录</p>
      )}
    </div>
  )
}
