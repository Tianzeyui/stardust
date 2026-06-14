import { Download, Check, Loader2, Package, BookOpen, Lightbulb } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CommunityPlugin } from '@/lib/communityPluginService'

/** 已知图标映射 */
const iconMap: Record<string, LucideIcon> = {
  Package, BookOpen, Lightbulb,
}

function getIcon(name: string): LucideIcon {
  return iconMap[name] || Package
}

interface Props {
  plugin: CommunityPlugin
  installed: boolean
  installing: boolean
  progress: { current: number; total: number; file: string } | null
  onInstall: () => void
}

export function CommunityPluginCard({ plugin, installed, installing, progress, onInstall }: Props) {
  const IconComp = getIcon(plugin.icon)

  return (
    <div className={`rounded-lg border p-4 transition-colors ${installed ? 'border-muted bg-muted/20' : 'border-border hover:border-primary/30'}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <IconComp className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold truncate">{plugin.name}</h4>
            <span className="text-[10px] text-muted-foreground/50 shrink-0">v{plugin.version}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{plugin.description}</p>
          {plugin.permissions && plugin.permissions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {plugin.permissions.map(p => (
                <span key={p} className="inline-block rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground/60">
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {installing && progress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span className="truncate mr-2">{progress.file}</span>
            <span className="shrink-0">{progress.current}/{progress.total}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-3">
        {installed ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-green-500" />
            <span>已安装</span>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs w-full"
            onClick={onInstall}
            disabled={installing}
          >
            {installing ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                安装中...
              </>
            ) : (
              <>
                <Download className="mr-1 h-3 w-3" />
                安装
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
