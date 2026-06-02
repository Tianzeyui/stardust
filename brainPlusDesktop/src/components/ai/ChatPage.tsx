import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, Loader2, Bot, File, FolderOpen,
  ExternalLink, Trash2, X, ListTodo, Circle, CheckCircle2,
  Paperclip, FileText, Image,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { chat, setAgentUIHandler, type ChatStreamEvent, type AskUserEvent } from '@/lib/chatService'
import { getAIModels, type AIModelConfig } from '@/lib/config'
import type { ModelMessage } from 'ai'
import { useKonamiCode } from '@/hooks/useKonamiCode'
import { ChatMessage } from './ChatMessage'
import { AskUserBar } from './AskUserBar'
import { ChatConsole } from './ChatConsole'
import {
  type ToolCallStatus,
  type UIMessage,
  type ConsoleLine,
  detectToolType,
} from '@/types/chat'

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
  const [showConsole, setShowConsole] = useState(false)
  const [askUser, setAskUser] = useState<AskUserEvent | null>(null)
  const [askUserAnswer, setAskUserAnswer] = useState('')
  const [progressMsg, setProgressMsg] = useState('')
  const [taskList, setTaskList] = useState<Array<{ id: string; title: string; status: string }>>([])
  // 附件
  interface Attachment {
    id: string
    name: string
    path: string
    type: 'image' | 'document'
    status: 'pending' | 'converting' | 'done' | 'error'
    content?: string  // 转换后的文本内容
    error?: string
  }
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const logId = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)

  const pushLog = (icon: string, msg: string, status: ConsoleLine['status'] = 'info') => {
    const id = ++logId.current
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setConsoleLog(prev => [...prev.slice(-200), { id, time, icon, msg, status }])
  }

  // 模型列表
  useEffect(() => {
    const all = getAIModels()
    const withKeys = all.filter((m) => m.apiKey)
    setConfiguredModels(withKeys)
    const enabled = all.find((m) => m.enabled && m.apiKey) || withKeys[0] || null
    setActiveModel(enabled)
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // 刷新输出文件
  const refreshOutputs = useCallback(async () => {
    if (window.electronAPI?.workspace) {
      try { setOutputFiles(await window.electronAPI.workspace.listOutputs()) } catch {}
    }
  }, [])
  useEffect(() => { refreshOutputs() }, [messages, refreshOutputs])

  // Konami 码
  useKonamiCode(useCallback(() => setShowConsole(v => !v), []))

  // Agent UI 事件
  useEffect(() => {
    setAgentUIHandler((event) => {
      if (event.type === 'ask_user') {
        setAskUser(event)
        setAskUserAnswer('')
      } else if (event.type === 'show_progress') {
        const pct = event.current != null && event.total != null
          ? ` (${event.current}/${event.total})` : ''
        setProgressMsg(event.message + pct)
      } else if (event.type === 'notify_complete') {
        setProgressMsg('')
        pushLog('OK', event.message + (event.result ? ` -- ${event.result}` : ''), 'ok')
      } else if (event.type === 'update_task_list') {
        setTaskList((prev) => {
          const map = new Map(prev.map(t => [t.id, t]))
          for (const t of event.tasks) map.set(t.id, t)
          return Array.from(map.values())
        })
      }
    })
    return () => setAgentUIHandler(null)
  }, [])

  // 上传文件
  const handleUpload = useCallback(async () => {
    if (!window.electronAPI?.dialog || !window.electronAPI?.file) return
    const result = await window.electronAPI.dialog.openFile()
    if (!result.success || !result.files) return

    const newAttachments: Attachment[] = result.files.map((filePath) => {
      const name = filePath.split('/').pop() || filePath
      const ext = name.split('.').pop()?.toLowerCase() || ''
      const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)
      return {
        id: 'att_' + Math.random().toString(36).slice(2, 8),
        name,
        path: filePath,
        type: isImg ? 'image' as const : 'document' as const,
        status: isImg ? 'done' as const : 'pending' as const,
      }
    })

    setAttachments(prev => [...prev, ...newAttachments])

    // 异步转换文档
    for (const att of newAttachments) {
      if (att.type === 'image') continue
      setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'converting' as const } : a))
      try {
        const convertResult = await window.electronAPI!.file.convert(att.path)
        if (convertResult.success && convertResult.content) {
          setAttachments(prev => prev.map(a =>
            a.id === att.id ? { ...a, status: 'done' as const, content: convertResult.content } : a
          ))
        } else {
          setAttachments(prev => prev.map(a =>
            a.id === att.id ? { ...a, status: 'error' as const, error: convertResult.error || '转换失败' } : a
          ))
        }
      } catch (e: any) {
        setAttachments(prev => prev.map(a =>
          a.id === att.id ? { ...a, status: 'error' as const, error: e.message } : a
        ))
      }
    }
  }, [])

  // 移除附件
  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  // 发送消息核心
  const handleSend = useCallback(async () => {
    if (!input.trim() || loading || !activeModel) return

    // 构建用户消息内容（多模态支持）
    const textContent = input.trim()
    const docs = attachments.filter(a => a.type === 'document' && a.status === 'done' && a.content)
    const failedDocs = attachments.filter(a => a.type === 'document' && a.status !== 'done')
    const docTexts = docs.map(a =>
      `--- 文件: ${a.name} ---\n${a.content}\n--- 文件结束 ---`
    ).join('\n\n')
    // 构建给 AI 的完整消息
    let fullText = textContent
    if (docs.length > 0) {
      fullText = textContent
        ? `${textContent}\n\n以下是用户上传的文件内容：\n\n${docTexts}`
        : `请分析以下文件内容：\n\n${docTexts}`
    } else if (!fullText) {
      fullText = '(空消息)'
    }
    const images = attachments.filter(a => a.type === 'image' && a.status === 'done')

    // AI SDK 多模态格式：有图片时 content 为数组
    type ContentPart = { type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }
    const userContent: string | ContentPart[] = images.length > 0
      ? [
          { type: 'text' as const, text: fullText },
          ...images.map(img => {
            const ext = img.name.split('.').pop()?.toLowerCase() || 'png'
            const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' }[ext] || 'image/png'
            // 图片路径通过 Electron API 读取 base64
            return { type: 'image' as const, image: img.path, mimeType: mime }
          })
        ]
      : fullText

    const displaySummary = [
      textContent,
      images.length > 0 ? `[${images.length}张图片]` : '',
      docs.length > 0 ? `[${docs.length}个文档]` : '',
      failedDocs.length > 0 ? `[${failedDocs.length}个转换失败]` : '',
    ].filter(Boolean).join(' ') || '(空)'

    const msgAttachments: UIMessage['attachments'] = attachments.map(a => ({
      name: a.name,
      type: a.type,
      status: a.status === 'error' ? 'error' as const : 'done' as const,
      error: a.error,
    }))

    const userMsg: UIMessage = {
      role: 'user',
      content: displaySummary,
      attachments: msgAttachments.length > 0 ? msgAttachments : undefined,
    }
    const assistantMsg: UIMessage = { role: 'assistant', content: '', streaming: true }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setAttachments([])
    setLoading(true)

    try {
      // 图片 base64 预加载
      let resolvedContent = userContent
      if (Array.isArray(userContent)) {
        resolvedContent = await Promise.all(userContent.map(async (part) => {
          if (part.type === 'image' && part.image && !part.image.startsWith('data:')) {
            const api = window.electronAPI?.fs
            const result = await api?.readFileBase64(part.image as string)
            if (result?.success && result.content) {
              return { ...part, image: `data:${part.mimeType};base64,${result.content}` }
            }
          }
          return part
        }))
      }

      const history: ModelMessage[] = [...messages, userMsg]
        .filter((m) => !m.streaming && m.role !== 'tool')
        .map((m, i, arr) => ({
          role: m.role as 'user' | 'assistant',
          content: i === arr.length - 1 ? resolvedContent as string : m.content,
        }))

      const toolCallMap = new Map<string, string>()
      let streamed = ''

      setConsoleLog([])
      setTaskList([])
      pushLog('--', '开始处理', 'info')

      await chat(history, (event: ChatStreamEvent) => {
        if (event.type === 'text-delta') {
          streamed += event.text || ''
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant' && last.streaming) last.content = streamed
            return [...next]
          })
        } else if (event.type === 'tool-call') {
          const toolName = event.toolName || 'unknown'
          const toolType = detectToolType(toolName)
          pushLog('>', `[${toolType}] ${toolName}`, 'running')
          const tcId = Math.random().toString(36).slice(2, 8)
          const tc: ToolCallStatus = { id: tcId, name: toolName, type: toolType, status: 'running', input: event.toolInput }
          toolCallMap.set(tcId, tcId)

          const textBeforeTool = streamed
          streamed = ''
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant' && last.streaming) {
              if (textBeforeTool) {
                last.content = textBeforeTool
                last.streaming = false
              } else {
                next.pop()
              }
            }
            next.push({ role: 'tool', content: '', toolCall: tc })
            next.push({ role: 'assistant', content: '', streaming: true })
            return [...next]
          })
        } else if (event.type === 'tool-result') {
          const outputStr = String(event.toolOutput ?? '')
          const ok = !outputStr.startsWith('Error') && !outputStr.startsWith('error')
          const targetName = event.toolName

          setMessages((prev) =>
            prev.map(m => {
              if (m.role === 'tool' && m.toolCall && m.toolCall.name === targetName && m.toolCall.status === 'running') {
                return { ...m, content: outputStr.slice(0, 2000), toolCall: { ...m.toolCall, status: ok ? 'done' as const : 'error' as const, result: outputStr.slice(0, 8000) } }
              }
              return m
            }),
          )

          pushLog(ok ? 'OK' : 'ERR', (targetName || 'tool') + (ok ? ' done' : ' fail'), ok ? 'ok' : 'error')
          if (detectToolType(targetName || '') === 'agent') {
            pushLog('OUT', outputStr, 'info')
          }
          setStatusText('')
        } else if (event.type === 'done') {
          pushLog('DONE', `回复 (${streamed.length}字)`, streamed ? 'ok' : 'info')
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant' && last.streaming) {
              if (streamed) { last.content = streamed; last.streaming = false }
              else { next.pop() }
            }
            return [...next]
          })
        }
      })
    } catch (e: any) {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') { last.content = `${e.message}`; last.streaming = false }
        return [...next]
      })
    } finally {
      setLoading(false)
      setTimeout(() => setStatusText(''), 3000)
    }
  }, [input, loading, activeModel, messages, attachments])

  // ask_user 回答
  const handleAskAnswer = useCallback((answer: string) => {
    if (!askUser) return
    setMessages(prev => [...prev, { role: 'user', content: answer }])
    const question = askUser.question
    askUser.resolve(answer)
    setAskUser(null)
    pushLog('USR', `${question} => ${answer}`, 'ok')
  }, [askUser])

  return (
    <div className="flex h-full flex-col">
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
              <ChatMessage key={i} msg={msg} />
            ))}
            {/* 任务清单 */}
            {taskList.length > 0 && (
              <div className="flex gap-3">
                <div className="flex-1 rounded-lg border border-border bg-card px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ListTodo className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      任务进度 ({taskList.filter(t => t.status === 'done').length}/{taskList.length})
                    </span>
                  </div>
                  <div className="space-y-1">
                    {taskList.map(t => (
                      <div key={t.id} className="flex items-center gap-2 text-xs">
                        {t.status === 'done' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                        ) : t.status === 'running' ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground animate-spin" />
                        ) : t.status === 'cancelled' ? (
                          <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                        )}
                        <span className={`truncate ${
                          t.status === 'done' ? 'text-muted-foreground line-through'
                          : t.status === 'running' ? 'text-foreground font-medium'
                          : 'text-muted-foreground'
                        }`}>{t.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* ask_user 对话框 */}
      {askUser && (
        <AskUserBar
          askUser={askUser}
          answer={askUserAnswer}
          onAnswerChange={setAskUserAnswer}
          onAnswer={handleAskAnswer}
        />
      )}

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
          </div>
        </div>
      )}

      {/* 控制台 */}
      {showConsole && (
        <ChatConsole lines={consoleLog} onClose={() => setShowConsole(false)} />
      )}

      {/* 状态栏 */}
      {(statusText || progressMsg) && (
        <div className="border-t border-border bg-muted/30 px-4 py-1.5 text-center text-xs text-muted-foreground">
          {progressMsg && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
          {progressMsg || statusText}
        </div>
      )}

      {/* 输入区 */}
      <div className="border-t border-border px-3 py-2">
        {/* 附件 chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                  att.status === 'error' ? 'border-destructive/30 bg-destructive/5 text-destructive'
                  : att.status === 'converting' ? 'border-border bg-muted/50 text-muted-foreground'
                  : 'border-border bg-card text-foreground'
                }`}
              >
                {att.status === 'error' ? (
                  <X className="h-3 w-3 text-destructive" />
                ) : att.status === 'converting' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : att.type === 'image' ? (
                  <Image className="h-3 w-3 text-blue-500" />
                ) : (
                  <FileText className="h-3 w-3 text-amber-500" />
                )}
                <span className="max-w-[120px] truncate" title={att.error}>{att.name}</span>
                {att.status === 'converting' && <span className="text-[10px]">转换中</span>}
                {att.status === 'error' && <span className="text-[10px] text-destructive truncate max-w-[200px]" title={att.error}>失败: {att.error}</span>}
                <button
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted transition-colors"
                  onClick={() => removeAttachment(att.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* 模型选择（紧凑图标按钮） */}
          <div className="relative shrink-0">
            <button
              className="flex items-center gap-1 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => setShowModelPicker(!showModelPicker)}
              title={activeModel ? `${activeModel.displayName} / ${activeModel.selectedModel}` : '选择模型'}
            >
              <Bot className="h-4 w-4" />
            </button>
            {showModelPicker && (
              <div className="absolute left-0 bottom-full z-50 mb-1 w-72 rounded-lg border border-border bg-card shadow-lg">
                <div className="max-h-72 overflow-auto p-1">
                  {configuredModels.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-muted-foreground text-center">请先在设置中配置 API Key</p>
                  ) : (
                    configuredModels.map((provider) => (
                      <div key={provider.id} className="mb-0.5 last:mb-0">
                        <div
                          className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${activeModel?.id === provider.id ? 'bg-accent' : 'hover:bg-muted/50'}`}
                          onClick={() => { setActiveModel(provider); setShowModelPicker(false) }}
                        >
                          <span className={`h-2 w-2 rounded-full shrink-0 ${provider.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                          <span className="font-medium flex-1 truncate">{provider.displayName}</span>
                        </div>
                        {provider.availableModels?.length > 0 && (
                          <div className="ml-5 border-l border-border pl-2 mt-0.5">
                            {provider.availableModels.map((m) => {
                              const isActive = activeModel?.id === provider.id && activeModel?.selectedModel === m.id
                              return (
                                <button
                                  key={m.id}
                                  className={`block w-full text-left px-2 py-1 rounded text-[11px] transition-colors ${isActive ? 'text-foreground font-medium bg-accent' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
                                  onClick={() => {
                                    setActiveModel({ ...provider, selectedModel: m.id })
                                    setShowModelPicker(false)
                                  }}
                                >
                                  <span className="font-mono text-[10px] mr-1.5 opacity-50">{m.id}</span>
                                  {m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}k` : ''}
                                  {m.capabilities?.length ? ` · ${m.capabilities.join(', ')}` : ''}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          {/* 上传文件 */}
          <button
            className="flex items-center rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={handleUpload}
            title="上传文件（图片/文档）"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          {/* 输入框 */}
          <Input
            className="flex-1 h-9 text-sm"
            placeholder={activeModel ? `向 ${activeModel.displayName} 提问...` : '请先配置模型'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            disabled={!activeModel}
          />
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={!input.trim() || loading || !activeModel}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
