import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, Star, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { isSupabaseConfigured } from '@/lib/supabase'
import { fetchFavorites, addFavorite, removeFavorite } from '@/lib/aiService'
import type { AIModel, AIModelFavorite } from '@/types/ai'
import aiModels from '@/data/aiModels.json'

const allModels = aiModels as AIModel[]

const iconBase = '/assets/modelsIcon/'

function iconSrc(icon: string) {
  if (!icon) return ''
  if (icon.startsWith('http')) return icon
  // 从路径中提取文件名，拼接我们的 base 路径
  const filename = icon.split('/').pop() || icon
  return iconBase + filename
}

export function AIPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [favorites, setFavorites] = useState<AIModelFavorite[]>([])
  const [loading, setLoading] = useState(true)

  const hasConfig = isSupabaseConfigured()

  const loadFavorites = useCallback(async () => {
    if (!hasConfig) { setLoading(false); return }
    setLoading(true)
    try {
      const data = await fetchFavorites()
      setFavorites(data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [hasConfig])

  useEffect(() => { loadFavorites() }, [loadFavorites])

  const favModelIds = useMemo(() => new Set(favorites.map((f) => f.model_id)), [favorites])

  const filteredFavorites = useMemo(() => {
    if (!searchQuery) return favorites
    const q = searchQuery.toLowerCase()
    return favorites.filter((f) => f.model_name.toLowerCase().includes(q))
  }, [favorites, searchQuery])

  const filteredAll = useMemo(() => {
    if (!searchQuery) return allModels
    const q = searchQuery.toLowerCase()
    return allModels.filter((m) => m.name.toLowerCase().includes(q))
  }, [searchQuery])

  const handleAddFavorite = async (model: AIModel) => {
    if (!hasConfig) return
    if (favModelIds.has(model.id)) return
    try {
      await addFavorite({
        model_id: model.id,
        model_name: model.name,
        model_url: model.url,
        model_icon: model.icon,
      })
      await loadFavorites()
    } catch { /* ignore */ }
  }

  const handleRemoveFavorite = async (fav: AIModelFavorite) => {
    if (!hasConfig) return
    try {
      await removeFavorite(fav.model_id)
      await loadFavorites()
    } catch { /* ignore */ }
  }

  const handleOpenModel = (url: string, icon?: string) => {
    if (url) window.electronAPI?.ai?.openModel(url, icon ? iconSrc(icon) : undefined)
  }

  return (
    <div className="flex h-full flex-col">
      {/* 统一顶栏 */}
      <div className="flex h-11 items-center gap-2 border-b border-border px-4">
        <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
        <h2 className="text-sm font-semibold">AI 工具箱</h2>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-7 pl-7 pr-2 text-xs w-48"
            placeholder="搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* 收藏区 */}
        <div className="border-b border-border px-4 py-4">
          <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            收藏 ({favorites.length})
          </h3>
          {filteredFavorites.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
              {filteredFavorites.map((fav) => (
                <button
                  key={fav.id}
                  className="group relative flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-2.5 text-center transition-all hover:border-primary/40 hover:shadow-sm"
                  onClick={() => handleOpenModel(fav.model_url, fav.model_icon)}
                  onContextMenu={(e) => { e.preventDefault(); handleRemoveFavorite(fav) }}
                  title={`右键取消收藏 | ${fav.model_name}`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted p-1">
                    <img src={iconSrc(fav.model_icon)} alt={fav.model_name} className="max-h-full max-w-full rounded object-contain" />
                  </div>
                  <span className="w-full truncate text-[11px] font-medium">{fav.model_name}</span>
                  <Star className="absolute right-1 top-1 h-3 w-3 fill-yellow-400 text-yellow-400" />
                </button>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {loading ? '加载中...' : '右键点击下方模型添加收藏'}
            </p>
          )}
        </div>

        {/* 全部模型 */}
        <div className="px-4 py-4">
          <button
            className="mb-3 flex w-full items-center justify-between"
            onClick={() => setShowAll(!showAll)}
          >
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              全部模型 ({allModels.length})
            </h3>
            {showAll ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>

          {showAll && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
              {filteredAll.map((model) => (
                <button
                  key={model.id}
                  className="group relative flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-2.5 text-center transition-all hover:border-primary/40 hover:shadow-sm"
                  onClick={() => handleOpenModel(model.url, model.icon)}
                  onContextMenu={(e) => { e.preventDefault(); handleAddFavorite(model) }}
                  title={`右键添加收藏 | ${model.name}`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted p-1">
                    <img src={iconSrc(model.icon)} alt={model.name} className="max-h-full max-w-full rounded object-contain" />
                  </div>
                  <span className="w-full truncate text-[11px] font-medium">{model.name}</span>
                  {favModelIds.has(model.id) && (
                    <Star className="absolute right-1 top-1 h-3 w-3 fill-yellow-400 text-yellow-400" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
