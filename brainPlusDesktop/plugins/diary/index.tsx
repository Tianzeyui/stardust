/**
 * 日记插件 — 挂载现有 DiaryPage 组件为独立插件
 */
export function register(ctx: any) {
  ctx.registerNav({ id: 'diary', label: '日记', icon: 'BookOpen', order: 60 })
  ctx.registerRoute('diary', () => import('@/components/diary/DiaryPage'))
}
