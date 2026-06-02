import { Check, X, Shield, ShieldCheck, Cable, BookOpen, MessageSquare, FileText, Image } from 'lucide-react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import type { UIMessage, ToolCallStatus, MessageAttachment } from '@/types/chat'

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
          <div>
            <MarkdownPreview
              source={msg.content || (msg.streaming ? '...' : '')}
              style={{ fontSize: 14, backgroundColor: 'transparent' }}
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
    <div className="flex gap-3">
      <div className="flex-1">
        <div
          className={`inline-flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
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
              <pre className="mt-1.5 max-h-32 overflow-auto rounded border border-border px-2 py-1 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all bg-muted/30 text-muted-foreground">
                {String(
                  typeof tc.input === 'object' && (tc.input as any).code
                    ? (tc.input as any).code
                    : JSON.stringify(tc.input)
                ).slice(0, 600)}
              </pre>
            )}
            {/* 工具结果 */}
            {tc.result && (
              <div className="mt-1.5 max-h-40 overflow-auto rounded border border-border">
                <MarkdownPreview
                  source={String(tc.result).slice(0, 2000)}
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
