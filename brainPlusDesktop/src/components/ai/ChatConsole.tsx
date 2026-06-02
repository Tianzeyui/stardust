import { Terminal } from 'lucide-react'
import type { ConsoleLine } from '@/types/chat'

interface ChatConsoleProps {
  lines: ConsoleLine[]
  onClose: () => void
}

export function ChatConsole({ lines, onClose }: ChatConsoleProps) {
  return (
    <div className="border-t border-border">
      <div className="flex items-center justify-between px-4 py-1">
        <button
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={onClose}
          title="隐藏控制台"
        >
          <Terminal className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-40 overflow-auto border-t border-border bg-black/90 px-4 py-2 font-mono text-[11px] leading-relaxed">
        {lines.length === 0 ? (
          <span className="text-gray-600">(空)</span>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className={`flex gap-2 ${
                line.status === 'error' ? 'text-red-400'
                : line.status === 'ok' ? 'text-green-400'
                : line.status === 'running' ? 'text-yellow-400'
                : 'text-gray-400'
              }`}
            >
              <span className="shrink-0 text-gray-600 w-16">{line.time}</span>
              <span className="shrink-0">{line.icon}</span>
              <span className="whitespace-pre-wrap break-all">{line.msg}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
