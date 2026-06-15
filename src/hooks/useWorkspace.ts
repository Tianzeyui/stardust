/**
 * useWorkspace — 获取当前工作区路径
 * 支持用户自定义工作区根目录
 */
import { useState, useEffect, useCallback } from 'react'

interface WorkspacePaths {
  root: string
  output: string
  isCustom?: boolean
}

export function useWorkspace(): WorkspacePaths & { refresh: () => void; setRoot: (path: string) => Promise<boolean>; pickAndSetRoot: () => Promise<boolean>; resetRoot: () => Promise<void> } {
  const [paths, setPaths] = useState<WorkspacePaths>({ root: '', output: '' })

  const resolve = useCallback(async () => {
    const api = window.electronAPI?.workspace
    if (!api) {
      setPaths({ root: '~/BrainPlus/workspace', output: '~/BrainPlus/workspace/output' })
      return
    }
    try {
      const info = await api.info()
      if (info) {
        setPaths({ root: info.root, output: info.output, isCustom: info.isCustom })
      }
    } catch {
      // fallback to getPaths
      const ws = await api.getPaths()
      setPaths({ root: ws.root, output: ws.output })
    }
  }, [])

  useEffect(() => { resolve() }, [resolve])

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
