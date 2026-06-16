import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { getPromptCode, savePromptCode, getPromptChat, savePromptChat, DEFAULT_PROMPT_CODE, DEFAULT_PROMPT_CHAT } from '@/lib/config'

export function PromptTab() {
  const [codePrompt, setCodePrompt] = useState(getPromptCode)
  const [chatPrompt, setChatPrompt] = useState(getPromptChat)

  return (
    <div className="w-full space-y-6">
      <p className="text-xs text-muted-foreground rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 border border-blue-200 dark:border-blue-900">
        系统提示词决定 AI 的行为模式。编码模式和对话模式分开配置，可根据需求自定义。
      </p>

      {/* 编码模式 */}
      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-2 text-sm font-semibold">编码模式</legend>
        <p className="text-xs text-muted-foreground leading-relaxed mb-2">编程环境中的默认模式。AI 优先使用工具直接操作代码。</p>
        <textarea
          className="w-full h-32 resize-y rounded-md border border-border bg-muted/30 px-3 py-2 text-xs font-mono leading-relaxed outline-none focus:ring-1 focus:ring-ring custom-scrollbar"
          value={codePrompt}
          onChange={e => { setCodePrompt(e.target.value); savePromptCode(e.target.value) }}
          placeholder={DEFAULT_PROMPT_CODE}
          spellCheck={false}
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground/50">{codePrompt.length} 字符</span>
          {codePrompt !== DEFAULT_PROMPT_CODE && (
            <button className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setCodePrompt(DEFAULT_PROMPT_CODE); savePromptCode(DEFAULT_PROMPT_CODE) }}>
              恢复默认
            </button>
          )}
        </div>
      </fieldset>

      {/* 对话模式 */}
      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-2 text-sm font-semibold">对话模式</legend>
        <p className="text-xs text-muted-foreground leading-relaxed mb-2">用户提问/讨论时的模式。AI 可以自由对话和解释。</p>
        <textarea
          className="w-full h-24 resize-y rounded-md border border-border bg-muted/30 px-3 py-2 text-xs font-mono leading-relaxed outline-none focus:ring-1 focus:ring-ring custom-scrollbar"
          value={chatPrompt}
          onChange={e => { setChatPrompt(e.target.value); savePromptChat(e.target.value) }}
          placeholder={DEFAULT_PROMPT_CHAT}
          spellCheck={false}
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground/50">{chatPrompt.length} 字符</span>
          {chatPrompt !== DEFAULT_PROMPT_CHAT && (
            <button className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setChatPrompt(DEFAULT_PROMPT_CHAT); savePromptChat(DEFAULT_PROMPT_CHAT) }}>
              恢复默认
            </button>
          )}
        </div>
      </fieldset>
    </div>
  )
}
