import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, Loader2, Bot, X, ListTodo, Circle, CheckCircle2,
  Paperclip, FileText, Image, HardDrive,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { chat, setAgentUIHandler, type ChatStreamEvent, type AskUserEvent } from '@/lib/chatService'
import type { ModelMessage } from 'ai'
import { useKonamiCode } from '@/hooks/useKonamiCode'
import { useModelLoader } from '@/hooks/useModelLoader'
import { ChatMessage } from './ChatMessage'
import { AskUserBar } from './AskUserBar'
import { ChatConsole } from './ChatConsole'
import { ModelPicker } from './ModelPicker'
import { OutputFiles } from './OutputFiles'
import {
  type ToolCallStatus, type UIMessage, type ConsoleLine,
  detectToolType,
} from '@/types/chat'

export function ChatPage() {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const { configuredModels, activeModel, setActiveModel, localModels, localModelId, setLocalModelId, refreshModels } = useModelLoader()
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [autoMode, setAutoMode] = useState(true)
  const [outputFiles, setOutputFiles] = useState<Array<{ name: string; path: string; size: number }>>([])
  const [statusText, setStatusText] = useState('')
  const [consoleLog, setConsoleLog] = useState<ConsoleLine[]>([])
  const [showConsole, setShowConsole] = useState(false)
  const [askUser, setAskUser] = useState<AskUserEvent | null>(null)
  const [askUserAnswer, setAskUserAnswer] = useState('')
  const [progressMsg, setProgressMsg] = useState('')
  const [taskList, setTaskList] = useState<Array<{ id: string; title: string; status: string }>>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const logId = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)

  const pushLog = (icon: string, msg: string, status: ConsoleLine['status'] = 'info') => {
    const id = ++logId.current
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setConsoleLog(prev => [...prev.slice(-200), { id, time, icon, msg, status }])
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const refreshOutputs = useCallback(async () => {
    if (window.electronAPI?.workspace) {
      try { setOutputFiles(await window.electronAPI.workspace.listOutputs()) } catch {}
    }
  }, [])
  useEffect(() => { refreshOutputs() }, [messages, refreshOutputs])

  // 展开选择器时刷新 + 外部点击关闭
  useEffect(() => {
    if (showModelPicker) refreshModels()
    if (!showModelPicker) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowModelPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModelPicker, refreshModels])

  useKonamiCode(useCallback(() => setShowConsole(v => !v), []))

  // Agent UI 事件
  useEffect(() => {
    setAgentUIHandler((event) => {
      if (event.type === 'ask_user') { setAskUser(event); setAskUserAnswer('') }
      else if (event.type === 'show_progress') {
        const pct = event.current != null && event.total != null ? ` (${event.current}/${event.total})` : ''
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

    const newAttachments: Attachment[] = result.files.map((fp) => {
      const name = fp.split('/').pop() || fp
      const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(name.split('.').pop()?.toLowerCase() || '')
      return { id: 'att_' + Math.random().toString(36).slice(2, 8), name, path: fp, type: (isImg ? 'image' : 'document') as 'image' | 'document', status: (isImg ? 'done' : 'pending') as 'done' | 'pending' }
    })
    setAttachments(prev => [...prev, ...newAttachments])

    for (const att of newAttachments) {
      if (att.type === 'image') continue
      setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'converting' as const } : a))
      try {
        const r = await window.electronAPI!.file.convert(att.path)
        setAttachments(prev => prev.map(a =>
          a.id === att.id ? { ...a, status: r.success && r.content ? 'done' as const : 'error' as const, content: r.content, error: r.error } : a
        ))
      } catch (e: any) {
        setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'error' as const, error: e.message } : a))
      }
    }
  }, [])

  const removeAttachment = useCallback((id: string) => setAttachments(prev => prev.filter(a => a.id !== id)), [])

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!input.trim() || loading || (!activeModel && !localModelId)) return

    const docs = attachments.filter(a => a.type === 'document' && a.status === 'done' && a.content)
    const failedDocs = attachments.filter(a => a.type === 'document' && a.status !== 'done')
    const docTexts = docs.map(a => `--- 文件: ${a.name} ---\n${a.content}\n--- 文件结束 ---`).join('\n\n')
    let fullText = input.trim()
    if (docs.length > 0) {
      fullText = fullText
        ? `${fullText}\n\n以下是用户上传的文件内容：\n\n${docTexts}`
        : `请分析以下文件内容：\n\n${docTexts}`
    }
    const images = attachments.filter(a => a.type === 'image' && a.status === 'done')

    type ContentPart = { type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }
    const userContent: string | ContentPart[] = images.length > 0
      ? [{ type: 'text' as const, text: fullText }, ...images.map(img => {
          const ext = img.name.split('.').pop()?.toLowerCase() || 'png'
          const mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' } as any)[ext] || 'image/png'
          return { type: 'image' as const, image: img.path, mimeType: mime }
        })]
      : fullText

    const displaySummary = [input.trim(), images.length > 0 ? `[${images.length}张图片]` : '', docs.length > 0 ? `[${docs.length}个文档]` : '', failedDocs.length > 0 ? `[${failedDocs.length}个转换失败]` : ''].filter(Boolean).join(' ')

    const modelName = localModelId
      ? `本地 / ${localModels.find(m => m.id === localModelId)?.name || localModelId}`
      : activeModel ? `${activeModel.displayName} / ${activeModel.selectedModel}` : undefined

    const userMsg: UIMessage = { role: 'user', content: displaySummary, attachments: attachments.length > 0 ? attachments.map(a => ({ name: a.name, type: a.type, status: a.status === 'error' ? 'error' as const : 'done' as const, error: a.error })) : undefined }
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '', streaming: true, modelName }])
    setInput('')
    setAttachments([])
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      let resolvedContent = userContent
      if (Array.isArray(userContent)) {
        resolvedContent = await Promise.all(userContent.map(async (part) => {
          if (part.type === 'image' && part.image && !part.image.startsWith('data:')) {
            const result = await window.electronAPI?.fs?.readFileBase64(part.image)
            if (result?.success && result.content) return { ...part, image: `data:${part.mimeType};base64,${result.content}` }
          }
          return part
        }))
      }

      const history: ModelMessage[] = [...messages, userMsg]
        .filter(m => !m.streaming && m.role !== 'tool')
        .map((m, i, arr) => ({ role: m.role as 'user' | 'assistant', content: i === arr.length - 1 ? resolvedContent as string : m.content }))

      let streamed = ''
      setConsoleLog([]); setTaskList([])
      pushLog('--', '开始处理', 'info')

      await chat(history, (event: ChatStreamEvent) => {
        if (event.type === 'text-delta') {
          streamed += event.text || ''
          setMessages(prev => { const n = [...prev]; const l = n[n.length - 1]; if (l?.role === 'assistant' && l.streaming) l.content = streamed; return [...n] })
        } else if (event.type === 'tool-call') {
          const tc: ToolCallStatus = { id: Math.random().toString(36).slice(2, 8), name: event.toolName || 'unknown', type: detectToolType(event.toolName || ''), status: 'running', input: event.toolInput }
          pushLog('>', `[${tc.type}] ${tc.name}`, 'running')
          const textBeforeTool = streamed; streamed = ''
          setMessages(prev => {
            const n = [...prev]; const l = n[n.length - 1]
            if (l?.role === 'assistant' && l.streaming) { if (textBeforeTool) { l.content = textBeforeTool; l.streaming = false } else n.pop() }
            n.push({ role: 'tool', content: '', toolCall: tc }, { role: 'assistant', content: '', streaming: true, modelName })
            return [...n]
          })
        } else if (event.type === 'tool-result') {
          const ok = !String(event.toolOutput ?? '').startsWith('Error')
          setMessages(prev => prev.map(m => m.role === 'tool' && m.toolCall?.name === event.toolName && m.toolCall?.status === 'running' ? { ...m, content: String(event.toolOutput ?? '').slice(0, 2000), toolCall: { ...m.toolCall, status: ok ? 'done' as const : 'error' as const, result: String(event.toolOutput ?? '').slice(0, 8000) } } : m))
          pushLog(ok ? 'OK' : 'ERR', `${event.toolName || 'tool'} ${ok ? 'done' : 'fail'}`, ok ? 'ok' : 'error')
          if (detectToolType(event.toolName || '') === 'agent') pushLog('OUT', String(event.toolOutput ?? ''), 'info')
          setStatusText('')
        } else if (event.type === 'done') {
          pushLog('DONE', `回复 (${streamed.length}字)`, streamed ? 'ok' : 'info')
          setMessages(prev => { const n = [...prev]; const l = n[n.length - 1]; if (l?.role === 'assistant' && l.streaming) { if (streamed) { l.content = streamed; l.streaming = false } else n.pop() } return [...n] })
        }
      }, { abortSignal: controller.signal, autoMode, localModelId: localModelId ?? undefined })
    } catch (e: any) {
      const isAbort = e.name === 'AbortError' || controller.signal.aborted
      setMessages(prev => prev.map(m => {
        if (m.role === 'assistant' && m.streaming) return { ...m, content: (m.content || '') + '\n\n*[用户已中断]*', streaming: false }
        if (m.role === 'tool' && m.toolCall?.status === 'running') return { ...m, toolCall: { ...m.toolCall, status: 'error' as const, result: '[已中断]' } }
        return m
      }))
      if (isAbort) { pushLog('STOP', '用户中断', 'info'); setProgressMsg(''); setTaskList(prev => prev.map(t => t.status === 'running' ? { ...t, status: 'cancelled' } : t)) }
    } finally { abortRef.current = null; setLoading(false); setTimeout(() => setStatusText(''), 3000) }
  }, [input, loading, activeModel, messages, attachments, localModelId, localModels, autoMode])

  const handleAskAnswer = useCallback((answer: string) => {
    if (!askUser) return
    setMessages(prev => [...prev, { role: 'user', content: answer }])
    pushLog('USR', `${askUser.question} => ${answer}`, 'ok')
    askUser.resolve(answer)
    setAskUser(null)
  }, [askUser])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Bot className="h-16 w-16 opacity-20" />
            <p className="text-lg font-medium">AI 助手</p>
            <p className="text-sm">{configuredModels.length === 0 ? '请先在设置中配置模型' : activeModel ? `当前模型: ${activeModel.displayName}` : '选择一个模型'}</p>
          </div>
        ) : (
          <div className="w-full px-4 py-4 space-y-4">
            {messages.map((msg, i) => <ChatMessage key={i} msg={msg} />)}
            {taskList.length > 0 && <TaskListCard tasks={taskList} />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {askUser && <AskUserBar askUser={askUser} answer={askUserAnswer} onAnswerChange={setAskUserAnswer} onAnswer={handleAskAnswer} />}
      <OutputFiles files={outputFiles} onRefresh={refreshOutputs} />
      {showConsole && <ChatConsole lines={consoleLog} onClose={() => setShowConsole(false)} />}

      {(statusText || progressMsg) && (
        <div className="border-t border-border bg-muted/30 px-4 py-1.5 text-center text-xs text-muted-foreground">
          {progressMsg && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
          {progressMsg || statusText}
        </div>
      )}

      {/* 输入区 */}
      <div className="border-t border-border px-3 py-2">
        {attachments.length > 0 && <AttachmentChips attachments={attachments} onRemove={removeAttachment} />}

        <div className="flex items-center gap-2">
          <div className="relative shrink-0">
            <button
              className="flex items-center gap-1 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => setShowModelPicker(!showModelPicker)}
              title={localModelId ? `本地: ${localModels.find(m => m.id === localModelId)?.name}` : activeModel ? `${activeModel.displayName} / ${activeModel.selectedModel}` : '选择模型'}
            >
              {localModelId ? <HardDrive className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </button>
            <ModelPicker
              show={showModelPicker}
              autoMode={autoMode}
              activeModel={activeModel}
              localModelId={localModelId}
              configuredModels={configuredModels}
              localModels={localModels}
              onToggleAuto={() => setAutoMode(!autoMode)}
              onSelectCloud={(m) => { setActiveModel(m); setLocalModelId(null); setShowModelPicker(false) }}
              onSelectLocal={(id) => { setLocalModelId(id || null); if (id) setActiveModel(null as any); setShowModelPicker(false) }}
              onClose={() => setShowModelPicker(false)}
              pickerRef={pickerRef}
            />
          </div>

          <button className="flex items-center rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" onClick={handleUpload} title="上传文件">
            <Paperclip className="h-4 w-4" />
          </button>

          <Input
            className="flex-1 h-9 text-sm"
            placeholder={localModelId ? '向本地模型提问...' : activeModel ? `向 ${activeModel.displayName} 提问...` : '请先配置模型'}
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            disabled={!activeModel && !localModelId}
          />

          {loading ? (
            <Button size="icon" className="h-9 w-9 shrink-0" variant="secondary" onClick={() => abortRef.current?.abort()} title="停止生成">
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={!input.trim() || (!activeModel && !localModelId)}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ====== 内部组件 ======

interface Attachment {
  id: string; name: string; path: string; type: 'image' | 'document'
  status: 'pending' | 'converting' | 'done' | 'error'
  content?: string; error?: string
}

function AttachmentChips({ attachments, onRemove }: { attachments: Attachment[]; onRemove: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {attachments.map(att => (
        <div key={att.id} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${att.status === 'error' ? 'border-destructive/30 bg-destructive/5 text-destructive' : att.status === 'converting' ? 'border-border bg-muted/50 text-muted-foreground' : 'border-border bg-card text-foreground'}`}>
          {att.status === 'error' ? <X className="h-3 w-3 text-destructive" /> : att.status === 'converting' ? <Loader2 className="h-3 w-3 animate-spin" /> : att.type === 'image' ? <Image className="h-3 w-3 text-muted-foreground" /> : <FileText className="h-3 w-3 text-muted-foreground" />}
          <span className="max-w-[120px] truncate" title={att.error}>{att.name}</span>
          {att.status === 'converting' && <span className="text-[10px]">转换中</span>}
          {att.status === 'error' && <span className="text-[10px] text-destructive truncate max-w-[200px]" title={att.error}>失败: {att.error}</span>}
          <button className="ml-0.5 rounded-full p-0.5 hover:bg-muted transition-colors" onClick={() => onRemove(att.id)}><X className="h-3 w-3" /></button>
        </div>
      ))}
    </div>
  )
}

function TaskListCard({ tasks }: { tasks: Array<{ id: string; title: string; status: string }> }) {
  return (
    <div className="flex gap-3">
      <div className="flex-1 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <ListTodo className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">任务进度 ({tasks.filter(t => t.status === 'done').length}/{tasks.length})</span>
        </div>
        <div className="space-y-1">
          {tasks.map(t => (
            <div key={t.id} className="flex items-center gap-2 text-xs">
              {t.status === 'done' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              : t.status === 'running' ? <Loader2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground animate-spin" />
              : t.status === 'cancelled' ? <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              : <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />}
              <span className={`truncate ${t.status === 'done' ? 'text-muted-foreground line-through' : t.status === 'running' ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{t.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
