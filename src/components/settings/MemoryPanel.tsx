import { useState, useEffect, useCallback } from 'react'
import { Trash2, Plus, ChevronRight, Edit3, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { MemoryEntry, MemoryIndex } from '@/lib/memory/types'
import { listMemories, readMemory, writeMemory, deleteMemory } from '@/lib/memory/service'

function MemoryItem({ item, onDelete, onEdit, onRead }: {
  item: MemoryIndex
  onDelete: (name: string) => void
  onEdit: (name: string, body: string, description: string) => void
  onRead: (name: string) => Promise<MemoryEntry | null>
}) {
  const [expanded, setExpanded] = useState(false)
  const [entry, setEntry] = useState<MemoryEntry | null>(null)
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const expand = async () => {
    if (!expanded) {
      const e = await onRead(item.name)
      setEntry(e)
      setEditBody(e?.body || '')
      setEditDesc(e?.description || '')
    }
    setExpanded(!expanded)
  }

  if (editing && entry) {
    return (
      <div className="space-y-1 py-0.5">
        <Input className="h-6 text-[10px]" placeholder="一行摘要"
          value={editDesc} onChange={e => setEditDesc(e.target.value)} />
        <textarea className="w-full h-20 text-[11px] rounded-md border border-border bg-transparent px-2 py-1 resize-none"
          value={editBody} onChange={e => setEditBody(e.target.value)} />
        <div className="flex items-center gap-2">
          <button className="text-green-500 hover:text-green-600" onClick={() => { onEdit(item.name, editBody, editDesc); setEditing(false) }}>
            <Check className="h-3.5 w-3.5" />
          </button>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => { setEditBody(entry.body); setEditDesc(entry.description); setEditing(false) }}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] py-0.5">
        <button className="flex items-center gap-0.5 min-w-0 flex-1 text-left" onClick={expand}>
          <ChevronRight className={`h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          <span className="font-medium truncate flex-1">{item.title}</span>
          <span className="text-muted-foreground/50 ml-1 hidden sm:inline">{item.hook}</span>
        </button>
        <div className="shrink-0 flex items-center gap-1.5 ml-1">
          <button className="text-muted-foreground/40 hover:text-foreground" onClick={() => { setEditing(true); expand() }} title="编辑">
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button className="text-muted-foreground/40 hover:text-destructive" onClick={() => onDelete(item.name)} title="删除">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {expanded && entry && (
        <div className="ml-4 pl-2 border-l border-border/50 text-[10px] text-muted-foreground py-1 space-y-1">
          <p className="whitespace-pre-wrap">{entry.body}</p>
          {entry.links.length > 0 && (
            <p className="text-[9px] text-muted-foreground/50">
              关联: {entry.links.map(l => `[[${l}]]`).join(', ')}
            </p>
          )}
          <p className="text-[9px] text-muted-foreground/40">
            类型: {entry.metadata.type} · {new Date(entry.updatedAt).toLocaleDateString('zh-CN')}
          </p>
        </div>
      )}
    </div>
  )
}

export function MemoryPanel() {
  const [items, setItems] = useState<MemoryIndex[]>([])
  const [newName, setNewName] = useState('')
  const [newBody, setNewBody] = useState('')
  const [expanded, setExpanded] = useState(true)

  const refresh = useCallback(async () => {
    setItems(await listMemories())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleAdd = async () => {
    if (!newName.trim() || !newBody.trim()) return
    const slug = newName.trim().toLowerCase().replace(/[^a-z0-9一-鿿_-]+/g, '-').replace(/^-+|-+$/g, '')
    if (!slug) return
    const desc = newBody.split('\n')[0]?.slice(0, 80) || slug
    await writeMemory(slug, desc, newBody.trim())
    setNewName(''); setNewBody('')
    refresh()
  }

  const handleEdit = async (name: string, body: string, description: string) => {
    await writeMemory(name, description, body)
    refresh()
  }

  const handleDelete = async (name: string) => {
    await deleteMemory(name)
    refresh()
  }

  return (
    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-2 text-xs font-semibold flex items-center gap-1 cursor-pointer" onClick={() => setExpanded(p => !p)}>
        <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        项目记忆 (.stardust/memory/)
        <span className="font-normal text-muted-foreground/50">{items.length} 条</span>
      </legend>
      {expanded && (
        <>
          {items.length === 0 ? (
            <p className="text-[10px] text-muted-foreground py-2">
              暂无记忆。AI 可在对话中通过 memory_write 工具自动创建，或手动添加。
            </p>
          ) : (
            <div className="space-y-0.5 max-h-60 overflow-auto">
              {items.map(m => (
                <MemoryItem key={m.name} item={m}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  onRead={readMemory}
                />
              ))}
            </div>
          )}
          <div className="space-y-1.5 mt-2">
            <Input className="h-6 text-[11px]" placeholder="slug (如 user-prefers-vim)"
              value={newName} onChange={e => setNewName(e.target.value)} />
            <textarea className="w-full h-16 text-[11px] rounded-md border border-border bg-transparent px-2 py-1 resize-none"
              placeholder="记忆内容。首行作标题。支持 [[wikilinks]]。"
              value={newBody} onChange={e => setNewBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleAdd() }} />
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={handleAdd} disabled={!newName.trim() || !newBody.trim()}>
              <Plus className="h-3 w-3 mr-1" />添加
            </Button>
          </div>
        </>
      )}
    </fieldset>
  )
}
