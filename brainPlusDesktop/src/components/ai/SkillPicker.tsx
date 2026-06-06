import { useState, useEffect, useCallback } from 'react'
import { Package } from 'lucide-react'
import { getInstalledSkills } from '@/lib/skillService'
import type { InstalledSkill } from '@/types/skill'

interface SkillPickerProps {
  projectSkillIds?: string[]
}

export function SkillPicker({ projectSkillIds }: SkillPickerProps) {
  const [show, setShow] = useState(false)
  const [skills, setSkills] = useState<InstalledSkill[]>([])

  const load = useCallback(() => {
    setSkills(getInstalledSkills())
  }, [])

  useEffect(() => { if (show) load() }, [show, load])
  // 打开聊天时自动加载
  useEffect(() => { load() }, [load])

  const displaySkills = projectSkillIds ? skills.filter(s => projectSkillIds.includes(s.id)) : skills

  return (
    <div className="relative shrink-0">
      <button
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground transition-colors"
        onClick={() => setShow(!show)}
        title="Skills"
      >
        <Package className="h-3 w-3" />
        <span>Skills{displaySkills.length > 0 ? ` ${displaySkills.length}` : ''}</span>
      </button>

      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)} />
          <div className="absolute left-0 bottom-full z-50 mb-1 w-64 rounded-lg border border-border bg-card shadow-lg">
            <div className="max-h-64 overflow-auto p-1">
              {displaySkills.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                  {projectSkillIds ? '项目未配置 Skill' : '暂无已安装的 Skill'}<br />
                  <span className="text-[10px]">去项目设置中配置</span>
                </p>
              ) : (
                displaySkills.map(s => (
                  <div key={s.id} className="px-2 py-1.5 rounded text-xs">
                    <span className="truncate block">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground/50 line-clamp-2">{s.description}</span>
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
