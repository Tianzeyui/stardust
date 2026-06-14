import { useState, useEffect } from 'react'
import { Check, X, Shield, ShieldCheck, Cable, BookOpen, MessageSquare, FileText, Image, Zap, FolderOpen, Loader2, ChevronDown, IdCard, ExternalLink } from 'lucide-react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import type { UIMessage, ToolCallStatus, MessageAttachment, AgentToolCallEntry, AgentTimelineItem } from '@/types/chat'
import { useAuth } from '@/contexts/AuthContext'
import { listAgents, type Agent } from '@/lib/agentStore'

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
    return msg.parentAgent ? (
      <div className="ml-4 border-l-2 border-primary/20 pl-3 my-1">
        <ToolBubble tc={msg.toolCall} />
      </div>
    ) : <ToolBubble tc={msg.toolCall} />
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
        ) : msg.modelName?.startsWith('Agent:') ? (
          // Agent 子对话输出：独立视觉容器 + 实时流式
          <div className="rounded-lg border border-border bg-card overflow-x-hidden"
            onClick={e => {
              const t = e.target as HTMLElement
              if (t.tagName === 'A' && (t as HTMLAnchorElement).href) {
                e.preventDefault()
                ;(window as any).electronAPI?.shell?.openExternal((t as HTMLAnchorElement).href)
              }
            }}
          >
            <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5 bg-muted/30">
              <MessageSquare className="h-3 w-3 text-primary/50" />
              <span className="text-[11px] font-medium text-primary/70">{msg.modelName}</span>
              {msg.streaming && <span className="text-[10px] text-muted-foreground/50">输出中...</span>}
              <div className="flex-1" />
              <AgentCardButton agentName={msg.modelName?.replace('Agent: ', '') || ''} />
            </div>
            <div className="px-3 py-2">
              {msg.streaming && !msg.content && !msg.agentTimeline?.length && (
                <p className="text-sm text-muted-foreground/40 py-2 select-none">
                  <span className="animate-dots"><span>.</span><span>.</span><span>.</span></span>
                </p>
              )}
              {/* 时间线模式：文字和工具调用按顺序穿插 */}
              {msg.agentTimeline && msg.agentTimeline.length > 0 ? (
                <div className="space-y-2">
                  {msg.agentTimeline.map((item, i) =>
                    item.type === 'text' ? (
                      <MarkdownPreview key={i}
                        source={item.content}
                        style={{ fontSize: 14, backgroundColor: 'transparent', overflowWrap: 'break-word', wordBreak: 'break-word' }}
                      />
                    ) : (
                      <AgentToolCallItem key={i} tc={{ name: item.name, brief: item.brief, status: item.status, output: item.output }} />
                    )
                  )}
                </div>
              ) : (
                (!msg.streaming || msg.content) && (
                  <MarkdownPreview
                    source={msg.content || ''}
                    style={{ fontSize: 14, backgroundColor: 'transparent', overflowWrap: 'break-word', wordBreak: 'break-word' }}
                  />
                )
              )}
            </div>
            {msg.trace && !msg.streaming && (
              <p className="px-3 pb-1.5 text-[10px] text-muted-foreground/40 select-none">{msg.trace}</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-hidden"
            onClick={e => {
              const t = e.target as HTMLElement
              if (t.tagName === 'A' && (t as HTMLAnchorElement).href) {
                e.preventDefault()
                ;(window as any).electronAPI?.shell?.openExternal((t as HTMLAnchorElement).href)
              }
            }}
          >
            {msg.streaming && !msg.content && (
              <p className="text-sm text-muted-foreground/40 py-2 select-none">
                <span className="animate-dots"><span>.</span><span>.</span><span>.</span></span>
              </p>
            )}
            {(!msg.streaming || msg.content) && (
              <MarkdownPreview
                source={stripHtml(msg.content || '')}
                style={{ fontSize: 14, backgroundColor: 'transparent', overflowWrap: 'break-word', wordBreak: 'break-word' }}
              />
            )}
            {msg.trace && !msg.streaming && (
              <p className="mt-0.5 text-[10px] text-muted-foreground/40 select-none">{msg.trace}</p>
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

/** Agent 工具调用条目 */
function AgentToolCallItem({ tc }: { tc: AgentToolCallEntry }) {
  const [expanded, setExpanded] = useState(false)
  const isRunning = tc.status === 'running'
  const isOk = tc.status === 'ok'

  return (
    <div className={`rounded-md border text-xs overflow-hidden ${
      isRunning ? 'border-yellow-500/30 bg-yellow-500/5' :
      isOk ? 'border-border bg-card' :
      'border-destructive/30 bg-destructive/5'
    }`}>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        {isRunning ? (
          <Loader2 className="h-3 w-3 text-yellow-500 animate-spin shrink-0" />
        ) : isOk ? (
          <Check className="h-3 w-3 text-green-500 shrink-0" />
        ) : (
          <X className="h-3 w-3 text-destructive shrink-0" />
        )}
        <span className="font-medium truncate">{tc.name}</span>
        {tc.brief ? <span className="text-muted-foreground/50 truncate">({tc.brief})</span> : null}
        <span className={`ml-auto shrink-0 text-[10px] ${
          isRunning ? 'text-yellow-600' : isOk ? 'text-green-600' : 'text-destructive'
        }`}>
          {isRunning ? '执行中' : isOk ? '完成' : '失败'}
        </span>
        {tc.output && (
          <button
            className="ml-1 p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {expanded && tc.output && (
        <div className="border-t border-border/50">
          <pre className="max-h-32 overflow-auto custom-scrollbar px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground bg-muted/20">
            {tc.output}
          </pre>
        </div>
      )}
    </div>
  )
}

/** Agent 工卡按钮 + 弹窗 */
function AgentCardButton({ agentName }: { agentName: string }) {
  const { user } = useAuth()
  const [show, setShow] = useState(false)
  const [agent, setAgent] = useState<Agent | null>(null)

  useEffect(() => {
    if (show && user?.id) {
      listAgents(user.id).then(list => {
        setAgent(list.find(a => a.name === agentName) || null)
      }).catch(() => setAgent(null))
    }
  }, [show, user?.id, agentName])

  return (
    <div className="relative shrink-0">
      <button
        className="p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
        onClick={() => setShow(!show)}
        title="查看 Agent 详情"
      >
        <IdCard className="h-3.5 w-3.5" />
      </button>
      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-card shadow-lg">
            <div className="px-3 py-2.5 border-b border-border/50">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-primary/50 shrink-0" />
                <span className="text-xs font-semibold truncate">{agentName}</span>
              </div>
              {agent?.description && (
                <p className="text-[10px] text-muted-foreground/60 mt-1 leading-relaxed">{agent.description}</p>
              )}
            </div>
            {agent ? (
              <div className="px-3 py-2 space-y-2 text-xs">
                {agent.skills.length > 0 && (
                  <div>
                    <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">Skills</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {agent.skills.map(s => (
                        <span key={s.id} className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground/50">
                  <span>类型: {agent.type === 'local' ? '本地' : '远程'}</span>
                  <span>版本: {agent.version || '-'}</span>
                </div>
                {agent.url && (
                  <a href={agent.url} target="_blank" className="flex items-center gap-1 text-[10px] text-primary/60 hover:text-primary transition-colors"
                    onClick={e => {
                      e.preventDefault()
                      ;(window as any).electronAPI?.shell?.openExternal(agent.url)
                    }}>
                    <ExternalLink className="h-2.5 w-2.5" />{agent.url}
                  </a>
                )}
              </div>
            ) : (
              <p className="px-3 py-4 text-[10px] text-muted-foreground/40 text-center">无法加载 Agent 详情</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
