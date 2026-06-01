import { Trash2, FolderOpen, Package, ExternalLink } from 'lucide-react'
import type { InstalledSkill } from '@/types/skill'

interface SkillCardProps {
  skill: InstalledSkill
  onToggle: (skill: InstalledSkill) => void
  onUninstall: (id: string) => void
  onDetail: (skill: InstalledSkill) => void
}

export function SkillCard({ skill, onToggle, onUninstall, onDetail }: SkillCardProps) {
  return (
    <div
      className={`rounded-lg border transition-colors ${
        skill.enabled
          ? 'border-green-500 bg-green-50/50 dark:bg-green-950/10'
          : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm font-medium">{skill.name}</span>
            <span className="text-[10px] text-muted-foreground">
              {skill.fileCount} 个文件
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {skill.description}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-2">
          <button
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              skill.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
            onClick={() => onToggle(skill)}
            title={skill.enabled ? '禁用' : '启用'}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                skill.enabled ? 'translate-x-4' : 'translate-x-1'
              }`}
            />
          </button>
          <button
            className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => onDetail(skill)}
            title="查看详情"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
          <button
            className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
            onClick={() => onUninstall(skill.id)}
            title="卸载"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 文件树 */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <FolderOpen className="h-3 w-3" />
          <span className="font-mono text-[11px] truncate">{skill.path}</span>
        </div>
        <pre className="text-[11px] text-muted-foreground bg-muted/30 rounded p-2 overflow-auto max-h-40 whitespace-pre font-mono leading-relaxed">
          {skill.fileTree}
        </pre>

        {/* 依赖标签 */}
        {(skill.deps.pip.length > 0 || skill.deps.npm.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {skill.deps.pip.map(pkg => (
              <span key={`pip-${pkg}`} className="inline-flex items-center rounded bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-300">
                pip: {pkg}
              </span>
            ))}
            {skill.deps.npm.map(pkg => (
              <span key={`npm-${pkg}`} className="inline-flex items-center rounded bg-yellow-100 dark:bg-yellow-900/30 px-1.5 py-0.5 text-[10px] text-yellow-700 dark:text-yellow-300">
                npm: {pkg}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
