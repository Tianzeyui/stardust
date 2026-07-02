interface WelcomeHeroProps {
  /** 当前模型名，null/undefined 表示未选择 */
  modelName?: string | null
  /** 是否已配置至少一个模型 */
  hasModels: boolean
  /** 外层容器扩展样式 */
  className?: string
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 12) return '早上好'
  if (hour >= 12 && hour < 18) return '下午好'
  return '晚上好'
}

export default function WelcomeHero({ modelName, hasModels, className = '' }: WelcomeHeroProps) {
  const modelText = !hasModels
    ? '请先在设置中配置模型'
    : modelName
      ? `当前模型: ${modelName}`
      : '选择一个模型'

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <h1 className="text-4xl font-bold tracking-tight text-foreground/90">
        {getGreeting()}
      </h1>
      <p className="text-xl text-muted-foreground/70">有什么可以帮你的？</p>
      <p className="text-xs text-muted-foreground/50 mt-1">{modelText}</p>
    </div>
  )
}
