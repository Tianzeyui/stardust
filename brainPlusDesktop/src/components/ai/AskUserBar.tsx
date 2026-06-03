import { useState, useCallback, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import type { AskUserEvent } from '@/lib/chatService'

interface AskUserBarProps {
  askUser: AskUserEvent
  answer: string
  onAnswerChange: (value: string) => void
  onAnswer: (answer: string) => void
}

/** 多问题模式下每个问题的答案 */
type Answers = Record<string, string>

export function AskUserBar({ askUser, answer, onAnswerChange, onAnswer }: AskUserBarProps) {
  const [answers, setAnswers] = useState<Answers>({})
  const [visible, setVisible] = useState(false)

  // 挂载时触发入场动画
  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const isMultiQuestion = !!(askUser.questions && askUser.questions.length > 0)

  // 单问题旧格式的提交
  const submitSingle = useCallback(() => {
    onAnswer(answer.trim() || '(未输入)')
  }, [answer, onAnswer])

  // 多问题格式的提交：结构化组织答案
  const submitMulti = useCallback(() => {
    if (!askUser.questions) return
    const parts = askUser.questions.map((q) => {
      const val = answers[q.id]?.trim() || ''
      return `【${q.label}】${val || '(未填写)'}`
    })
    onAnswer(parts.join('\n'))
  }, [answers, askUser.questions, onAnswer])

  // 旧格式：单问题
  if (!isMultiQuestion) {
    const q = askUser.question || '请提供信息'
    const type = askUser.inputType || 'input'

    return (
      <div className={`border-t border-border bg-muted/30 px-4 py-3 transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
        <div className="flex items-center gap-2 mb-2">
          <Loader2 className="h-3 w-3 animate-spin text-primary/60" />
          <p className="text-[10px] text-muted-foreground/60">等待你的回复...</p>
        </div>
        <p className="text-sm font-medium mb-2">{q}</p>

        {type === 'select' && Array.isArray(askUser.options) && askUser.options.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {askUser.options.map((opt) => (
              <button key={opt}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                onClick={() => onAnswer(opt)}>
                {opt}
              </button>
            ))}
          </div>
        ) : type === 'confirm' ? (
          <div className="flex gap-2">
            <button className="rounded-md border border-border bg-primary text-primary-foreground px-4 py-1.5 text-sm hover:bg-primary/90"
              onClick={() => onAnswer('确认')}>确认</button>
            <button className="rounded-md border border-border bg-card px-4 py-1.5 text-sm hover:bg-accent"
              onClick={() => onAnswer('取消')}>取消</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input className="flex-1 h-8 text-sm" value={answer} onChange={(e) => onAnswerChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitSingle() }}
              placeholder="输入你的回答..." autoFocus />
            <Button size="sm" className="h-8" onClick={submitSingle}>发送</Button>
          </div>
        )}
      </div>
    )
  }

  // 新格式：多问多答
  return (
    <div className={`border-t border-border bg-muted/30 px-4 py-3 transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Loader2 className="h-3 w-3 animate-spin text-primary/60" />
        <p className="text-[10px] text-muted-foreground/60">等待你的回复...</p>
      </div>
      {askUser.title && (
        <p className="text-sm font-semibold mb-3">{askUser.title}</p>
      )}

      <div className="space-y-3 mb-3">
        {askUser.questions!.map((q) => (
          <div key={q.id}>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {q.label}{q.required !== false ? ' *' : ''}
            </label>

            {q.inputType === 'select' && Array.isArray(q.options) && q.options.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => (
                  <button key={opt}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      answers[q.id] === opt
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card hover:bg-accent'
                    }`}
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : q.inputType === 'confirm' ? (
              <div className="flex gap-2">
                <button
                  className={`rounded-md border px-3 py-1 text-xs transition-colors ${
                    answers[q.id] === '确认' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-accent'
                  }`}
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: '确认' }))}>确认</button>
                <button
                  className={`rounded-md border px-3 py-1 text-xs transition-colors ${
                    answers[q.id] === '取消' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-accent'
                  }`}
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: '取消' }))}>取消</button>
              </div>
            ) : (
              <Input
                className="h-8 text-sm"
                value={answers[q.id] || ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') submitMulti() }}
                placeholder={q.placeholder || `输入${q.label}...`}
                autoFocus
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={submitMulti}>
          提交{askUser.questions!.length > 1 ? ` (${askUser.questions!.length}项)` : ''}
        </Button>
      </div>
    </div>
  )
}
