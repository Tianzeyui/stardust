import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { FileText, X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MdEditor } from '@/components/editor/MdEditor'
import type { DiaryEntry } from '@/types/diary'

interface DiaryContentProps {
  entry: DiaryEntry | null
  editing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (content: string, title?: string, tags?: string[]) => Promise<void>
}

export function DiaryContent({
  entry,
  editing,
  onStartEdit,
  onCancelEdit,
  onSave,
}: DiaryContentProps) {
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)

  // 进入编辑模式时，用现有内容初始化
  useEffect(() => {
    if (editing) {
      setEditTitle(entry?.title ?? '')
      setEditContent(entry?.content ?? '')
      setEditTags(entry?.tags ?? [])
      setTagInput('')
    }
  }, [editing, entry])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(editContent, editTitle || undefined, editTags)
    } finally {
      setSaving(false)
    }
  }

  const addTag = () => {
    const tag = tagInput.trim().replace(/^#/, '')
    if (tag && !editTags.includes(tag)) {
      setEditTags((prev) => [...prev, tag])
    }
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    setEditTags((prev) => prev.filter((t) => t !== tag))
  }

  // ===== 编辑模式 =====
  if (editing) {
    return (
      <div className="flex w-full flex-col gap-4">
        {/* 标题 */}
        <Input
          className="text-xl font-bold border-0 border-b rounded-none px-0 focus-visible:ring-0"
          placeholder="标题（可选）"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
        />

        {/* MD 编辑器 */}
        <MdEditor
          value={editContent}
          onChange={setEditContent}
          minHeight="400px"
        />

        {/* 标签 */}
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            {editTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
              >
                #{tag}
                <button
                  className="ml-0.5 rounded-full hover:bg-secondary-foreground/20"
                  onClick={() => removeTag(tag)}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <Input
              className="h-9 w-40 text-xs"
              placeholder="添加标签..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
              }}
            />
            <Button size="icon" className="h-9 w-9 shrink-0" variant="outline" onClick={addTag} type="button">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? '保存中...' : '保存'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancelEdit}>
            取消
          </Button>
        </div>
      </div>
    )
  }

  // ===== 预览模式 =====
  if (!entry) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <FileText className="h-12 w-12 opacity-30" />
        <p className="text-sm">选择左侧日期或新建一篇日记</p>
        <Button variant="outline" size="sm" onClick={onStartEdit}>
          写一篇
        </Button>
      </div>
    )
  }

  return (
    <div className="w-full">
      {entry.title && (
        <h1 className="mb-2 text-2xl font-bold tracking-tight">{entry.title}</h1>
      )}

      {entry.tags && entry.tags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="prose prose-slate max-w-none dark:prose-invert
        prose-headings:font-semibold
        prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4
        prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
        prose-p:leading-7 prose-p:my-3
        prose-li:my-1
        prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-muted prose-pre:border prose-pre:border-border
        prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-img:rounded-lg
        prose-hr:border-border
      ">
        <ReactMarkdown>{entry.content}</ReactMarkdown>
      </div>
    </div>
  )
}
