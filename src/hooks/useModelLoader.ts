import { useState, useEffect, useCallback } from 'react'
import { getAIModels, type AIModelConfig } from '@/lib/config'

export function useModelLoader() {
  const [configuredModels, setConfiguredModels] = useState<AIModelConfig[]>([])
  const [activeModel, setActiveModel] = useState<AIModelConfig | null>(null)

  useEffect(() => {
    const all = getAIModels()
    const available = all.filter((m) => m.enabled && m.apiKey)
    setConfiguredModels(available)
    setActiveModel(available[0] || null)
  }, [])

  const refreshModels = useCallback(() => {
    const all = getAIModels()
    setConfiguredModels(all.filter(m => m.enabled && m.apiKey))
  }, [])

  return { configuredModels, activeModel, setActiveModel, refreshModels }
}
