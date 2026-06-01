import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, Bot, User, ChevronDown, Wrench, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { chat, getChatModel, type ChatStreamEvent } from '@/lib/chatService'
import { getAIModels, type AIModelConfig } from '@/lib/config'
import type { ModelMessage } from 'ai'
import ReactMarkdown from 'react-markdown'

interface UIMessage {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export function ChatPage() {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeModel, setActiveModel] = useState<AIModelConfig | null>(null)
  const [configuredModels, setConfiguredModels] = useState<AIModelConfig[]>([])
  const [showModelPicker, setShowModelPicker] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  // 加载已配置 Key 的模型列表
  useEffect(() => {
    const all = getAIModels()
    const withKeys = all.filter((m) => m.apiKey)
    setConfiguredModels(withKeys)
    const enabled = all.find((m) => m.enabled && m.apiKey) || withKeys[0] || null
    setActiveModel(enabled)
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading || !activeModel) return

    const userMsg: UIMessage = { role: 'user', content: input.trim() }
    const assistantMsg: UIMessage = { role: 'assistant', content: '', streaming: true }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setLoading(true)

    try {
      const history: ModelMessage[] = [...messages, userMsg]
        .filter((m) => !m.streaming)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      let streamed = ''
      await chat(history, (event: ChatStreamEvent) => {
        if (event.type === 'text-delta') {
          streamed += event.text || ''
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              last.content = streamed
              last.streaming = true
            }
            return [...next]
          })
        } else if (event.type === 'tool-call') {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              last.content = streamed + `\n\n🔧 调用工具: ${event.toolName}...`
            }
            return [...next]
          })
        }
      })

      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          last.content = streamed
          last.streaming = false
        }
        return [...next]
      })
    } catch (e: any) {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          last.content = `❌ 错误: ${e.message}`
          last.streaming = false
        }
        return [...next]
      })
    } finally {
      setLoading(false)
    }
  }, [input, loading, activeModel, messages])

  const switchModel = (model: AIModelConfig) => {
    setActiveModel(model)
    setShowModelPicker(false)
    // 切换模型时添加系统提示
    if (messages.length > 0) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant' as const, content: `_已切换到 ${model.displayName}_` },
      ])
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏：模型选择 + 模型导航 */}
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
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  请先在设置中配置 API Key
                </p>
              ) : (
                configuredModels.map((m) => (
                  <button
                    key={m.id}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent ${activeModel?.id === m.id ? 'bg-accent font-medium' : ''}`}
                    onClick={() => switchModel(m)}
                  >
                    <span className={`h-2 w-2 rounded-full ${m.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                    {m.displayName}
                    {m.enabled && <span className="ml-auto text-[10px] text-green-600">已启用</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {activeModel?.selectedModel && (
            <span className="font-mono">{activeModel.selectedModel}</span>
          )}
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Bot className="h-16 w-16 opacity-20" />
            <p className="text-lg font-medium">AI 助手</p>
            <p className="text-sm">
              {configuredModels.length === 0
                ? '请先在设置中配置 AI 模型的 API Key'
                : activeModel
                  ? `当前模型: ${activeModel.displayName}`
                  : '请选择一个模型开始对话'}
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
                <div
                  className={`rounded-lg px-4 py-2.5 text-sm max-w-[85%] ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-code:bg-background prose-code:rounded prose-code:px-1">
                      <ReactMarkdown>{msg.content || (msg.streaming ? '...' : '')}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
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
