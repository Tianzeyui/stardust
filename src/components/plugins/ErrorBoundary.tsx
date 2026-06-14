import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  pluginName?: string
}

interface State {
  hasError: boolean
  error: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message || String(error) }
  }

  componentDidCatch(error: Error, info: any) {
    const name = this.props.pluginName || '未知插件'
    console.error(`[ErrorBoundary] 插件 "${name}" 崩溃:`, error.message, info?.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b border-border px-4 h-10 shrink-0">
            <span className="text-xs font-semibold text-destructive">{this.props.pluginName || '插件'}</span>
            <span className="rounded bg-destructive/10 px-1.5 py-px text-[10px] text-destructive">崩溃</span>
          </div>
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="flex flex-col items-center gap-3 text-center max-w-md">
              <AlertTriangle className="h-8 w-8 text-destructive/60" />
              <div>
                <p className="text-sm font-medium text-foreground mb-1">插件页面崩溃</p>
                <p className="text-xs text-muted-foreground leading-relaxed break-all">
                  {this.state.error || '未知错误'}
                </p>
              </div>
              <button
                className="rounded px-3 py-1.5 text-xs border border-border hover:bg-accent transition-colors"
                onClick={() => this.setState({ hasError: false, error: '' })}
              >
                重试
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
