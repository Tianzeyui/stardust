import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, Bot, User, ChevronDown, Check, X, Shield, ShieldCheck, Cable, File, FolderOpen, ExternalLink, Trash2, BookOpen, Package } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { chat, getChatModel, type ChatStreamEvent } from '@/lib/chatService'
import { getAIModels, type AIModelConfig } from '@/lib/config'
import type { ModelMessage } from 'ai'
import ReactMarkdown from 'react-markdown'

type ToolType = 'sandbox' | 'skill' | 'mcp'

interface ToolCallStatus {
  id: string
  name: string
  type: ToolType
  status: 'running' | 'done' | 'error'
  result?: string
}

function detectToolType(name: string): ToolType {
  if (name.startsWith('sandbox_')) return 'sandbox'
  if (name === 'read_skill') return 'skill'
  return 'mcp'
}

interface UIMessage {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  toolCalls?: ToolCallStatus[]
}

interface ConsoleLine {
  id: number
  time: string
  icon: string
  msg: string
  status: 'ok' | 'running' | 'error' | 'info'
}

export function ChatPage() {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeModel, setActiveModel] = useState<AIModelConfig | null>(null)
  const [configuredModels, setConfiguredModels] = useState<AIModelConfig[]>([])
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [outputFiles, setOutputFiles] = useState<Array<{ name: string; path: string; size: number }>>([])
  const [statusText, setStatusText] = useState('')
  const [consoleLog, setConsoleLog] = useState<ConsoleLine[]>([])
  const [showConsole, setShowConsole] = useState(true)
  const logId = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)

  const pushLog = (icon: string, msg: string, status: ConsoleLine['status'] = 'info') => {
    const id = ++logId.current
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setConsoleLog(prev => [...prev.slice(-50), { id, time, icon, msg, status }])
  }

  useEffect(() => {
    const all = getAIModels()
    const withKeys = all.filter((m) => m.apiKey)
    setConfiguredModels(withKeys)
    const enabled = all.find((m) => m.enabled && m.apiKey) || withKeys[0] || null
    setActiveModel(enabled)
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // 刷新输出文件列表
  const refreshOutputs = useCallback(async () => {
    if (window.electronAPI?.workspace) {
      try { setOutputFiles(await window.electronAPI.workspace.listOutputs()) } catch {}
    }
  }, [])

  useEffect(() => { refreshOutputs() }, [messages, refreshOutputs])

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading || !activeModel) return

    const userMsg: UIMessage = { role: 'user', content: input.trim() }
    const assistantMsg: UIMessage = { role: 'assistant', content: '', streaming: true, toolCalls: [] }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setLoading(true)

    try {
      const history: ModelMessage[] = [...messages, userMsg]
        .filter((m) => !m.streaming)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      let streamed = ''
      const toolCallMap = new Map<string, ToolCallStatus>()

      setConsoleLog([])
      pushLog('🚀', '开始处理', 'info')

      await chat(history, (event: ChatStreamEvent) => {
        if (event.type === 'text-delta') {
          streamed += event.text || ''
        } else if (event.type === 'tool-call') {
          const toolName = event.toolName || 'unknown'
          const toolType = detectToolType(toolName)
          pushLog(toolType === 'sandbox' ? '⚙️' : toolType === 'skill' ? '📖' : '🔌',
            toolName, 'running')
          const id = Math.random().toString(36).slice(2, 8)
          const tc: ToolCallStatus = { id, name: toolName, type: toolType, status: 'running' }
          toolCallMap.set(toolName || id, tc)
        } else if (event.type === 'tool-result') {
          const existing = Array.from(toolCallMap.values()).find(t => t.name === event.toolName)
          const outputStr = String(event.toolOutput ?? '')
          const ok = outputStr.length > 0 && !outputStr.includes('error') && !outputStr.includes('Error')
          pushLog(
            ok ? '✅' : '❌',
            (event.toolName || 'tool') + (ok ? ' 完成' : ' 失败'),
            ok ? 'ok' : 'error'
          )
          setStatusText(`工具完成: ${event.toolName}，继续...`)
          if (existing) {
            existing.status = 'done'
            existing.result = String(event.toolOutput ?? '').slice(0, 8000)
          }
        } else if (event.type === 'done') {
          pushLog('🏁', streamed ? `生成回复 (${streamed.length}字符)` : '无文本输出', streamed ? 'ok' : 'error')
          setStatusText(streamed ? '' : '⚠️ AI 未生成回复，请重试')
        }

        // 实时更新消息
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') {
            last.content = streamed
            last.streaming = event.type !== 'done'
            last.toolCalls = Array.from(toolCallMap.values())
          }
          return [...next]
        })
      })

      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          last.content = streamed
          last.streaming = false
          last.toolCalls = Array.from(toolCallMap.values())
        }
        return [...next]
      })
    } catch (e: any) {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          last.content = `❌ ${e.message}`
          last.streaming = false
        }
        return [...next]
      })
    } finally {
      setLoading(false)
      setTimeout(() => setStatusText(''), 3000)
    }
  }, [input, loading, activeModel, messages])

  const switchModel = (model: AIModelConfig) => {
    setActiveModel(model)
    setShowModelPicker(false)
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="relative">
          <button
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            onClick={() => setShowModelPicker(!showModelPicker)}
          >
            <Bot className="h-4 w-4 text-primary" />
            {activeModel ? activeModel.displayName : '未选择模型'}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {showModelPicker && (
            <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-card py-1 shadow-lg">
              {configuredModels.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">请先在设置中配置 API Key</p>
              ) : (
                configuredModels.map((m) => (
                  <button
                    key={m.id}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent ${activeModel?.id === m.id ? 'bg-accent font-medium' : ''}`}
                    onClick={() => switchModel(m)}
                  >
                    <span className={`h-2 w-2 rounded-full ${m.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                    {m.displayName}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <span className="text-xs font-mono text-muted-foreground">{activeModel?.selectedModel}</span>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Bot className="h-16 w-16 opacity-20" />
            <p className="text-lg font-medium">AI 助手</p>
            <p className="text-sm">
              {configuredModels.length === 0 ? '请先在设置中配置 AI 模型' : activeModel ? `当前模型: ${activeModel.displayName}` : '选择一个模型'}
            </p>
          </div>
        ) : (
          <div className="w-full px-4 py-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}

                <div className={`min-w-0 ${msg.role === 'user' ? 'max-w-[85%]' : 'max-w-full flex-1'}`}>
                  {/* 工具调用卡片 */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mb-3 space-y-1.5">
                      {msg.toolCalls.map((tc) => {
                        const style = {
                          sandbox: { running: 'border-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/30', done: 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20', iconColor: 'text-emerald-600', badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300', result: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10', icon: ShieldCheck, labelIcon: Shield, label: '沙箱' },
                          skill:   { running: 'border-purple-400 bg-purple-50/80 dark:bg-purple-950/30', done: 'border-purple-300 bg-purple-50/50 dark:bg-purple-950/20', iconColor: 'text-purple-600', badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300', result: 'border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/10', icon: Check, labelIcon: BookOpen, label: 'Skill' },
                          mcp:     { running: 'border-blue-400 bg-blue-50/80 dark:bg-blue-950/30', done: 'border-blue-300 bg-blue-50/50 dark:bg-blue-950/20', iconColor: 'text-blue-600', badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', result: 'border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/10', icon: Check, labelIcon: Cable, label: 'MCP' },
                        }[tc.type]
                        const isRunning = tc.status === 'running'
                        const isDone = tc.status === 'done'
                        return (
                        <div key={tc.id} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs transition-all ${isRunning ? style.running + ' animate-pulse' : isDone ? style.done : 'border-red-300 bg-red-50/50 dark:bg-red-950/20'}`}>
                          <div className="mt-0.5 shrink-0">
                            {isRunning ? <Loader2 className={`h-4 w-4 animate-spin ${style.iconColor}`} />
                            : isDone ? <style.icon className={`h-4 w-4 ${style.iconColor}`} />
                            : <X className="h-4 w-4 text-red-600" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${style.badge}`}>
                                <style.labelIcon className="h-3 w-3" />{style.label}
                              </span>
                              <span className="font-mono font-medium text-[11px] truncate">{tc.name}</span>
                              <span className={`ml-auto shrink-0 text-[10px] font-medium ${style.iconColor}`}>
                                {isRunning ? '执行中...' : isDone ? '完成' : '失败'}
                              </span>
                            </div>
                            {tc.result && (
                              <pre className={`mt-2 max-h-32 overflow-auto rounded border px-2.5 py-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all ${style.result}`}>{tc.result}</pre>
                            )}
                            {tc.type === 'sandbox' && isDone && (
                              <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-600/70 dark:text-emerald-400/50">
                                <ShieldCheck className="h-3 w-3" />
                                <span>BrainPlus 沙箱 · 安全隔离执行</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )})}
                    </div>
                  )}

                  {/* 消息内容 */}
                  {msg.role === 'user' ? (
                    <div className="rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-code:bg-muted prose-code:rounded prose-code:px-1">
                      <ReactMarkdown>{msg.content || (msg.streaming ? '...' : '')}</ReactMarkdown>
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* 输出文件栏 */}
      {outputFiles.length > 0 && (
        <div className="border-t border-border bg-muted/30 px-4 py-2">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1.5">
            <FolderOpen className="h-3 w-3" />
            <span>工作区输出</span>
            <span className="text-muted-foreground/50">~/BrainPlus/workspace/output/</span>
            <button
              className="ml-auto text-[10px] text-muted-foreground hover:text-destructive transition-colors"
              onClick={async () => { if (window.electronAPI?.workspace) { await window.electronAPI.workspace.clearOutputs(); refreshOutputs() } }}
              title="清空所有输出"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {outputFiles.slice(0, 8).map((f) => (
              <div key={f.name} className="group flex items-center rounded-md border border-border bg-card transition-colors hover:bg-accent hover:border-primary/40">
                <button
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
                  onClick={() => window.electronAPI?.workspace.openFile(f.path)}
                  title={`打开 ${f.name} (${(f.size / 1024).toFixed(1)} KB)`}
                >
                  <File className="h-3 w-3 text-primary" />
                  <span className="truncate max-w-[160px]">{f.name}</span>
                  <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                </button>
                <button
                  className="pr-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={async () => { if (window.electronAPI?.workspace) { await window.electronAPI.workspace.deleteFile(f.path); refreshOutputs() } }}
                  title="删除"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {outputFiles.length > 8 && (
              <span className="text-[10px] text-muted-foreground self-center">+{outputFiles.length - 8} more</span>
            )}
          </div>
        </div>
      )}

      {/* 终端日志 */}
      {consoleLog.length > 0 && (
        <div className="border-t border-border">
          <button
            className="flex w-full items-center gap-1.5 px-4 py-1.5 text-[10px] text-muted-foreground hover:bg-muted/50 transition-colors"
            onClick={() => setShowConsole(!showConsole)}
          >
            <span className="font-mono">{showConsole ? '▼' : '▶'}</span>
            <span>控制台 ({consoleLog.length})</span>
          </button>
          {showConsole && (
            <div className="max-h-40 overflow-auto border-t border-border bg-black/90 px-4 py-2 font-mono text-[11px] leading-relaxed">
              {consoleLog.map(line => (
                <div key={line.id} className={`flex gap-2 ${
                  line.status === 'error' ? 'text-red-400' :
                  line.status === 'ok' ? 'text-green-400' :
                  line.status === 'running' ? 'text-yellow-400' :
                  'text-gray-400'
                }`}>
                  <span className="shrink-0 text-gray-600 w-16">{line.time}</span>
                  <span className="shrink-0">{line.icon}</span>
                  <span className="truncate">{line.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 状态栏 */}
      {statusText && (
        <div className={`border-t border-border px-4 py-1.5 text-center text-xs ${
          statusText.includes('⚠️') ? 'bg-yellow-50 dark:bg-yellow-950/20 text-yellow-700' : 'bg-muted/30 text-muted-foreground'
        }`}>
          {statusText.includes('生成') ? <Loader2 className="inline h-3 w-3 animate-spin mr-1" /> : null}
          {statusText}
        </div>
      )}

      {/* 输入区 */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex w-full gap-2">
          <Input
            className="flex-1"
            placeholder={activeModel ? `向 ${activeModel.displayName} 提问...` : '请先配置模型'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            disabled={!activeModel}
          />
          <Button size="icon" onClick={handleSend} disabled={!input.trim() || loading || !activeModel}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
