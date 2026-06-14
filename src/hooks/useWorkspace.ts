/**
 * useWorkspace — 获取当前工作区路径
 * - 有项目 → 项目工作区
 * - 无项目 → 全局工作区 ~/BrainPlus/workspace/
 */
import { useState, useEffect, useCallback } from 'react'
import { projectStore } from '@/lib/projectStore'

interface WorkspacePaths {
  root: string
  output: string
}

export function useWorkspace(projectId?: string | null): WorkspacePaths & { refresh: () => void } {
  const [paths, setPaths] = useState<WorkspacePaths>({ root: '', output: '' })

  const resolve = useCallback(async () => {
    const api = window.electronAPI
    if (!api?.workspace) {
      setPaths({ root: '~/BrainPlus/workspace', output: '~/BrainPlus/workspace/output' })
      return
    }

    // 有项目 → 使用项目工作区
    if (projectId) {
      const p = projectStore.getById(projectId)
      if (p) {
        setPaths({ root: p.path, output: `${p.path}/output` })
        return
      }
    }

    // 无项目 → 全局工作区
    const ws = await api.workspace.getPaths()
    setPaths({ root: ws.root, output: ws.output })
  }, [projectId])

  useEffect(() => {
    resolve()
    return projectStore.onChange(() => resolve())
  }, [resolve])

  return { ...paths, refresh: resolve }
}
