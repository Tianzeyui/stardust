import { useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Eye,
  Pencil,
  Columns2,
  Bold,
  Italic,
  Heading,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Code2,
  Link,
  Image,
  Minus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type EditorMode = 'edit' | 'preview' | 'split'

export interface MdEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  defaultMode?: EditorMode
  minHeight?: string
}

interface Tool {
  icon: typeof Bold
  label: string
  syntax: string
  wrap?: [string, string]
}

const TOOLS: Tool[] = [
  { icon: Bold, label: '加粗', syntax: '**粗体**', wrap: ['**', '**'] },
  { icon: Italic, label: '斜体', syntax: '*斜体*', wrap: ['*', '*'] },
  { icon: Strikethrough, label: '删除线', syntax: '~~删除线~~', wrap: ['~~', '~~'] },
  { icon: Heading, label: '标题', syntax: '## 标题', wrap: ['\n## ', ''] },
  { icon: Quote, label: '引用', syntax: '> 引用', wrap: ['\n> ', ''] },
  { icon: List, label: '无序列表', syntax: '- 列表项', wrap: ['\n- ', ''] },
  { icon: ListOrdered, label: '有序列表', syntax: '1. 列表项', wrap: ['\n1. ', ''] },
  { icon: Code, label: '行内代码', syntax: '`代码`', wrap: ['`', '`'] },
  { icon: Code2, label: '代码块', syntax: '\n```\n代码块\n```\n', wrap: ['\n```\n', '\n```\n'] },
  { icon: Link, label: '链接', syntax: '[文本](url)', wrap: ['[', '](url)'] },
  { icon: Image, label: '图片', syntax: '![alt](url)', wrap: ['![', '](url)'] },
  { icon: Minus, label: '分割线', syntax: '\n---\n' },
]

const MODES: { mode: EditorMode; label: string; icon: typeof Pencil }[] = [
  { mode: 'edit', label: '编辑', icon: Pencil },
  { mode: 'preview', label: '预览', icon: Eye },
  { mode: 'split', label: '分屏', icon: Columns2 },
]

const proseClasses =
  'prose prose-slate max-w-none dark:prose-invert ' +
  'prose-headings:font-semibold ' +
  'prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 ' +
  'prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3 ' +
  'prose-p:leading-7 prose-p:my-3 ' +
  'prose-li:my-1 ' +
  'prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none ' +
  'prose-pre:bg-muted prose-pre:border prose-pre:border-border ' +
  'prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground ' +
  'prose-a:text-primary prose-a:no-underline hover:prose-a:underline ' +
  'prose-img:rounded-lg ' +
  'prose-hr:border-border'

function Preview({ value, minHeight }: { value: string; minHeight: string }) {
  return (
    <div className={proseClasses} style={{ minHeight }}>
      {value.trim() ? (
        <ReactMarkdown>{value}</ReactMarkdown>
      ) : (
        <p className="text-muted-foreground italic">暂无内容</p>
      )}
    </div>
  )
}

/**
 * 可复用的 Markdown 编辑器
 * 支持三种视图：编辑 / 分屏 / 预览
 */
export function MdEditor({
  value,
  onChange,
  placeholder = '开始写 Markdown...',
  className,
  defaultMode = 'edit',
  minHeight = '300px',
}: MdEditorProps) {
  const [mode, setMode] = useState<EditorMode>(defaultMode)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertMarkdown = useCallback(
    (tool: Tool) => {
      const ta = textareaRef.current
      if (!ta) return

      const start = ta.selectionStart
      const end = ta.selectionEnd
      const hasSelection = start !== end

      let newValue: string
      let cursorPos: number

      if (hasSelection && tool.wrap) {
        const selected = value.slice(start, end)
        const [prefix, suffix] = tool.wrap
        newValue = value.slice(0, start) + prefix + selected + suffix + value.slice(end)
        cursorPos = start + prefix.length + selected.length + suffix.length
      } else {
        const syntax = tool.syntax
        newValue = value.slice(0, start) + syntax + value.slice(end)
        cursorPos = tool.wrap ? start + tool.wrap[0].length : start + syntax.length
      }

      onChange(newValue)

      requestAnimationFrame(() => {
        ta.focus()
        ta.setSelectionRange(cursorPos, cursorPos)
      })
    },
    [value, onChange],
  )

  const showToolbar = mode !== 'preview'

  const textarea = (
    <textarea
      ref={textareaRef}
      className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      style={{ minHeight }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
    />
  )

  return (
    <div className={cn('flex flex-col', className)}>
      {/* 顶栏：模式切换 + 工具栏 */}
      <div className="flex items-center gap-1 border-b border-border pb-1.5 mb-2 flex-wrap">
        {MODES.map(({ mode: m, label, icon: Icon }) => (
          <button
            key={m}
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              mode === m
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setMode(m)}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}

        {/* 分隔 */}
        {showToolbar && <span className="mx-1 h-5 w-px bg-border" />}

        {/* 工具栏（编辑/分屏模式可见） */}
        {showToolbar &&
          TOOLS.map((tool) => (
            <button
              key={tool.label}
              type="button"
              className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={() => insertMarkdown(tool)}
              title={tool.label}
            >
              <tool.icon className="h-4 w-4" />
            </button>
          ))}
      </div>

      {/* 内容区 */}
      {mode === 'edit' && textarea}

      {mode === 'preview' && <Preview value={value} minHeight={minHeight} />}

      {mode === 'split' && (
        <div className="flex gap-4" style={{ minHeight }}>
          <div className="flex-1 flex flex-col min-w-0">
            {textarea}
          </div>
          <div className="flex-1 overflow-auto min-w-0 rounded-md border border-border bg-card p-4">
            <Preview value={value} minHeight={minHeight} />
          </div>
        </div>
      )}
    </div>
  )
}
