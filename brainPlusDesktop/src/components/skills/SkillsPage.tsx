import { useState, useEffect, useCallback } from 'react'
import { Plus, FolderSearch, Loader2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getInstalledSkills,
  installSkill,
  uninstallSkill,
  toggleSkill,
  validateInstallPath,
} from '@/lib/skillService'
import { toast } from '@/hooks/useToast'
import { SkillCard } from './SkillCard'
import { SkillDetailDialog } from './SkillDetailDialog'
import type { InstalledSkill } from '@/types/skill'

export function SkillsPage() {
  const [skills, setSkills] = useState<InstalledSkill[]>([])
  const [installPath, setInstallPath] = useState('')
  const [installing, setInstalling] = useState(false)
  const [detailSkill, setDetailSkill] = useState<InstalledSkill | null>(null)

  useEffect(() => {
    setSkills(getInstalledSkills())
  }, [])

  // 原生文件夹选择器
  const handleBrowse = useCallback(async () => {
    if (!window.electronAPI?.dialog) {
      toast({ title: '文件选择器不可用', description: '请在桌面应用中操作', variant: 'destructive' })
      return
    }
    const result = await window.electronAPI.dialog.openDirectory()
    if (result.success && result.path) {
      setInstallPath(result.path)
    }
  }, [])

  // 安装
  const handleInstall = useCallback(async () => {
    const path = installPath.trim()
    if (!path) return

    setInstalling(true)
    try {
      // 前置验证
      const validation = await validateInstallPath(path)
      if (validation.errors.length > 0) {
        toast({
          title: '安装验证失败',
          description: validation.errors.join('；'),
          variant: 'destructive',
        })
        return
      }

      const skill = await installSkill(path)
      setSkills(prev => [...prev, skill])
      setInstallPath('')
      toast({
        title: `「${skill.name}」安装成功`,
        description: `${skill.fileCount} 个文件已就绪`,
      })
    } catch (e: any) {
      toast({
        title: '安装失败',
        description: e.message || '未知错误',
        variant: 'destructive',
      })
    } finally {
      setInstalling(false)
    }
  }, [installPath])

  // 卸载
  const handleUninstall = useCallback(async (id: string) => {
    const skill = skills.find(s => s.id === id)
    if (!skill) return

    // 使用 toast 替代 confirm（全局 toast 函数不支持交互，用 confirm 作为 fallback）
    if (!confirm(`确定卸载「${skill.name}」？此操作将删除所有相关文件。`)) return

    try {
      await uninstallSkill(id)
      setSkills(prev => prev.filter(s => s.id !== id))
      toast({ title: `「${skill.name}」已卸载` })
    } catch (e: any) {
      toast({
        title: '卸载失败',
        description: e.message || '未知错误',
        variant: 'destructive',
      })
    }
  }, [skills])

  // 切换启用状态
  const handleToggle = useCallback(async (skill: InstalledSkill) => {
    const enabled = !skill.enabled
    try {
      await toggleSkill(skill.id, enabled)
      setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, enabled } : s))
      toast({
        title: enabled ? `「${skill.name}」已启用` : `「${skill.name}」已禁用`,
      })
    } catch (e: any) {
      toast({
        title: '操作失败',
        description: e.message || '未知错误',
        variant: 'destructive',
      })
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center gap-2 border-b border-border px-4">
        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
        <h2 className="text-sm font-semibold">Skills</h2>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleBrowse}>
          <FolderSearch className="mr-1 h-3.5 w-3.5" />浏览
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={handleInstall} disabled={installing || !installPath.trim()}>
          {installing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
          安装
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* 安装路径 */}
        <div className="mb-4 rounded-lg border border-border p-3">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">安装 Skill</h3>
          <div className="flex gap-2">
            <Input
              className="flex-1 h-7 font-mono text-xs"
              placeholder="选择包含 SKILL.md 的目录..."
              value={installPath}
              onChange={e => setInstallPath(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInstall()}
            />
          </div>
        </div>

        {/* 已安装列表 */}
        <h3 className="mb-3 text-xs font-medium text-muted-foreground">
          已安装 ({skills.length})
        </h3>

        {skills.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Package className="h-12 w-12 opacity-20" />
            <p className="text-sm">暂无已安装的 Skill</p>
            <p className="text-xs">点击上方「浏览」选择 Skill 目录进行安装</p>
          </div>
        ) : (
          <div className="space-y-3">
            {skills.map(skill => (
              <SkillCard
                key={skill.id}
                skill={skill}
                onToggle={handleToggle}
                onUninstall={handleUninstall}
                onDetail={setDetailSkill}
              />
            ))}
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      <SkillDetailDialog
        skill={detailSkill}
        open={detailSkill !== null}
        onOpenChange={(open) => { if (!open) setDetailSkill(null) }}
      />
    </div>
  )
}
