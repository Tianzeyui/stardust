import { useState, useEffect, useCallback } from 'react'
import { Trash2, RefreshCw, Plus, ChevronRight, Edit3, Check, X, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Memory } from '@/lib/memory/types'
import type { MemoryManager } from '@/lib/memory/manager'

interface Props {
  manager: MemoryManager | null
}

function MemoryItem({ memory, onDelete, onEdit, onWeight }: {
  memory: Memory
  onDelete: (id: string) => void
  onEdit: (id: string, content: string, importance: number) => void
  onWeight: (id: string, importance: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(memory.content)
  const [editWeight, setEditWeight] = useState(memory.importance)

  if (editing) {
    return (
      <div className="space-y-1 py-0.5">
        <Input className="h-6 text-[11px]" value={editText}
          onChange={e => setEditText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { onEdit(memory.id, editText, editWeight); setEditing(false) }
            if (e.key === 'Escape') { setEditText(memory.content); setEditWeight(memory.importance); setEditing(false) }
          }}
          autoFocus
        />
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">权重:</span>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setEditWeight(w => Math.max(0, w - 1))}><Minus className="h-3 w-3" /></button>
          <span className="text-[11px] font-mono w-4 text-center">{editWeight}</span>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setEditWeight(w => Math.min(10, w + 1))}>+</button>
          <button className="text-green-500 hover:text-green-600 ml-auto" onClick={() => { onEdit(memory.id, editText, editWeight); setEditing(false) }}><Check className="h-3.5 w-3.5" /></button>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => { setEditText(memory.content); setEditWeight(memory.importance); setEditing(false) }}><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] py-0.5">
        <button className="flex items-center gap-0.5 min-w-0 flex-1 text-left" onClick={() => setExpanded(!expanded)}>
          <ChevronRight className={`h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          <span className={`${expanded ? '' : 'truncate'} flex-1`}>{memory.content}</span>
        </button>
        <div className="shrink-0 flex items-center gap-1.5">
          <button className="text-muted-foreground/40 hover:text-foreground" onClick={() => { setEditText(memory.content); setEditWeight(memory.importance); setEditing(true) }} title="编辑">
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button className="text-muted-foreground/40 hover:text-destructive" onClick={() => onDelete(memory.id)} title="删除">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="ml-4 pl-2 border-l border-border/50 text-[10px] text-muted-foreground py-1 space-y-1">
          <p>{memory.content}</p>
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground/40">
            <span>{new Date(memory.createdAt).toLocaleDateString('zh-CN')}</span>
            <span>权重: {memory.importance}/10</span>
            <button className="text-muted-foreground/30 hover:text-foreground" onClick={() => onWeight(memory.id, Math.max(0, memory.importance - 1))} title="降低权重"><Minus className="h-2.5 w-2.5" /></button>
            <button className="text-muted-foreground/30 hover:text-foreground" onClick={() => onWeight(memory.id, Math.min(10, memory.importance + 1))} title="提高权重">+</button>
          </div>
        </div>
      )}
    </div>
  )
}

function MemorySection({ title, memories, limit, onDelete, onEdit, onWeight, onAdd, onClear, addPlaceholder }: {
  title: string; memories: Memory[]; limit: number
  onDelete: (id: string) => void
  onEdit: (id: string, content: string, importance: number) => void
  onWeight: (id: string, importance: number) => void
  onAdd: (content: string) => void
  onClear: () => void
  addPlaceholder: string
}) {
  const [expanded, setExpanded] = useState(true)
  const [newContent, setNewContent] = useState('')

  const handleAdd = () => {
    if (!newContent.trim()) return
    onAdd(newContent.trim())
    setNewContent('')
  }

  return (
    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-2 text-xs font-semibold flex items-center gap-1 cursor-pointer" onClick={() => setExpanded(p => !p)}>
        <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        {title}
        <span className="font-normal text-muted-foreground/50">{memories.length}/{limit}</span>
      </legend>
      {expanded && (
        <>
          {memories.length === 0 ? (
            <p className="text-[10px] text-muted-foreground py-2">暂无记忆</p>
          ) : (
            <div className="space-y-0.5 max-h-40 overflow-auto">
              {memories.map(m => (
                <MemoryItem key={m.id} memory={m} onDelete={onDelete} onEdit={onEdit} onWeight={onWeight} />
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 mt-2">
            <Input className="h-6 text-[11px] flex-1" placeholder={addPlaceholder}
              value={newContent} onChange={e => setNewContent(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }} />
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleAdd} disabled={!newContent.trim()}>
              <Plus className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={onClear}>清空</Button>
          </div>
        </>
      )}
    </fieldset>
  )
}

export function MemoryPanel({ manager }: Props) {
  const [longTerm, setLongTerm] = useState<Memory[]>([])

  const refresh = useCallback(async () => {
    if (!manager) return
    setLongTerm(await manager.getLongTermList())
  }, [manager])

  useEffect(() => { refresh() }, [refresh])

  if (!manager) {
    return <p className="text-xs text-muted-foreground py-4 text-center">登录 Supabase 后可用长期记忆</p>
  }

  return (
    <div className="space-y-3">
      <MemorySection
        title="长期记忆（云端）" memories={longTerm} limit={50}
        addPlaceholder="手动添加长期记忆..."
        onDelete={async id => { await manager.deleteLongTerm(id); refresh() }}
        onEdit={async (id, content, importance) => { await manager.editLongTerm(id, { content, importance }); refresh() }}
        onWeight={async (id, importance) => { await manager.editLongTerm(id, { importance }); refresh() }}
        onAdd={async content => { await manager.addManual(content); refresh() }}
        onClear={async () => { await manager?.clearLongTerm(); refresh() }}
      />
    </div>
  )
}
