import { useState, useRef, useEffect } from 'react'
import { Plus, MessageSquare, Trash2, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'

export interface ConvInfo {
  id: string
  title: string
  messageCount: number
  updatedAt: string
}

interface ConversationBarProps {
  convId: string | null
  convTitle: string
  conversations: ConvInfo[]
  onNew: () => void
  onSwitch: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}

export function ConversationBar({
  convId, convTitle, conversations,
  onNew, onSwitch, onDelete, onRename,
}: ConversationBarProps) {
  const [showList, setShowList] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setEditTitle(convTitle)
      setTimeout(() => inputRef.current?.select(), 50)
    }
  }, [editing, convTitle])

  const saveTitle = () => {
    const t = editTitle.trim()
    if (t && t !== convTitle && convId) onRename(convId, t)
    setEditing(false)
  }

  return (
    <div className="relative border-b border-border">
      <div className="flex h-11 items-center gap-2 px-4">
        <button
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowList(!showList)}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          {editing ? (
            <Input
              ref={inputRef}
              className="h-6 w-48 text-xs"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditing(false) }}
              onBlur={saveTitle}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              className="max-w-[300px] truncate cursor-pointer hover:underline decoration-dotted underline-offset-2"
              onClick={(e) => { e.stopPropagation(); if (convId) setEditing(true) }}
              title="点击重命名"
            >
              {convTitle}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
        </button>
        <div className="flex-1" />
        <button
          className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          onClick={onNew} title="新对话"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {showList && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowList(false)} />
          <div className="absolute left-4 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-card shadow-lg">
            <div className="max-h-64 overflow-auto p-1">
              {conversations.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">暂无对话</p>
              ) : (
                conversations.map(c => (
                  <div key={c.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${c.id === convId ? 'bg-accent' : 'hover:bg-muted/50'}`}
                  >
                    <button
                      className="flex-1 text-left truncate"
                      onClick={() => { onSwitch(c.id); setShowList(false) }}
                    >
                      <span className={c.id === convId ? 'font-medium' : ''}>{c.title}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground/50">{c.messageCount}条</span>
                    </button>
                    <button
                      className="shrink-0 p-0.5 text-muted-foreground/40 hover:text-foreground transition-colors"
                      onClick={(e) => { e.stopPropagation(); onDelete(c.id) }}
                      title="删除对话"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
