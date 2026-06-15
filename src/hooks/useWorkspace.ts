/**
 * useWorkspace — 获取当前工作区路径
 * - 选中项目 → 使用项目目录作为工作区根
 * - 全局 → 使用 Electron workspace 配置（默认 ~/BrainPlus/workspace 或用户自定义）
 */
import { useState, useEffect, useCallback } from 'react'
import { projectStore } from '@/lib/projectStore'

interface WorkspacePaths {
  root: string
  output: string
  isCustom?: boolean
}

export function useWorkspace(projectId?: string | null): WorkspacePaths & { refresh: () => void; setRoot: (path: string) => Promise<boolean>; pickAndSetRoot: () => Promise<boolean>; resetRoot: () => Promise<void> } {
  const [paths, setPaths] = useState<WorkspacePaths>({ root: '', output: '' })

  const resolve = useCallback(async () => {
    const api = window.electronAPI?.workspace

    // 有项目 → 使用项目目录作为工作区根
    if (projectId) {
      const p = projectStore.getById(projectId)
      if (p?.path) {
        setPaths({ root: p.path, output: `${p.path}/output`, isCustom: true })
        return
      }
    }

    // 全局 → 使用 Electron workspace 配置
    if (api) {
      try {
        const info = await api.info()
        if (info) {
          setPaths({ root: info.root, output: info.output, isCustom: info.isCustom })
          return
        }
      } catch {}
      const ws = await api.getPaths()
      setPaths({ root: ws.root, output: ws.output })
    } else {
      setPaths({ root: '~/BrainPlus/workspace', output: '~/BrainPlus/workspace/output' })
    }
  }, [projectId])

  useEffect(() => {
    resolve()
    return projectStore.onChange(() => resolve())
  }, [resolve])

  const setRoot = useCallback(async (newRoot: string) => {
    const api = window.electronAPI?.workspace
    if (!api) return false
    const ok = await api.setRoot(newRoot)
    if (ok) await resolve()
    return ok
  }, [resolve])

  const pickAndSetRoot = useCallback(async () => {
    const api = window.electronAPI?.workspace
    if (!api) return false
    const dir = await api.pickRoot()
    if (!dir) return false
    const ok = await api.setRoot(dir)
    if (ok) await resolve()
    return ok
  }, [resolve])

  const resetRoot = useCallback(async () => {
    const api = window.electronAPI?.workspace
    if (!api) return
    await api.resetRoot()
    await resolve()
  }, [resolve])

  return { ...paths, refresh: resolve, setRoot, pickAndSetRoot, resetRoot }
}
