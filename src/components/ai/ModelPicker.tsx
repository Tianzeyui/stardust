import type { AIModelConfig } from '@/lib/config'

interface ModelPickerProps {
  show: boolean
  autoMode: boolean
  activeModel: AIModelConfig | null
  configuredModels: AIModelConfig[]
  onToggleAuto: () => void
  onSelectCloud: (model: AIModelConfig) => void
  onClose: () => void
  pickerRef: React.Ref<HTMLDivElement>
  routeLabel?: string // 路由信息，如 "Fast 1"
}

export function ModelPicker({
  show, autoMode, activeModel,
  configuredModels,
  onToggleAuto, onSelectCloud, onClose,
  pickerRef, routeLabel,
}: ModelPickerProps) {
  if (!show) return null

  return (
    <div ref={pickerRef} className="absolute left-0 bottom-full z-50 mb-1 w-72 rounded-lg border border-border bg-card shadow-lg">
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-border cursor-pointer hover:bg-muted/50 rounded-t-lg"
        onClick={onToggleAuto}
      >
        <span className="text-xs">Auto 自动调配</span>
        <div className="flex items-center gap-2">
          {autoMode && routeLabel && (
            <span className="text-[9px] text-muted-foreground/50">{routeLabel}</span>
          )}
          <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${autoMode ? 'bg-primary' : 'bg-muted'}`}>
            <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${autoMode ? 'translate-x-3' : 'translate-x-0.5'}`} />
          </span>
        </div>
      </div>

      <div className="max-h-64 overflow-auto p-1">
        {configuredModels.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground text-center">请先在设置中配置 AI 模型</p>
        ) : (
          configuredModels.map((provider) => (
            <div key={provider.id} className="mb-1 last:mb-0">
              <div className="px-2 py-0.5">
                <span className="text-[10px] text-muted-foreground/50 font-medium tracking-wide uppercase">
                  {provider.name}
                </span>
              </div>
              {provider.availableModels?.length > 0 ? (
                provider.availableModels.map((m) => {
                  const isActive = activeModel?.id === provider.id && activeModel?.selectedModel === m.id
                  return (
                    <button key={m.id}
                      className={`flex items-center gap-2 w-full text-left px-2 py-1 rounded text-xs transition-colors ${isActive ? 'bg-accent' : 'hover:bg-muted/50'}`}
                      onClick={() => { onSelectCloud({ ...provider, selectedModel: m.id, enabled: true }); onClose() }}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full border-2 shrink-0 transition-colors ${isActive ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`} />
                      <span className="flex-1 truncate">{m.id}</span>
                      {m.contextWindow ? <span className="text-[10px] text-muted-foreground/50 shrink-0">{(m.contextWindow / 1000).toFixed(0)}k</span> : null}
                    </button>
                  )
                })
              ) : (
                <button
                  className={`flex items-center gap-2 w-full text-left px-2 py-1 rounded text-xs transition-colors ${activeModel?.id === provider.id ? 'bg-accent' : 'hover:bg-muted/50'}`}
                  onClick={() => { onSelectCloud(provider); onClose() }}
                >
                  <span className={`h-2.5 w-2.5 rounded-full border-2 shrink-0 transition-colors ${activeModel?.id === provider.id ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`} />
                  <span className="flex-1 truncate">{provider.selectedModel || '默认'}</span>
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
