import { File, FolderOpen, ExternalLink, Trash2, X } from 'lucide-react'

interface OutputFilesProps {
  files: Array<{ name: string; path: string; size: number }>
  onRefresh: () => void
}

export function OutputFiles({ files, onRefresh }: OutputFilesProps) {
  if (files.length === 0) return null

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-2">
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1.5">
        <FolderOpen className="h-3 w-3" />
        <span>工作区输出</span>
        <span className="text-muted-foreground/50">~/BrainPlus/workspace/output/</span>
        <button
          className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={async () => {
            if (window.electronAPI?.workspace) {
              await window.electronAPI.workspace.clearOutputs()
              onRefresh()
            }
          }}
          title="清空所有输出"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {files.slice(0, 8).map((f) => (
          <div key={f.name} className="group flex items-center rounded-md border border-border bg-card transition-colors hover:bg-accent hover:border-primary/40">
            <button
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
              onClick={() => window.electronAPI?.workspace.openFile(f.path)}
              title={`打开 ${f.name} (${(f.size / 1024).toFixed(1)} KB)`}
            >
              <File className="h-3 w-3 text-muted-foreground" />
              <span className="truncate max-w-[160px]">{f.name}</span>
              <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
            </button>
            <button
              className="pr-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
              onClick={async () => {
                if (window.electronAPI?.workspace) {
                  await window.electronAPI.workspace.deleteFile(f.path)
                  onRefresh()
                }
              }}
              title="删除"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
