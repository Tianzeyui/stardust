import { MessageSquare } from 'lucide-react'

export function AIPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
        <MessageSquare className="h-10 w-10 text-primary/60" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">AI 助手</h2>
        <p className="mt-2 text-sm">在左侧选择应用开始使用</p>
      </div>
    </div>
  )
}
