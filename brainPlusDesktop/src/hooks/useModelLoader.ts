import { useState, useEffect, useCallback } from 'react'
import { getAIModels, type AIModelConfig } from '@/lib/config'

interface LocalModel {
  id: string
  name: string
  installed: boolean
}

export function useModelLoader() {
  const [configuredModels, setConfiguredModels] = useState<AIModelConfig[]>([])
  const [activeModel, setActiveModel] = useState<AIModelConfig | null>(null)
  const [localModels, setLocalModels] = useState<LocalModel[]>([])
  const [localModelId, setLocalModelId] = useState<string | null>(null)

  useEffect(() => {
    const all = getAIModels()
    const available = all.filter((m) => m.enabled && m.apiKey)
    setConfiguredModels(available)
    setActiveModel(available[0] || null)
  }, [])

  const refreshModels = useCallback(() => {
    const all = getAIModels()
    setConfiguredModels(all.filter(m => m.enabled && m.apiKey))
    if (window.electronAPI?.model) {
      window.electronAPI.model.getStatus().then(list => {
        setLocalModels(list.filter(m => m.installed && m.enabled).map(m => ({
          id: m.id, name: m.name, installed: true,
        })))
      }).catch(() => {})
    }
  }, [])

  return { configuredModels, activeModel, setActiveModel, localModels, localModelId, setLocalModelId, refreshModels }
}
