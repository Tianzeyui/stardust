/**
 * 内建核心插件——将现有功能注册到 PluginSystem
 */
import { pluginSystem } from './pluginSystem'
import type { Plugin } from './pluginTypes'

const coreChat: Plugin = {
  manifest: { id: 'chat', name: '助手', version: '1.0.0', description: '', icon: 'Bot', navOrder: 10, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'chat', label: '助手', icon: 'Bot', order: 10 })
    ctx.registerRoute('chat', () => import('@/components/ai/ChatPage'))
  },
}

const coreProjects: Plugin = {
  manifest: { id: 'projects', name: '项目', version: '1.0.0', description: '', icon: 'FolderKanban', navOrder: 15, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'projects', label: '项目', icon: 'FolderKanban', order: 15 })
    ctx.registerRoute('projects', () => import('@/components/projects/ProjectsPage'))
  },
}

const coreSkills: Plugin = {
  manifest: { id: 'skills', name: 'Skills', version: '1.0.0', description: '', icon: 'Package', navOrder: 20, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'skills', label: 'Skills', icon: 'Package', order: 20 })
    ctx.registerRoute('skills', () => import('@/components/skills/SkillsPage'))
  },
}

const coreAgents: Plugin = {
  manifest: { id: 'agents', name: 'Agents', version: '1.0.0', description: '', icon: 'Bot', navOrder: 30, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'agents', label: 'Agents', icon: 'Bot', order: 30 })
    ctx.registerRoute('agents', () => import('@/components/agents/AgentsPage'))
  },
}

const coreFiles: Plugin = {
  manifest: { id: 'files', name: '文件', version: '1.0.0', description: '', icon: 'FolderOpen', navOrder: 40, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'files', label: '文件', icon: 'FolderOpen', order: 40 })
    ctx.registerRoute('files', () => import('@/components/files/FileManagerPage'))
  },
}

const coreAI: Plugin = {
  manifest: { id: 'ai', name: '工具箱', version: '1.0.0', description: '', icon: 'MessageSquare', navOrder: 60, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'ai', label: '工具箱', icon: 'MessageSquare', order: 60 })
    ctx.registerRoute('ai', () => import('@/components/ai/AIPage'))
  },
}

const coreUsage: Plugin = {
  manifest: { id: 'usage', name: '用量统计', version: '1.0.0', description: '', icon: 'BarChart3', navOrder: 80, enabled: true },
  register(ctx) {
    ctx.registerRoute('usage', () => import('@/components/usage/UsageStatsPage'))
  },
}

const coreNotifications: Plugin = {
  manifest: { id: 'notifications', name: '通知', version: '1.0.0', description: '', icon: 'Bell', navOrder: 999, enabled: true },
  register(ctx) {
    ctx.registerRoute('notifications', () => import('@/components/notifications/NotificationsPage'))
  },
}

let initialized = false

export function initCorePlugins() {
  if (initialized) return
  initialized = true

  pluginSystem.registerCore(coreChat)
  pluginSystem.registerCore(coreProjects)
  pluginSystem.registerCore(coreSkills)
  pluginSystem.registerCore(coreAgents)
  pluginSystem.registerCore(coreFiles)
  pluginSystem.registerCore(coreAI)
  pluginSystem.registerCore(coreUsage)
  pluginSystem.registerCore(coreNotifications)

  const corePluginsPage: Plugin = {
    manifest: { id: 'plugins', name: '插件', version: '1.0.0', description: '', icon: 'Package', navOrder: 50, enabled: true },
    register(ctx) {
      ctx.registerNav({ id: 'plugins', label: '插件', icon: 'Package', order: 50 })
      ctx.registerRoute('plugins', () => import('@/components/plugins/PluginsPage'))
    },
  }
  pluginSystem.registerCore(corePluginsPage)
}
