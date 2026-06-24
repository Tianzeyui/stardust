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

const coreFiles: Plugin = {
  manifest: { id: 'files', name: '文件', version: '1.0.0', description: '', icon: 'FolderOpen', navOrder: 40, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'files', label: '文件', icon: 'FolderOpen', order: 40 })
    ctx.registerRoute('files', () => import('@/components/files/FileManagerPage'))
  },
}

const coreNotifications: Plugin = {
  manifest: { id: 'notifications', name: '通知', version: '1.0.0', description: '', icon: 'Bell', navOrder: 90, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'notifications', label: '通知', icon: 'Bell', order: 90 })
    ctx.registerRoute('notifications', () => import('@/components/notifications/NotificationsPage'))
  },
}

const corePluginsPage: Plugin = {
  manifest: { id: 'plugins', name: '插件', version: '1.0.0', description: '', icon: 'Package', navOrder: 50, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'plugins', label: '插件', icon: 'Package', order: 50 })
    ctx.registerRoute('plugins', () => import('@/components/plugins/PluginsPage'))
  },
}

export function initCorePlugins() {
  pluginSystem.registerCore(coreChat)
  pluginSystem.registerCore(coreProjects)
  pluginSystem.registerCore(coreSkills)
  pluginSystem.registerCore(coreFiles)
  pluginSystem.registerCore(corePluginsPage)
  pluginSystem.registerCore(coreNotifications)
}
