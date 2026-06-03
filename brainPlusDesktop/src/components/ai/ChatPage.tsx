import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, Loader2, Bot, X, ListTodo, Circle, CheckCircle2, File,
  Paperclip, FileText, Image, HardDrive,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { chat, setAgentUIHandler, type ChatStreamEvent, type AskUserEvent } from '@/lib/chatService'
import type { ModelMessage } from 'ai'
import { formatDuration, estimateTokens } from '@/lib/observability'
import { ContextWindowManager } from '@/lib/contextWindowManager'
import { useKonamiCode } from '@/hooks/useKonamiCode'
import { useModelLoader } from '@/hooks/useModelLoader'
import { ChatMessage } from './ChatMessage'
import { AskUserBar } from './AskUserBar'
import { ChatConsole } from './ChatConsole'
import { ModelPicker } from './ModelPicker'
import { OutputFiles } from './OutputFiles'
import { ConversationBar, type ConvInfo } from './ConversationBar'
import { SkillPicker } from './SkillPicker'
import { getInstalledSkills, toggleSkill } from '@/lib/skillService'
import type { InstalledSkill } from '@/types/skill'
import {
  type ToolCallStatus, type UIMessage, type ConsoleLine,
  type CompressionEventData,
  detectToolType,
} from '@/types/chat'
import { TokenUsageBar } from './TokenUsageBar'

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
  const [skills, setSkills] = useState<InstalledSkill[]>([])
  // @ 文件选择
  const [atFiles, setAtFiles] = useState<Array<{ name: string; path: string; isDir: boolean }>>([])
  const [showAtPicker, setShowAtPicker] = useState(false)
  const atQueryRef = useRef('')
  // 对话管理
  const [convId, setConvId] = useState<string | null>(null)
  const [convTitle, setConvTitle] = useState('新对话')
  const [convList, setConvList] = useState<ConvInfo[]>([])
  const [compressionInfo, setCompressionInfo] = useState<CompressionEventData | null>(null)
  const [compressing, setCompressing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const forceCompressRef = useRef(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<UIMessage[]>([])
  const logId = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      userScrolledUpRef.current = !isNearBottom()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isNearBottom])

  useEffect(() => {
    // 流式更新中：用户没手动滚上去才跟底，用 instant 避免动画累积
    const streaming = messages.some(m => m.streaming)
    if (userScrolledUpRef.current && streaming) return
    endRef.current?.scrollIntoView({ behavior: streaming ? 'instant' : 'smooth' })
    // streaming 消息结束时重置标记
    if (!streaming) userScrolledUpRef.current = false
  }, [messages])

  const pushLog = (icon: string, msg: string, status: ConsoleLine['status'] = 'info') => {
    const id = ++logId.current
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setConsoleLog(prev => [...prev.slice(-200), { id, time, icon, msg, status }])
  }

  useEffect(() => { messagesRef.current = messages }, [messages])
  // 加载对话列表
  const loadConvList = useCallback(async () => {
    if (!window.electronAPI?.conv) return
    const list = await window.electronAPI.conv.list()
    setConvList(list)
  }, [])
  useEffect(() => { setSkills(getInstalledSkills()) }, [])
  useEffect(() => { loadConvList() }, [loadConvList])

  // 保存当前对话（消息变化时，含压缩快照）
  useEffect(() => {
    if (!convId || !window.electronAPI?.conv || messages.length === 0) return
    const modelName = activeModel ? `${activeModel.displayName} / ${activeModel.selectedModel}` : undefined
    const compression = compressionInfo ? {
      originalTokens: compressionInfo.originalTokens,
      compressedTokens: compressionInfo.compressedTokens,
      limit: compressionInfo.limit,
      summary: compressionInfo.summary,
      messageCount: messages.length,
    } : undefined
    window.electronAPI.conv.save({
      id: convId, title: convTitle, messages, modelName,
      createdAt: '', updatedAt: new Date().toISOString(),
      compression,
    } as any)
    // 更新列表
    setConvList(prev => prev.map(c => c.id === convId ? { ...c, title: convTitle, messageCount: messages.length, updatedAt: new Date().toISOString() } : c))
  }, [messages, convId, convTitle, activeModel, compressionInfo])

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
          for (const t of event.tasks) {
            const existing = map.get(t.id)
            map.set(t.id, { ...existing, ...t, title: t.title || existing?.title || '' })
          }
          return Array.from(map.values())
        })
      }
    })
    return () => setAgentUIHandler(null)
  }, [])

  // 新对话
  const handleNewConv = useCallback(async () => {
    const api = window.electronAPI?.conv
    if (!api) return
    const c = await api.create('新对话')
    setConvId(c.id); setConvTitle('新对话'); setMessages([]); setCompressionInfo(null)
    setConvList(prev => [{ id: c.id, title: '新对话', messageCount: 0, updatedAt: c.updatedAt }, ...prev])
  }, [])

  // 切换对话
  const handleSwitchConv = useCallback(async (id: string) => {
    const api = window.electronAPI?.conv
    if (!api) return
    const c = await api.get(id)
    if (c) {
      setConvId(c.id); setConvTitle(c.title); setMessages(c.messages || [])
      // 恢复压缩状态（若消息数未变化则有效，否则视为过期）
      const snap = (c as any).compression
      if (snap && snap.messageCount === (c.messages || []).length) {
        setCompressionInfo({
          wasCompressed: true,
          originalTokens: snap.originalTokens,
          compressedTokens: snap.compressedTokens,
          limit: snap.limit,
          summary: snap.summary,
        })
      } else {
        setCompressionInfo(null)
      }
    }
  }, [])

  // 删除对话
  const handleDeleteConv = useCallback(async (id: string) => {
    await window.electronAPI?.conv?.delete(id)
    setConvList(prev => prev.filter(c => c.id !== id))
    if (convId === id) {
      const remaining = convList.filter(c => c.id !== id)
      if (remaining.length > 0) { handleSwitchConv(remaining[0].id) }
      else { handleNewConv() }
    }
  }, [convId, convList, handleSwitchConv, handleNewConv])

  // 重命名对话
  const handleRenameConv = useCallback(async (id: string, title: string) => {
    setConvTitle(title)
    setConvList(prev => prev.map(c => c.id === id ? { ...c, title } : c))
    const c = await window.electronAPI?.conv?.get(id)
    if (c) window.electronAPI?.conv?.save({ ...c, title })
  }, [])

  // 自动标题（首条消息后异步生成）
  const generateTitle = useCallback(async (cid: string, userText: string, aiText: string) => {
    try {
      const prompt = `根据以下对话生成一个简短的标题（3-8个字，直接输出标题不要解释）：\n用户: ${userText.slice(0, 100)}\nAI: ${aiText.slice(0, 200)}`

      // 优先用任意已启用的本地模型
      const modelApi = window.electronAPI?.model
      const localModel = modelApi ? (await modelApi.getStatus()).find(m => m.installed && m.enabled) : null

      if (localModel && modelApi) {
        console.warn(`[title] 使用本地模型: ${localModel.name}`)
        modelApi.chat(localModel.id, [{ role: 'user', content: prompt }])
        let title = ''
        const u1 = modelApi.onChatChunk(({ text }) => { title += text })
        modelApi.onChatDone(() => {
          u1()
          const t = title.trim().slice(0, 40) || '新对话'
          console.warn(`[title] 结果: "${t}"`)
          setConvTitle(t); setConvList(prev => prev.map(c => c.id === cid ? { ...c, title: t } : c))
        })
      } else if (activeModel) {
        console.warn(`[title] 使用云模型: ${activeModel.displayName}`)
        const { delegateToModel } = await import('@/lib/chatService')
        const r = await delegateToModel('fast', prompt)
        const t = r.result.trim().slice(0, 40) || '新对话'
        console.warn(`[title] 结果: "${t}"`)
        setConvTitle(t); setConvList(prev => prev.map(c => c.id === cid ? { ...c, title: t } : c))
      } else {
        console.warn('[title] 无可用模型')
      }
    } catch {}
  }, [activeModel])

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

    // 确保有对话
    let cid = convId
    if (!cid && window.electronAPI?.conv) {
      const c = await window.electronAPI.conv.create('新对话')
      cid = c.id; setConvId(c.id)
      setConvList(prev => [{ id: c.id, title: '新对话', messageCount: 0, updatedAt: c.updatedAt }, ...prev])
    }
    const isFirstMsg = messages.length === 0

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

    // 新一轮对话，重置旧的压缩数据
    setCompressionInfo(null)

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
        } else if (event.type === 'compression') {
          setCompressionInfo({
            wasCompressed: true,
            originalTokens: event.originalTokens || 0,
            compressedTokens: event.compressedTokens || 0,
            limit: event.limit || 0,
            summary: event.summary,
          })
        } else if (event.type === 'done') {
          pushLog('DONE', `回复 (${streamed.length}字)`, streamed ? 'ok' : 'info')
          if (event.trace) {
            const t = event.trace
            const parts = [
              `${t.inputTokens + t.outputTokens} tok`,
              formatDuration(t.totalDuration),
              t.toolCalls.length > 0 ? `${t.toolCalls.length} tools` : '',
            ].filter(Boolean)
            const info = parts.join(' · ')
            // 附加到最后一条助手消息
            setMessages(prev => {
              const n = [...prev]
              const last = n[n.length - 1]
              if (last?.role === 'assistant') last.trace = info
              return [...n]
            })
          }
          setMessages(prev => { const n = [...prev]; const l = n[n.length - 1]; if (l?.role === 'assistant' && l.streaming) { if (streamed) { l.content = streamed; l.streaming = false } else n.pop() } return [...n] })
        }
      }, {
        abortSignal: controller.signal,
        autoMode,
        localModelId: localModelId ?? undefined,
        forceCompression: forceCompressRef.current ? true : undefined,
      })
      forceCompressRef.current = false
    } catch (e: any) {
      const isAbort = e.name === 'AbortError' || controller.signal.aborted
      setMessages(prev => prev.map(m => {
        if (m.role === 'assistant' && m.streaming) return { ...m, content: (m.content || '') + `\n\n*[${isAbort ? '用户已中断' : '连接失败'}] *`, streaming: false }
        if (m.role === 'tool' && m.toolCall?.status === 'running') return { ...m, toolCall: { ...m.toolCall, status: 'error' as const, result: isAbort ? '[已中断]' : '[连接失败]' } }
        return m
      }))
      if (isAbort) {
        pushLog('STOP', '用户中断', 'info')
        setProgressMsg('')
        setTaskList(prev => prev.map(t => t.status === 'running' ? { ...t, status: 'cancelled' } : t))
      } else {
        const msg = e.message || '网络连接失败'
        pushLog('ERR', msg, 'error')
        setStatusText(`连接失败：${msg.slice(0, 40)}`)
      }
    } finally { abortRef.current = null; setLoading(false); setTimeout(() => setStatusText(''), 8000) }

    // 首条消息后自动生成标题（用 ref 避免闭包过期）
    if (isFirstMsg && cid) {
      const userText = input.trim()
      const latestMsgs = messagesRef.current
      const aiReply = latestMsgs.filter(m => m.role === 'assistant').pop()
      const aiText = aiReply?.content?.slice(0, 200) || ''
      if (aiText) setTimeout(() => generateTitle(cid, userText, aiText), 1000)
    }
  }, [input, loading, activeModel, messages, attachments, localModelId, localModels, autoMode, convId, generateTitle])

  // @ 文件选择器
  const handleInputChange = useCallback(async (val: string) => {
    setInput(val)
    const atIdx = val.lastIndexOf('@')
    if (atIdx >= 0 && (atIdx === 0 || val[atIdx - 1] === ' ')) {
      const query = val.slice(atIdx + 1).toLowerCase()
      atQueryRef.current = query
      if (window.electronAPI?.workspace && window.electronAPI?.fs) {
        const ws = await window.electronAPI.workspace.getPaths()
        // 搜索整个工作区（递归列出所有文件）
        const allFiles = await collectFiles(ws.root, query || undefined)
        setAtFiles(allFiles.slice(0, 10))
        setShowAtPicker(allFiles.length > 0)
      }
    } else { setShowAtPicker(false) }
  }, [])

  const selectAtFile = useCallback(async (file: { name: string; path: string }) => {
    const atIdx = input.lastIndexOf('@')
    const afterAt = input.slice(atIdx + 1)
    const spaceIdx = afterAt.indexOf(' ')
    const replaceLen = spaceIdx >= 0 ? spaceIdx + 1 : afterAt.length + 1
    setInput(input.slice(0, atIdx) + input.slice(atIdx + replaceLen))
    const att: Attachment = { id: 'att_' + Math.random().toString(36).slice(2, 8), name: file.name, path: file.path, type: ['png','jpg','jpeg','gif','webp','bmp','svg'].includes(file.name.split('.').pop()?.toLowerCase()||'') ? 'image' : 'document', status: 'pending' }
    setAttachments(prev => [...prev, att]); setShowAtPicker(false)
    if (att.type === 'document' && window.electronAPI?.file) {
      setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'converting' } : a))
      try {
        const r = await window.electronAPI.file.convert(file.path)
        setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: r.success && r.content ? 'done' : 'error', content: r.content, error: r.error } : a))
      } catch (e: any) { setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'error', error: e.message } : a)) }
    }
  }, [input])

  const handleAskAnswer = useCallback((answer: string) => {
    if (!askUser) return
    setMessages(prev => [...prev, { role: 'user', content: answer }])
    pushLog('USR', `${askUser.question} => ${answer}`, 'ok')
    askUser.resolve(answer)
    setAskUser(null)
  }, [askUser])

  // Token 用量（排除 tool 消息——它们不会被发给 API，只用于 UI 展示）
  const estimatedTokens = messages
    .filter(m => m.role !== 'tool')
    .reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0)
  const contextWindowLimit =
    compressionInfo?.limit
    || activeModel?.availableModels?.find(m => m.id === activeModel.selectedModel)?.contextWindow
    || 8192

  const compressingRef = useRef(false)

  /** 主动压缩当前消息（不等下一条发送） */
  const compressNow = useCallback(async () => {
    if (compressingRef.current || messages.length === 0) return
    compressingRef.current = true
    setCompressing(true)
    try {
      const cwm = new ContextWindowManager()
      const modelMessages = messages
        .filter(m => !m.streaming && m.role !== 'tool')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      const result = await cwm.compress(modelMessages, contextWindowLimit, { force: true })
      if (result.wasCompressed) {
        setCompressionInfo({
          wasCompressed: true,
          originalTokens: result.originalTokens,
          compressedTokens: result.compressedTokens,
          limit: result.limit,
          summary: result.summary,
        })
      }
    } finally {
      compressingRef.current = false
      setCompressing(false)
    }
  }, [messages, contextWindowLimit])

  // 切换模型时重置压缩状态（上下文窗口大小不同了）
  useEffect(() => {
    setCompressionInfo(null)
  }, [activeModel?.selectedModel])

  return (
    <div className="flex h-full flex-col">
      <ConversationBar
        convId={convId}
        convTitle={convTitle}
        conversations={convList}
        onNew={handleNewConv}
        onSwitch={handleSwitchConv}
        onDelete={handleDeleteConv}
        onRename={handleRenameConv}
      />
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Bot className="h-16 w-16 opacity-20" />
            <p className="text-lg font-medium">AI 助手</p>
            <p className="text-sm">{configuredModels.length === 0 ? '请先在设置中配置模型' : activeModel ? `当前模型: ${activeModel.displayName}` : '选择一个模型'}</p>
          </div>
        ) : (
          <div className="chat-messages w-full px-4 py-4 space-y-4">
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
        <div className="border-t border-border bg-muted/30 px-4 py-1 text-center text-[10px] text-muted-foreground/50">
          {progressMsg && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
          {progressMsg || statusText}
        </div>
      )}

      {/* Token 用量条 */}
      <TokenUsageBar
        estimatedTokens={estimatedTokens}
        limit={contextWindowLimit}
        wasCompressed={compressionInfo?.wasCompressed || false}
        originalTokens={compressionInfo?.originalTokens}
        compressedTokens={compressionInfo?.compressedTokens}
        compressing={compressing}
        onForceCompress={compressNow}
      />

      {/* 输入区 */}
      <div className="border-t border-border px-3 py-2">
        {attachments.length > 0 && <AttachmentChips attachments={attachments} onRemove={removeAttachment} />}

        {/* @ 文件选择器 */}
        {showAtPicker && atFiles.length > 0 && (
          <div className="mb-1.5 rounded-md border border-border bg-card shadow-lg max-h-36 overflow-auto">
            {atFiles.map(f => (
              <button
                key={f.path}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left"
                onClick={() => selectAtFile(f)}
              >
                <File className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        )}


        {/* 输入行 */}
        <div className="rounded-lg border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
          <textarea
            className="w-full resize-none bg-transparent px-3 pt-2 pb-0 text-sm leading-relaxed placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50 custom-scrollbar"
            rows={3}
            placeholder={localModelId ? '向本地模型提问...' : activeModel ? `向 ${activeModel.displayName} 提问...` : '请先配置模型'}
            value={input}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              if (e.key === 'Enter' && e.shiftKey) return
            }}
            disabled={!activeModel && !localModelId}
          />
          <div className="flex items-center gap-1 px-2 pb-1.5">
            <div className="relative shrink-0">
              <button
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground transition-colors"
                onClick={() => setShowModelPicker(!showModelPicker)}
                title={localModelId ? `本地: ${localModels.find(m => m.id === localModelId)?.name}` : activeModel ? `${activeModel.displayName} / ${activeModel.selectedModel}` : '选择模型'}
              >
                {localModelId ? <HardDrive className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                <span className="max-w-[60px] truncate">{localModelId ? '本地' : activeModel?.displayName || '模型'}</span>
              </button>
              <ModelPicker
                show={showModelPicker} autoMode={autoMode}
                activeModel={activeModel} localModelId={localModelId}
                configuredModels={configuredModels} localModels={localModels}
                onToggleAuto={() => setAutoMode(!autoMode)}
                onSelectCloud={(m) => { setActiveModel(m); setLocalModelId(null); setShowModelPicker(false) }}
                onSelectLocal={(id) => { setLocalModelId(id || null); if (id) setActiveModel(null as any); setShowModelPicker(false) }}
                onClose={() => setShowModelPicker(false)} pickerRef={pickerRef}
              />
            </div>
            <SkillPicker skills={skills} onToggle={async (s) => { await toggleSkill(s.id, !s.enabled); setSkills(getInstalledSkills()) }} />
            <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground transition-colors" onClick={handleUpload} title="上传文件">
              <Paperclip className="h-3 w-3" />
              <span>文件</span>
            </button>
            <div className="flex-1" />
            {loading ? (
              <button className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground transition-colors" onClick={() => abortRef.current?.abort()} title="停止生成">
                <X className="h-4 w-4" />
              </button>
            ) : (
              <button className="p-0.5 rounded text-muted-foreground/30 hover:text-muted-foreground transition-colors" onClick={handleSend} disabled={!input.trim() || (!activeModel && !localModelId)} title="发送 (Enter)">
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ====== 工具函数 ======

async function collectFiles(basePath: string, query?: string, maxDepth = 3): Promise<Array<{ name: string; path: string; isDir: boolean }>> {
  const api = window.electronAPI?.fs
  if (!api || maxDepth <= 0) return []
  const result: Array<{ name: string; path: string; isDir: boolean }> = []
  const listResult = await api.listDir(basePath)
  if (!listResult.success || !listResult.files) return result
  for (const name of listResult.files) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const childPath = `${basePath.replace(/[\\/]+$/, '')}/${name}`
    const statResult = await api.stat(childPath)
    const isDir = statResult.success && statResult.stat?.isDirectory === true
    if (!query || name.toLowerCase().includes(query)) {
      result.push({ name, path: childPath, isDir })
    }
    if (isDir && result.length < 30) {
      const sub = await collectFiles(childPath, query, maxDepth - 1)
      result.push(...sub)
    }
  }
  return result
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
