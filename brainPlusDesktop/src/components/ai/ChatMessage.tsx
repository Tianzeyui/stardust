import { Check, X, Shield, ShieldCheck, Cable, BookOpen, MessageSquare, FileText, Image, Zap, FolderOpen } from 'lucide-react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import type { UIMessage, ToolCallStatus, MessageAttachment } from '@/types/chat'

/** 工具结果格式化：JSON 结果包进代码块，纯文本保持原样 */
function formatToolResult(result: string, type: string): string {
  const text = stripHtml(String(result).slice(0, 2000))
  // 沙箱代码已经格式化好了，直接返回
  if (type === 'sandbox') return text
  // 尝试解析为 JSON，成功则包进代码块，失败则原样返回
  try {
    JSON.parse(text)
    return '```json\n' + text + '\n```'
  } catch {
    return text
  }
}

/** 剥离 HTML 标签，避免 MarkdownPreview 将 <tag> 当作 React 组件渲染 */
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '')
}

interface ChatMessageProps {
  msg: UIMessage
}

/** 工具类型 → 图标和标签 */
const TOOL_STYLE: Record<string, {
  icon: typeof Check
  labelIcon: typeof Shield
  label: string
}> = {
  sandbox: { icon: ShieldCheck, labelIcon: Shield, label: '沙箱' },
  skill: { icon: Check, labelIcon: BookOpen, label: 'Skill' },
  mcp: { icon: Check, labelIcon: Cable, label: 'MCP' },
  agent: { icon: Check, labelIcon: MessageSquare, label: 'Agent' },
  gateway: { icon: Check, labelIcon: Zap, label: '网关' },
  workspace: { icon: Check, labelIcon: FolderOpen, label: '工作区' },
}

export function ChatMessage({ msg }: ChatMessageProps) {
  if (msg.role === 'tool' && msg.toolCall) {
    return <ToolBubble tc={msg.toolCall} />
  }

  return (
    <div className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
      <div className={`min-w-0 ${msg.role === 'user' ? 'max-w-[85%]' : 'max-w-full flex-1'}`}>
        {msg.role === 'user' ? (
          <div>
            <div className="rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground">
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1 justify-end">
                {msg.attachments.map((att, i) => (
                  <AttachmentChip key={i} att={att} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-hidden">
            <MarkdownPreview
              source={stripHtml(msg.content || (msg.streaming ? '...' : ''))}
              style={{ fontSize: 14, backgroundColor: 'transparent', overflowWrap: 'break-word', wordBreak: 'break-word' }}
            />
            {(msg.modelName || msg.trace) && !msg.streaming && (
              <p className="mt-0.5 text-[10px] text-muted-foreground/40 select-none">
                {[msg.modelName ? `by ${msg.modelName}` : '', msg.trace].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** 工具调用气泡 */
function ToolBubble({ tc }: { tc: ToolCallStatus }) {
  const style = TOOL_STYLE[tc.type] ?? TOOL_STYLE.mcp
  const isError = tc.status === 'error'

  return (
    <div className="flex gap-3 max-w-full">
      <div className="min-w-0 flex-1">
        <div
          className={`inline-flex items-start gap-2 rounded-lg border px-3 py-2 text-xs max-w-full overflow-hidden ${
            isError
              ? 'border-destructive/30 bg-destructive/5'
              : 'border-border bg-card'
          }`}
        >
          {isError ? (
            <X className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
          ) : (
            <style.icon className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <style.labelIcon className="h-3 w-3" />
                {style.label}
              </span>
              <span className="font-mono font-medium text-[11px]">{tc.name}</span>
              <span className={`text-[10px] ${isError ? 'text-destructive' : 'text-muted-foreground'}`}>
                {isError ? '失败' : tc.status === 'running' ? '执行中' : '完成'}
              </span>
            </div>
            {/* 沙箱入参 */}
            {tc.type === 'sandbox' && tc.input != null && (
              <pre className="mt-1.5 max-h-32 overflow-auto custom-scrollbar rounded border border-border px-2 py-1 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all bg-muted/30 text-muted-foreground">
                {String(
                  typeof tc.input === 'object' && (tc.input as any).code
                    ? (tc.input as any).code
                    : JSON.stringify(tc.input)
                ).slice(0, 600)}
              </pre>
            )}
            {/* 工具结果 */}
            {tc.result && (
              <div className="mt-1.5 max-h-40 overflow-auto custom-scrollbar rounded border border-border max-w-full">
                <MarkdownPreview
                  source={formatToolResult(tc.result, tc.type)}
                  style={{ fontSize: 12, padding: '4px 8px', backgroundColor: 'transparent' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 附件 chip */
function AttachmentChip({ att }: { att: MessageAttachment }) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${
        att.status === 'error'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-border bg-card text-muted-foreground'
      }`}
      title={att.error}
    >
      {att.type === 'image' ? (
        <Image className="h-3 w-3" />
      ) : (
        <FileText className="h-3 w-3" />
      )}
      <span className="max-w-[100px] truncate">{att.name}</span>
    </div>
  )
}
