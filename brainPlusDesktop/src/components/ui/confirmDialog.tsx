import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title, description, confirmLabel = '确认', cancelLabel = '取消',
  variant = 'default', onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onCancel}>
      <div className="rounded-lg border border-border bg-card shadow-lg w-[360px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onCancel}>{cancelLabel}</Button>
          <Button
            size="sm"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            className="h-8 text-xs"
            onClick={() => { onConfirm(); onCancel() }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
