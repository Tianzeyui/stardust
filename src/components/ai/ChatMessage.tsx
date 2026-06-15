import { useState, useEffect } from 'react'
import { Check, X, Shield, ShieldCheck, Cable, BookOpen, MessageSquare, FileText, Image, Zap, FolderOpen, Loader2, ChevronDown, IdCard, ExternalLink, Brain, Terminal } from 'lucide-react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import type { UIMessage, ToolCallStatus, MessageAttachment, AgentToolCallEntry, AgentTimelineItem, TerminalStatus } from '@/types/chat'
import { useAuth } from '@/contexts/AuthContext'
import { listAgents, type Agent } from '@/lib/agentStore'
import type { FileOpRequest } from '@/lib/fileOpManager'

/** 工具结果格式化：JSON 结果包进代码块，纯文本保持原样 */
function formatToolResult(result: string, type: string): string {
  const text = stripHtml(String(result))
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
  if (msg.terminal) {
    return (
      <TerminalBubble
        ts={msg.terminal}
        onConfirm={async (id) => {
          const { confirm } = await import('@/lib/terminalManager')
          confirm(id)
        }}
        onReject={async (id) => {
          const { reject } = await import('@/lib/terminalManager')
          reject(id)
        }}
      />
    )
  }

  if (msg.fileOp) {
    return (
      <FileOpBubble fo={msg.fileOp} />
    )
  }

  if (msg.role === 'tool' && msg.toolCall) {
    // run_terminal / workspace_write_file / workspace_delete_file 有独立气泡，不显示通用工具气泡
    if (['run_terminal', 'workspace_write_file', 'workspace_append_file', 'workspace_delete_file', 'workspace_create_dir'].includes(msg.toolCall.name)) return null
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
              <ThinkingBlock thinking={msg.thinking || ''} loading={msg.thinkingLoading} />
              {msg.streaming && !msg.content && !msg.agentTimeline?.length && !msg.thinking && (
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
            {/* 时间线模式：thinking + text 按实际发生顺序渲染 */}
            {msg.mainTimeline && msg.mainTimeline.length > 0 ? (
              <div className="space-y-1">
                {msg.mainTimeline.map((item, i) => {
                  const isLast = i === msg.mainTimeline!.length - 1
                  return item.type === 'thinking' ? (
                    <ThinkingBlock
                      key={i}
                      thinking={item.content}
                      loading={!!(msg.streaming && isLast)}
                    />
                  ) : (
                    <MarkdownPreview
                      key={i}
                      source={stripHtml(item.content)}
                      style={{ fontSize: 14, backgroundColor: 'transparent', overflowWrap: 'break-word', wordBreak: 'break-word' }}
                    />
                  )
                })}
              </div>
            ) : (
              /* 兼容旧消息：无时间线时用 thinking + content 字段 */
              <>
                <ThinkingBlock thinking={msg.thinking || ''} loading={msg.thinkingLoading} />
                {msg.streaming && !msg.content && !msg.thinking && (
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
              </>
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
  const [expanded, setExpanded] = useState(false)
  const [sandboxExpanded, setSandboxExpanded] = useState(false)
  const hasResult = !!tc.result && tc.result.length > 0

  // 工具完成时默认收起
  useEffect(() => {
    if (tc.status === 'done') setExpanded(false)
  }, [tc.status])

  return (
    <div className="flex gap-3 max-w-full">
      <div className={`min-w-0 ${expanded || tc.status === 'running' ? 'flex-1' : ''}`}>
        <div
          className={`rounded-lg border px-3 py-2 text-xs overflow-hidden ${
            isError
              ? 'border-destructive/30 bg-destructive/5'
              : 'border-border bg-card'
          } ${expanded || tc.status === 'running' ? 'w-full' : 'inline-block'}`}
        >
          {/* 头部：icon + 标签/名称/状态 */}
          <div className="flex items-start gap-2">
            {isError ? (
              <X className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            ) : (
              <style.icon className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
            )}
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <style.labelIcon className="h-3 w-3" />
                {style.label}
              </span>
              <span className="font-mono font-medium text-[11px]">{tc.name}</span>
              <span className={`text-[10px] ${isError ? 'text-destructive' : 'text-muted-foreground'}`}>
                {isError ? '失败' : tc.status === 'running' ? '执行中' : '完成'}
              </span>
            </div>
          </div>

          {/* 沙箱入参：默认收起 */}
          {tc.type === 'sandbox' && tc.input != null && (() => {
            const code = String(
              typeof tc.input === 'object' && (tc.input as any).code
                ? (tc.input as any).code
                : JSON.stringify(tc.input)
            )
            return (
              <>
                <button
                  className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  onClick={() => setSandboxExpanded(!sandboxExpanded)}
                >
                  <ChevronDown className={`h-3 w-3 transition-transform ${sandboxExpanded ? 'rotate-180' : ''}`} />
                  {sandboxExpanded ? '收起代码' : `展开代码（${code.length} 字符）`}
                </button>
                {sandboxExpanded && (
                  <pre className="mt-1 max-h-60 overflow-auto custom-scrollbar rounded border border-border px-2 py-1 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all bg-muted/30 text-muted-foreground">
                    {code}
                  </pre>
                )}
              </>
            )
          })()}

          {/* 工具结果：默认收起，点击展开 */}
          {hasResult && (
            <>
              <button
                className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                onClick={() => setExpanded(!expanded)}
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                {expanded ? '收起' : `展开结果（${(tc.result!.length / 1000).toFixed(1)}k 字符）`}
              </button>
              {expanded && (
                <div className="mt-1 max-h-60 overflow-auto custom-scrollbar rounded border border-border max-w-full">
                  <MarkdownPreview
                    source={formatToolResult(tc.result!, tc.type)}
                    style={{ fontSize: 12, padding: '4px 8px', backgroundColor: 'transparent' }}
                  />
                </div>
              )}
            </>
          )}
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

/** 思考过程区块：可折叠，默认展开（流式时）/ 默认折叠（完成后） */
function ThinkingBlock({ thinking, loading }: { thinking: string; loading?: boolean }) {
  const [expanded, setExpanded] = useState(loading ?? true)

  // 思考内容变化时自动展开（流式跟随），完成后默认折叠
  useEffect(() => {
    if (loading) {
      setExpanded(true)
    }
  }, [thinking, loading])

  if (!thinking) return null

  return (
    <div className="mb-2 rounded-md border border-border/50 bg-muted/30 overflow-hidden">
      <button
        className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Brain className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
        <span className="text-[11px] font-medium text-muted-foreground/60">思考过程</span>
        {loading && (
          <>
            <Loader2 className="h-3 w-3 text-muted-foreground/40 animate-spin shrink-0" />
            <span className="text-[10px] text-muted-foreground/40">思考中...</span>
          </>
        )}
        <div className="flex-1" />
        <ChevronDown className={`h-3 w-3 text-muted-foreground/30 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-border/30 px-3 py-2 max-h-64 overflow-auto custom-scrollbar">
          <MarkdownPreview
            source={thinking}
            style={{ fontSize: 12, backgroundColor: 'transparent', color: 'var(--muted-foreground)', opacity: loading ? 0.7 : 0.5 }}
          />
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

/** 文件操作气泡（确认/结果展示，样式参考终端） */
function FileOpBubble({ fo }: { fo: FileOpRequest }) {
  const icon = fo.status === 'done' ? <Check className="h-3.5 w-3.5 text-green-400 shrink-0" />
    : fo.status === 'error' ? <X className="h-3.5 w-3.5 text-red-400 shrink-0" />
    : fo.status === 'rejected' ? <X className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
    : <FileText className="h-3.5 w-3.5 text-yellow-400 animate-pulse shrink-0" />

  return (
    <div className="flex gap-3 max-w-full">
      <div className="min-w-0 flex-1">
        <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs overflow-hidden">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-zinc-200 font-mono text-[11px] truncate">
              {fo.type === 'write' ? '✎' : '✕'} {fo.path}
            </span>
            <span className="text-[10px] text-zinc-500 shrink-0">
              {fo.status === 'pending_confirm' ? '待确认'
                : fo.status === 'done' ? (fo.size != null ? `${fo.size} 字符` : '已删除')
                : fo.status === 'error' ? '失败'
                : '已拒绝'}
            </span>
          </div>

          {fo.status === 'pending_confirm' && (
            <div className="flex items-center gap-2 mt-2">
              <button className="flex items-center gap-1 rounded bg-green-700 px-2.5 py-1 text-[10px] text-green-100 hover:bg-green-600 transition-colors"
                onClick={async () => { const { confirmFileOp } = await import('@/lib/fileOpManager'); confirmFileOp(fo.id) }}>
                <Check className="h-3 w-3" />确认{fo.type === 'write' ? '写入' : '删除'}
              </button>
              <button className="flex items-center gap-1 rounded bg-zinc-700 px-2.5 py-1 text-[10px] text-zinc-300 hover:bg-zinc-600 transition-colors"
                onClick={async () => { const { rejectFileOp } = await import('@/lib/fileOpManager'); rejectFileOp(fo.id) }}>
                <X className="h-3 w-3" />拒绝
              </button>
            </div>
          )}

          {fo.status === 'error' && fo.error && (
            <div className="mt-1 text-[10px] text-red-400 font-mono">{fo.error}</div>
          )}
        </div>
      </div>
    </div>
  )
}

/** 终端命令气泡 */
export function TerminalBubble({ ts, onConfirm, onReject }: {
  ts: TerminalStatus
  onConfirm: (id: string) => void
  onReject: (id: string) => void
}) {
  const iconCls = ts.status === 'done' ? 'text-green-400'
    : ts.status === 'error' ? 'text-red-400'
    : ts.status === 'running' ? 'text-yellow-400 animate-pulse'
    : ts.status === 'cancelled' ? 'text-zinc-500'
    : 'text-zinc-400'

  return (
    <div className="flex gap-3 max-w-full">
      <div className="min-w-0 flex-1">
        <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs overflow-hidden">
          {/* 头部 */}
          <div className="flex items-center gap-2">
            <Terminal className={`h-3.5 w-3.5 shrink-0 ${iconCls}`} />
            <span className="text-zinc-200 font-mono text-[11px] font-medium truncate">
              <span className="text-green-400 select-none">$ </span>{ts.command}
            </span>
            {ts.async && <span className="text-[9px] rounded bg-yellow-500/20 text-yellow-500 px-1 py-px font-medium shrink-0">异步</span>}
            <span className="text-[10px] text-zinc-500 shrink-0">
              {ts.status === 'pending_confirm' ? '待确认'
                : ts.status === 'running' ? '执行中…'
                : ts.status === 'done' ? `完成 (exit ${ts.exitCode ?? 0})`
                : ts.status === 'error' ? '失败'
                : '已取消'}
            </span>
          </div>

          {/* 确认按钮 */}
          {ts.status === 'pending_confirm' && (
            <div className="flex items-center gap-2 mt-2">
              <button className="flex items-center gap-1 rounded bg-green-700 px-2.5 py-1 text-[10px] text-green-100 hover:bg-green-600 transition-colors"
                onClick={() => onConfirm(ts.id)}>
                <Check className="h-3 w-3" />确认执行
              </button>
              <button className="flex items-center gap-1 rounded bg-zinc-700 px-2.5 py-1 text-[10px] text-zinc-300 hover:bg-zinc-600 transition-colors"
                onClick={() => onReject(ts.id)}>
                <X className="h-3 w-3" />拒绝
              </button>
            </div>
          )}

          {/* 输出 */}
          {(ts.stdout || ts.stderr) && (
            <pre className="mt-2 max-h-40 overflow-auto custom-scrollbar rounded bg-zinc-950 px-2 py-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-zinc-300">
              {ts.stdout}{ts.stderr && `\n\x1b[31m${ts.stderr}\x1b[0m`}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
