/**
 * 灵感插件 — 挂载现有 InspirationPage 组件为独立插件
 */
export function register(ctx: any) {
  ctx.registerNav({ id: 'inspiration', label: '灵感', icon: 'Lightbulb', order: 70 })
  ctx.registerRoute('inspiration', () => import('@/components/inspiration/InspirationPage'))
}
