import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, Plus, Trash2, Pencil, Check, X, Bot, ExternalLink, FolderKanban, Wrench } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { isSupabaseConfigured } from '@/lib/supabase'
import { fetchCategories, createCategory, deleteCategory, updateCategory as updateCat,
  fetchItems, createItem, deleteItem, updateItem, } from '@/lib/aiService'
import type { AIModel, ToolboxCategory, ToolboxItem } from '@/types/ai'
import aiModels from '@/data/aiModels.json'

const defaultModels = aiModels as AIModel[]
const iconBase = '/assets/modelsIcon/'

function iconSrc(icon: string) {
  if (!icon) return ''
  if (icon.startsWith('http')) return icon
  const filename = icon.split('/').pop() || icon
  return iconBase + filename
}

export function AIPage() {
  const hasConfig = isSupabaseConfigured()
  const [searchQuery, setSearchQuery] = useState('')
  const [categories, setCategories] = useState<ToolboxCategory[]>([])
  const [items, setItems] = useState<ToolboxItem[]>([])
  const [selCatId, setSelCatId] = useState<string | null>(null)

  // 新建/编辑分类
  const [editingCat, setEditingCat] = useState<{ id?: string; name: string } | null>(null)

  // 新建/编辑工具
  const [showAddItem, setShowAddItem] = useState(false)
  const [editItem, setEditItem] = useState<Partial<ToolboxItem> & { id?: string }>({})

  const loadData = useCallback(async () => {
    if (!hasConfig) return
    try {
      const [cats, itms] = await Promise.all([fetchCategories(), fetchItems()])
      setCategories(cats)
      setItems(itms)
    } catch {}
  }, [hasConfig])

  useEffect(() => { loadData() }, [loadData])

  const q = searchQuery.toLowerCase()
  const filteredDefaults = useMemo(() =>
    q ? defaultModels.filter(m => m.name.toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q)) : defaultModels,
    [q])
  const filteredItems = useMemo(() => {
    let list = items
    if (selCatId) list = list.filter(i => i.category_id === selCatId)
    if (q) list = list.filter(i => i.name.toLowerCase().includes(q))
    return list
  }, [items, selCatId, q])

  const handleOpen = (url: string, icon?: string) => {
    if (url) window.electronAPI?.ai?.openModel(url, icon ? iconSrc(icon) : undefined)
  }

  // 分类操作
  const handleCreateCat = async () => {
    if (!editingCat?.name.trim()) return
    await createCategory(editingCat.name.trim())
    setEditingCat(null)
    loadData()
  }
  const handleDeleteCat = async (id: string) => {
    if (!confirm('删除分类？工具会保留但取消分类。')) return
    await deleteCategory(id)
    if (selCatId === id) setSelCatId(null)
    loadData()
  }

  // 工具操作
  const handleCreateItem = async () => {
    if (!editItem.name?.trim()) return
    await createItem({
      category_id: selCatId,
      name: editItem.name.trim(),
      url: editItem.url || '',
      icon: editItem.icon || '',
      description: editItem.description || '',
    })
    setShowAddItem(false)
    setEditItem({})
    loadData()
  }
  const handleDeleteItem = async (id: string) => {
    await deleteItem(id)
    loadData()
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏 */}
      <div className="flex h-11 items-center gap-2 border-b border-border px-4">
        <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
        <h2 className="text-sm font-semibold">工具箱</h2>
        <div className="flex-1" />
        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input className="h-7 pl-7 text-xs" placeholder="搜索..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* 左侧分类 */}
        <div className="w-48 shrink-0 border-r border-border overflow-auto p-2 space-y-0.5">
          <button
            className={`flex items-center gap-1.5 w-full rounded px-2 py-1 text-xs transition-colors ${!selCatId ? 'bg-accent' : 'hover:bg-muted/50 text-muted-foreground'}`}
            onClick={() => setSelCatId(null)}
          >
            <Wrench className="h-3 w-3" />全部
          </button>
          <button
            className={`flex items-center gap-1.5 w-full rounded px-2 py-1 text-xs transition-colors ${selCatId === '__default__' ? 'bg-accent' : 'hover:bg-muted/50 text-muted-foreground'}`}
            onClick={() => setSelCatId('__default__')}
          >
            <Bot className="h-3 w-3" />AI 模型 <span className="ml-auto text-[10px] opacity-50">{defaultModels.length}</span>
          </button>

          {categories.map(cat => (
            <div key={cat.id} className="group flex items-center">
              <button
                className={`flex items-center gap-1.5 flex-1 rounded px-2 py-1 text-xs transition-colors text-left truncate ${selCatId === cat.id ? 'bg-accent' : 'hover:bg-muted/50 text-muted-foreground'}`}
                onClick={() => setSelCatId(cat.id)}
              >
                <FolderKanban className="h-3 w-3 shrink-0" />
                <span className="truncate">{cat.name}</span>
              </button>
              <button className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => handleDeleteCat(cat.id)}>
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}

          {/* 新建/编辑分类 */}
          {editingCat ? (
            <div className="flex items-center gap-1 px-1">
              <Input className="h-6 text-xs flex-1" value={editingCat.name} onChange={e => setEditingCat({ name: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateCat(); if (e.key === 'Escape') setEditingCat(null) }}
                placeholder="分类名" autoFocus />
              <button className="p-0.5 text-green-500" onClick={handleCreateCat}><Check className="h-3 w-3" /></button>
              <button className="p-0.5 text-muted-foreground" onClick={() => setEditingCat(null)}><X className="h-3 w-3" /></button>
            </div>
          ) : (
            hasConfig && (
              <button className="flex items-center gap-1 w-full rounded px-2 py-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                onClick={() => setEditingCat({ name: '' })}>
                <Plus className="h-3 w-3" />新建分类
              </button>
            )
          )}
        </div>

        {/* 右侧工具列表（默认模型 + 用户自定义 统一网格） */}
        <div className="flex-1 overflow-auto p-4">
          <div>
            {selCatId && selCatId !== '__default__' && <h3 className="text-xs font-medium text-muted-foreground mb-2">{categories.find(c => c.id === selCatId)?.name || '工具'}</h3>}
            <div className="grid grid-cols-2 gap-2">
              {/* 默认 AI 模型 */}
              {(!selCatId || selCatId === '__default__') && filteredDefaults.map(m => (
                <button key={m.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-accent/50 transition-colors text-left"
                  onClick={() => handleOpen(m.url, m.icon)}
                >
                  {m.icon ? <img src={iconSrc(m.icon)} className="h-6 w-6 rounded object-contain shrink-0" /> : <Bot className="h-6 w-6 text-muted-foreground shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{m.name}</p>
                    {m.description && <p className="text-[10px] text-muted-foreground/50 truncate">{m.description}</p>}
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                </button>
              ))}

              {/* 用户自定义 */}
              {(!selCatId || selCatId !== '__default__') && filteredItems.map(item => (
                <div key={item.id} className="group flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-accent/50 transition-colors">
                  <button className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    onClick={() => item.url && handleOpen(item.url, item.icon)}
                  >
                    {item.icon ? <img src={iconSrc(item.icon)} className="h-6 w-6 rounded object-contain shrink-0" /> : <Wrench className="h-6 w-6 text-muted-foreground shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{item.name}</p>
                      {item.description && <p className="text-[10px] text-muted-foreground/50 truncate">{item.description}</p>}
                    </div>
                  </button>
                  <button className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => handleDeleteItem(item.id)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {/* 新建工具 */}
              {showAddItem ? (
                <div className="rounded-lg border border-primary/30 p-3 space-y-2 col-span-2">
                  <Input className="h-7 text-xs" placeholder="名称" value={editItem.name || ''} onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))} autoFocus />
                  <Input className="h-7 text-xs" placeholder="URL（可选）" value={editItem.url || ''} onChange={e => setEditItem(p => ({ ...p, url: e.target.value }))} />
                  <Input className="h-7 text-xs" placeholder="图标地址（可选）" value={editItem.icon || ''} onChange={e => setEditItem(p => ({ ...p, icon: e.target.value }))} />
                  <Input className="h-7 text-xs" placeholder="描述（可选）" value={editItem.description || ''} onChange={e => setEditItem(p => ({ ...p, description: e.target.value }))} />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 text-[10px]" onClick={handleCreateItem} disabled={!editItem.name?.trim()}>添加</Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => { setShowAddItem(false); setEditItem({}) }}>取消</Button>
                  </div>
                </div>
              ) : (
                hasConfig && (
                  <button className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground/50 hover:text-muted-foreground hover:border-muted-foreground/30 transition-colors"
                    onClick={() => { setShowAddItem(true); setEditItem({}) }}>
                    <Plus className="h-3.5 w-3.5" />添加工具
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
