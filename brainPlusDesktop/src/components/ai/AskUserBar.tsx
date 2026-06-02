import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { AskUserEvent } from '@/lib/chatService'

interface AskUserBarProps {
  askUser: AskUserEvent
  answer: string
  onAnswerChange: (value: string) => void
  onAnswer: (answer: string) => void
}

export function AskUserBar({ askUser, answer, onAnswerChange, onAnswer }: AskUserBarProps) {
  return (
    <div className="border-t border-border bg-muted/30 px-4 py-3">
      <p className="text-sm font-medium mb-2">{askUser.question}</p>

      {askUser.inputType === 'select' && Array.isArray(askUser.options) && askUser.options.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-2">
          {askUser.options.map((opt) => (
            <button
              key={opt}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              onClick={() => onAnswer(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : askUser.inputType === 'confirm' && !(Array.isArray(askUser.options) && askUser.options.length > 0) ? (
        <div className="flex gap-2 mb-2">
          <button
            className="rounded-md border border-border bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:bg-primary/90 transition-colors"
            onClick={() => onAnswer('确认')}
          >
            确认
          </button>
          <button
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            onClick={() => onAnswer('取消')}
          >
            取消
          </button>
        </div>
      ) : (
        <div className="flex gap-2 mb-2">
          <Input
            className="flex-1 h-8 text-sm"
            value={answer}
            onChange={(e) => onAnswerChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAnswer(answer.trim() || '(未输入)')
            }}
            placeholder="输入你的回答..."
            autoFocus
          />
          <Button size="sm" className="h-8" onClick={() => onAnswer(answer.trim() || '(未输入)')}>
            发送
          </Button>
        </div>
      )}
    </div>
  )
}
