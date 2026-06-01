import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search, Plus, FolderPlus, Shuffle, Trash2, X,
  Lightbulb, Hash, FolderOpen, Image, Upload, Loader2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { MdEditor } from '@/components/editor/MdEditor'
import { isSupabaseConfigured } from '@/lib/supabase'
import { uploadToCloudinary, isCloudinaryConfigured } from '@/lib/config'
import {
  fetchFolders, createFolder, deleteFolder,
  fetchInspirations, searchInspirations,
  insertInspiration, updateInspiration, deleteInspiration,
} from '@/lib/inspirationService'
import type { Inspiration, InspirationFolder as FolderType } from '@/types/inspiration'

type Tab = 'discover' | 'archive'

export function InspirationPage() {
  const [tab, setTab] = useState<Tab>('discover')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [searchResults, setSearchResults] = useState<Inspiration[]>([])

  const [folders, setFolders] = useState<FolderType[]>([])
  const [inspirations, setInspirations] = useState<Inspiration[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [randomItems, setRandomItems] = useState<Inspiration[]>([])
  const [loading, setLoading] = useState(true)

  // 内联编辑状态
  const [editing, setEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editFolderId, setEditFolderId] = useState<string>('')
  const [editImages, setEditImages] = useState<string[]>([])
  const [editTags, setEditTags] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // 文件夹
  const [showAddFolder, setShowAddFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const hasConfig = isSupabaseConfigured()

  const loadData = useCallback(async () => {
    if (!hasConfig) { setLoading(false); return }
    setLoading(true)
    try {
      const [f, i] = await Promise.all([fetchFolders(), fetchInspirations()])
      setFolders(f)
      setInspirations(i)
      shuffleRandom(i)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [hasConfig])

  useEffect(() => { loadData() }, [loadData])

  const shuffleRandom = (items?: Inspiration[]) => {
    const pool = items || inspirations
    if (pool.length < 3) { setRandomItems([...pool]); return }
    setRandomItems([...pool].sort(() => 0.5 - Math.random()).slice(0, 3))
  }

  // ---- 打开内联编辑器 ----
  const startEdit = (item?: Inspiration) => {
    setEditId(item?.id || null)
    setEditTitle(item?.title || '')
    setEditContent(item?.description || '')
    setEditFolderId(item?.folder_id || '')
    setEditImages(item?.images || [])
    setEditTags((item?.tags || []).join(', '))
    setEditing(true)
    setIsSearchMode(false)
  }

  const startNew = () => {
    setEditId(null)
    setEditTitle('')
    setEditContent('')
    setEditFolderId(selectedFolderId || '')
    setEditImages([])
    setEditTags('')
    setEditing(true)
    setIsSearchMode(false)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditId(null)
    setSaveError('')
  }

  const handleSave = async () => {
    if (!editTitle.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      const tags = editTags.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
      const payload = {
        title: editTitle.trim(),
        description: editContent || null,
        folder_id: editFolderId || null,
        images: editImages,
        tags,
      }
      if (editId) {
        await updateInspiration(editId, payload)
      } else {
        await insertInspiration(payload)
      }
      cancelEdit()
      await loadData()
    } catch (e: any) {
      setSaveError(e.message || '保存失败')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条灵感？')) return
    try {
      await deleteInspiration(id)
      if (editId === id) cancelEdit()
      await loadData()
    } catch { /* ignore */ }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setIsSearchMode(true)
    cancelEdit()
    try {
      const results = await searchInspirations(searchQuery.trim())
      setSearchResults(results)
    } catch { setSearchResults([]) }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setIsSearchMode(false)
    setSearchResults([])
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try { await createFolder(newFolderName.trim()); setNewFolderName(''); setShowAddFolder(false); await loadData() } catch { /* ignore */ }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadToCloudinary(file)
      setEditImages((prev) => [...prev, url])
    } catch (err: any) {
      alert(err.message || '上传失败')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const removeImage = (index: number) => {
    setEditImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('确定删除该文件夹？')) return
    try { await deleteFolder(id); if (selectedFolderId === id) setSelectedFolderId(null); await loadData() } catch { /* ignore */ }
  }

  // ---- 数据 ----
  const filteredInspirations = useMemo(() => {
    if (selectedFolderId === null) return inspirations
    return inspirations.filter((i) => i.folder_id === selectedFolderId)
  }, [inspirations, selectedFolderId])

  const getFolderName = (id: string | null) => folders.find((f) => f.id === id)?.name || ''
  const getFolderCount = (id: string) => inspirations.filter((i) => i.folder_id === id).length
  const formatTime = (s: string) => s ? new Date(s).toLocaleString('zh-CN') : ''

  // ---- 卡片组件 ----
  const card = (item: Inspiration) => (
    <div
      key={item.id}
      className={`group cursor-pointer rounded-lg border p-3 transition-all ${
        editId === item.id
          ? 'border-primary bg-accent/50 shadow-sm'
          : 'border-border bg-card hover:border-primary/40 hover:shadow-sm'
      }`}
      onClick={() => startEdit(item)}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-sm truncate">{item.title}</h3>
          {item.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{item.description}</p>
          )}
        </div>
        <button
          className="ml-2 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); handleDelete(item.id) }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {item.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">{tag}</span>
        ))}
        {item.folder_id && (
          <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">{getFolderName(item.folder_id)}</span>
        )}
      </div>
      {item.images.length > 0 && (
        <div className="mt-2 flex gap-1">
          {item.images.slice(0, 3).map((img, i) => (
            <img key={i} src={img} className="h-10 w-10 rounded object-cover border" alt="" />
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[10px] text-muted-foreground">{formatTime(item.created_at)}</p>
    </div>
  )

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">加载中...</div>
  }

  // ====== 内联编辑面板 ======
  const editorPanel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{editId ? '编辑灵感' : '新建灵感'}</h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={cancelEdit}>取消</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !editTitle.trim()}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
      {saveError && (
        <div className="mx-4 mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{saveError}</div>
      )}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4">
          <div>
            <Label className="text-xs">标题 *</Label>
            <Input className="mt-1" placeholder="灵感标题" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus />
          </div>
          <div>
            <Label className="text-xs">内容 (Markdown)</Label>
            <MdEditor value={editContent} onChange={setEditContent} minHeight="280px" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs flex items-center gap-1"><FolderOpen className="h-3 w-3" /> 文件夹</Label>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={editFolderId} onChange={(e) => setEditFolderId(e.target.value)}
              >
                <option value="">未分类</option>
                {folders.map((f) => (<option key={f.id} value={f.id}>{f.name}</option>))}
              </select>
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Hash className="h-3 w-3" /> 标签</Label>
              <Input className="mt-1" placeholder="工作, 学习, 生活" value={editTags} onChange={(e) => setEditTags(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><Image className="h-3 w-3" /> 图片</Label>
            {editImages.length > 0 && (
              <div className="mt-1.5 mb-2 flex flex-wrap gap-2">
                {editImages.map((img, i) => (
                  <div key={i} className="relative h-16 w-16">
                    <img src={img} className="h-full w-full rounded-md object-cover border" alt="" />
                    <button
                      className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      onClick={() => removeImage(i)}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className={`mt-1 flex h-16 cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-border transition-colors hover:border-primary/50 ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
              {uploading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> 上传中...
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Upload className="h-4 w-4" /> 点击上传图片 ({editImages.length}/9)
                </div>
              )}
            </label>
          </div>
        </div>
      </div>
    </div>
  )

  // ====== 没有选中时右侧占位 ======
  const emptyPanel = (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Lightbulb className="h-12 w-12 opacity-20" />
      <p className="text-sm">选择一个灵感或新建</p>
      <Button variant="outline" size="sm" onClick={startNew}>新建灵感</Button>
    </div>
  )

  // ====== 左侧列表 ======
  const leftPanel = (
    <div className="flex h-full flex-col">
      {/* 顶栏 */}
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
            {([{ id: 'discover' as const, label: '发现' }, { id: 'archive' as const, label: '归档' }]).map((t) => (
              <button
                key={t.id}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${tab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => { setTab(t.id); clearSearch(); cancelEdit() }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={startNew}><Plus className="mr-1 h-3.5 w-3.5" />新建</Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-7 pl-7 pr-7 text-xs" placeholder="搜索灵感..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
          {searchQuery && (
            <button className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={clearSearch}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-auto">
        {isSearchMode ? (
          <div className="p-3">
            <p className="mb-2 text-xs text-muted-foreground">搜索 "{searchQuery}" ({searchResults.length})</p>
            {searchResults.length === 0 ? (
              <p className="py-12 text-center text-xs text-muted-foreground">未找到</p>
            ) : (
              <div className="space-y-1.5">{searchResults.map(card)}</div>
            )}
          </div>
        ) : tab === 'archive' ? (
          /* 归档 */
          <div>
            <div className="border-b border-border p-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">文件夹</span>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowAddFolder(!showAddFolder)}>
                  <FolderPlus className="h-3 w-3" />
                </Button>
              </div>
              {showAddFolder && (
                <div className="mt-1.5 flex gap-1">
                  <Input className="h-7 text-xs" placeholder="名称" value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} />
                  <Button size="sm" className="h-7 text-xs" onClick={handleCreateFolder}>确定</Button>
                </div>
              )}
              <div className="mt-2 space-y-0.5">
                <button
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-xs ${selectedFolderId === null ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}
                  onClick={() => setSelectedFolderId(null)}
                >
                  <FolderIcon /> 全部 <span className="ml-auto text-[10px] opacity-50">{inspirations.length}</span>
                </button>
                {folders.map((f) => (
                  <div key={f.id} className="group flex items-center">
                    <button
                      className={`flex flex-1 items-center gap-2 rounded px-2 py-1 text-xs ${selectedFolderId === f.id ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}
                      onClick={() => setSelectedFolderId(f.id)}
                    >
                      <FolderIcon /> <span className="truncate">{f.name}</span>
                      <span className="ml-auto text-[10px] opacity-50">{getFolderCount(f.id)}</span>
                    </button>
                    <button className="p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100" onClick={() => handleDeleteFolder(f.id)}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-2">
              {filteredInspirations.length === 0 ? (
                <p className="py-12 text-center text-xs text-muted-foreground">暂无灵感</p>
              ) : (
                <div className="space-y-1.5">{filteredInspirations.map(card)}</div>
              )}
            </div>
          </div>
        ) : (
          /* 发现 */
          <div className="p-3">
            {inspirations.length === 0 ? (
              <p className="py-12 text-center text-xs text-muted-foreground">还没有灵感</p>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">随机灵感</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => shuffleRandom()}>
                    <Shuffle className="mr-1 h-3 w-3" /> 换一换
                  </Button>
                </div>
                <div className="space-y-1.5">{randomItems.map(card)}</div>
                <div className="mt-4">
                  <span className="text-xs font-semibold text-muted-foreground">全部 ({inspirations.length})</span>
                  <div className="mt-1.5 space-y-1.5">{inspirations.map(card)}</div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      {/* 左侧：列表 */}
      <div className="flex w-80 shrink-0 flex-col border-r border-border bg-card/50">
        {leftPanel}
      </div>

      {/* 右侧：编辑器 */}
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        {editing ? editorPanel : emptyPanel}
      </div>
    </div>
  )
}

function FolderIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
    </svg>
  )
}
