import { useState } from 'react'
import { Package } from 'lucide-react'
import type { InstalledSkill } from '@/types/skill'

interface SkillPickerProps {
  skills: InstalledSkill[]
  onToggle: (skill: InstalledSkill) => void
}

export function SkillPicker({ skills, onToggle }: SkillPickerProps) {
  const [show, setShow] = useState(false)
  const enabledCount = skills.filter(s => s.enabled).length

  return (
    <div className="relative shrink-0">
      <button
        className="flex items-center gap-1 rounded border border-border px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        onClick={() => setShow(!show)}
        title="Skills 开关"
      >
        <Package className="h-3 w-3" />
        <span>Skills{enabledCount > 0 ? ` ${enabledCount}` : ''}</span>
      </button>

      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)} />
          <div className="absolute left-0 bottom-full z-50 mb-1 w-64 rounded-lg border border-border bg-card shadow-lg">
            <div className="max-h-64 overflow-auto p-1">
              {skills.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                  暂无已安装的 Skill<br />
                  <span className="text-[10px]">去 Skills 页面安装</span>
                </p>
              ) : (
                skills.map(s => (
                  <div key={s.id}
                    className="flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => onToggle(s)}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="truncate block">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground/50 truncate block">{s.description}</span>
                    </div>
                    <span className={`relative inline-flex h-4 w-7 items-center rounded-full shrink-0 ml-2 transition-colors ${s.enabled ? 'bg-primary' : 'bg-muted'}`}>
                      <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${s.enabled ? 'translate-x-3' : 'translate-x-0.5'}`} />
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
