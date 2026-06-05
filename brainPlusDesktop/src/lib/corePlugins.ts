/**
 * 内建核心插件——将现有功能注册到 PluginSystem
 * 日记/灵感已拆分为独立插件（plugins/diary/、plugins/inspiration/）
 */
import { pluginSystem } from './pluginSystem'
import type { Plugin } from './pluginTypes'

const coreChat: Plugin = {
  manifest: { id: 'chat', name: 'AI 助手', version: '1.0.0', description: '', icon: 'Bot', navOrder: 10, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'chat', label: 'AI 助手', icon: 'Bot', order: 10 })
    ctx.registerRoute('chat', () => import('@/components/ai/ChatPage'))
  },
}

const coreAI: Plugin = {
  manifest: { id: 'ai', name: '工具箱', version: '1.0.0', description: '', icon: 'MessageSquare', navOrder: 20, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'ai', label: '工具箱', icon: 'MessageSquare', order: 20 })
    ctx.registerRoute('ai', () => import('@/components/ai/AIPage'))
  },
}

const coreSkills: Plugin = {
  manifest: { id: 'skills', name: 'Skills', version: '1.0.0', description: '', icon: 'Package', navOrder: 30, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'skills', label: 'Skills', icon: 'Package', order: 30 })
    ctx.registerRoute('skills', () => import('@/components/skills/SkillsPage'))
  },
}

const coreAgents: Plugin = {
  manifest: { id: 'agents', name: 'Agents', version: '1.0.0', description: '', icon: 'Bot', navOrder: 40, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'agents', label: 'Agents', icon: 'Bot', order: 40 })
    ctx.registerRoute('agents', () => import('@/components/agents/AgentsPage'))
  },
}

const coreFiles: Plugin = {
  manifest: { id: 'files', name: '文件', version: '1.0.0', description: '', icon: 'FolderOpen', navOrder: 50, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'files', label: '文件', icon: 'FolderOpen', order: 50 })
    ctx.registerRoute('files', () => import('@/components/files/FileManagerPage'))
  },
}

const coreUsage: Plugin = {
  manifest: { id: 'usage', name: '用量统计', version: '1.0.0', description: '', icon: 'BarChart3', navOrder: 80, enabled: true },
  register(ctx) {
    // 用量统计仅路由，无导航项（通过用户菜单访问）
    ctx.registerRoute('usage', () => import('@/components/usage/UsageStatsPage'))
  },
}

let initialized = false

/** 初始化所有内建插件（幂等，多次调用不会重复注册） */
export function initCorePlugins() {
  if (initialized) return
  initialized = true

  // 核心系统功能（不可停用，不在插件列表展示）
  pluginSystem.registerCore(coreChat)
  pluginSystem.registerCore(coreAI)
  pluginSystem.registerCore(coreSkills)
  pluginSystem.registerCore(coreAgents)
  pluginSystem.registerCore(coreFiles)
  pluginSystem.registerCore(coreUsage)

  // 插件管理页面
  const corePluginsPage: Plugin = {
    manifest: { id: 'plugins', name: '插件', version: '1.0.0', description: '', icon: 'Package', navOrder: 45, enabled: true },
    register(ctx) {
      ctx.registerNav({ id: 'plugins', label: '插件', icon: 'Package', order: 45 })
      ctx.registerRoute('plugins', () => import('@/components/plugins/PluginsPage'))
    },
  }
  pluginSystem.registerCore(corePluginsPage)
}
