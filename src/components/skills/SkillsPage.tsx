import { useState, useEffect, useCallback } from 'react'
import { Plus, FolderSearch, Loader2, BookOpen, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getInstalledSkills,
  installSkill,
  uninstallSkill,
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
  const [gitUrl, setGitUrl] = useState('')
  const [gitInstalling, setGitInstalling] = useState(false)

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

  // 从 GitHub URL 安装
  const handleGitInstall = useCallback(async () => {
    const url = gitUrl.trim()
    if (!url) return
    setGitInstalling(true)
    const api = (window as any).electronAPI?.skills
    let tempDir: string | undefined
    try {
      if (!api) throw new Error('仅 Electron 环境支持')
      // 1. clone 到临时目录
      const cloneResult = await api.cloneFromUrl(url)
      if (!cloneResult.success) throw new Error(cloneResult.error)
      tempDir = cloneResult.tempDir
      // 2. 验证并安装
      const validation = await validateInstallPath(cloneResult.localPath)
      if (validation.errors.length > 0) throw new Error(validation.errors.join('；'))
      const skill = await installSkill(cloneResult.localPath)
      setSkills(prev => [...prev, skill])
      setGitUrl('')
      toast({ title: `「${skill.name}」安装成功`, description: `来自 ${url}` })
    } catch (e: any) {
      toast({ title: 'GitHub 安装失败', description: e.message || '未知错误', variant: 'destructive' })
    } finally {
      // 3. 清理临时目录
      if (tempDir) api?.cleanupTemp(tempDir).catch(() => {})
      setGitInstalling(false)
    }
  }, [gitUrl])

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto p-4">
        {/* 页面标题 + 操作 */}
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className="text-sm font-semibold">Skills</h2>
        </div>

        {/* 本地安装 */}
        <div className="mb-3 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-medium text-muted-foreground flex-1">本地目录安装</h3>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleBrowse}>
              <FolderSearch className="mr-1 h-3.5 w-3.5" />浏览
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleInstall} disabled={installing || !installPath.trim()}>
              {installing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
              安装
            </Button>
          </div>
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

        {/* GitHub 安装 */}
        <div className="mb-4 rounded-lg border border-border p-3">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Globe className="h-3 w-3" />从 GitHub 安装
          </h3>
          <div className="flex gap-2">
            <Input
              className="flex-1 h-7 font-mono text-xs"
              placeholder="https://github.com/user/repo 或 .../tree/main/path"
              value={gitUrl}
              onChange={e => setGitUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGitInstall()}
            />
            <Button size="sm" className="h-7 text-xs shrink-0" onClick={handleGitInstall} disabled={gitInstalling || !gitUrl.trim()}>
              {gitInstalling ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
              安装
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/40 mt-1.5">
            需安装 Git。支持仓库根目录或子目录（/tree/branch/path）
          </p>
        </div>

        {/* 已安装列表 */}
        <h3 className="mb-3 text-xs font-medium text-muted-foreground">
          已安装 ({skills.length})
        </h3>

        {skills.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <BookOpen className="h-12 w-12 opacity-20" />
            <p className="text-sm">暂无已安装的 Skill</p>
            <p className="text-xs">点击上方「浏览」选择 Skill 目录进行安装</p>
          </div>
        ) : (
          <div className="space-y-3">
            {skills.map(skill => (
              <SkillCard
                key={skill.id}
                skill={skill}
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
