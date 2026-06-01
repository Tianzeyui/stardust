import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Toast } from '@/hooks/useToast'

interface ToastViewportProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg',
            'animate-slide-in-right',
            'min-w-[300px] max-w-[420px]',
            t.variant === 'destructive'
              ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
              : 'border-border bg-card text-foreground',
          )}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{t.title}</p>
            {t.description && (
              <p className="mt-0.5 text-xs opacity-80">{t.description}</p>
            )}
          </div>
          <button
            className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
            onClick={() => onDismiss(t.id)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
