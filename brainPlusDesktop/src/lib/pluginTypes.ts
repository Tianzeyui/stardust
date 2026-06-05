/**
 * 插件系统类型定义
 */
import type { ComponentType } from 'react'

export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  icon: string            // lucide-react 图标名
  navOrder: number        // 导航排序，越小越前
  enabled: boolean
  permissions?: string[]
  systemHeader?: boolean   // 是否使用系统顶栏，默认 true
}

export interface NavItemDef {
  id: string
  label: string
  icon: string
  order: number
}

/** 插件可访问的 Supabase API（需声明 supabase 权限） */
export interface PluginSupabaseAPI {
  getClient(): any                          // SupabaseClient | null
  isConfigured(): boolean
}

/** 插件可访问的 Cloudinary API（需声明 cloudinary 权限） */
export interface PluginCloudinaryAPI {
  upload(file: File): Promise<string>       // 返回 secure_url
  isConfigured(): boolean
}

/** 插件可访问的宿主 API */
export interface PluginAPI {
  supabase: PluginSupabaseAPI
  cloudinary: PluginCloudinaryAPI
  sandbox: {
    executeJS: (code: string, packages?: string[]) => Promise<any>
    executePython: (code: string, packages?: string[]) => Promise<any>
  }
  fs: {
    readFile: (filePath: string) => Promise<string>
    writeFile: (filePath: string, content: string) => Promise<void>
    readFileBase64: (filePath: string) => Promise<string>
    exists: (filePath: string) => Promise<boolean>
    listDir: (dirPath?: string) => Promise<string[]>
    stat: (filePath: string) => Promise<{ isFile: boolean; isDirectory: boolean; size: number; mtime: string }>
    mkdir: (dirPath: string) => Promise<void>
    unlink: (filePath: string) => Promise<void>
  }
  dialog: {
    /** 打开文件选择对话框，返回选中的文件路径数组 */
    openFile: (opts?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string[]>
  }
  file: {
    /** 将文档（docx/pdf/xlsx 等）转换为 Markdown 文本 */
    convert: (filePath: string) => Promise<string>
  }
  storage: {
    get: (key: string) => string | null
    set: (key: string, value: string) => void
  }
  http: {
    /** 主进程代理 HTTP 请求，绕过 CORS */
    fetch: (url: string, opts?: { method?: string; headers?: Record<string, string>; body?: string; timeout?: number }) => Promise<string>
  }
  ui: {
    /** 弹出 Toast 通知 */
    toast: (message: string, type?: 'success' | 'error' | 'info') => void
  }
  workspace: {
    getPaths: () => Promise<{ root: string; output: string; input: string }>
    openFile: (filePath: string) => Promise<void>
    listOutputs: () => Promise<Array<{ name: string; path: string; size: number }>>
  }
  plugin: {
    /** 获取插件自身的安装目录路径 */
    getDir: () => string
  }
  ai: {
    openModel: (url: string, iconUrl?: string) => Promise<void>
    chat: (opts: { messages: Array<{ role: string; content: string }>; system?: string; maxTokens?: number }) => Promise<string>
    getModelName: () => Promise<string | null>
  }
}

export interface PluginContext {
  registerNav(item: NavItemDef): void
  registerRoute(id: string, loader: () => Promise<any>): void
  /** 注册 AI 工具（注入到聊天工具列表，与 MCP/沙箱同级） */
  onToolRegister(fn: (tools: Record<string, any>) => void): void
  /** 宿主 API（Supabase / Cloudinary / 沙箱 / FS / AI） */
  api: PluginAPI
}

export interface Plugin {
  manifest: PluginManifest
  register(ctx: PluginContext): void
}
