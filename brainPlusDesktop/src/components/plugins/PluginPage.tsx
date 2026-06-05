/**
 * 插件页面包装器——渲染 manifest 信息 + HTML 内容
 * 支持注入宿主 API（Supabase/Cloudinary 等）和执行插件脚本
 */
import { useEffect, useRef, useMemo } from 'react'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { uploadToCloudinary, isCloudinaryConfigured, isAnySandboxEnabled, getAIModels } from '@/lib/config'

interface Props {
  manifest: { name: string; version: string; description: string }
  htmlContent: string
  pluginDir?: string   // 插件目录（用于解析相对路径 script src）
  permissions?: string[]
}

export function PluginPage({ manifest, htmlContent, pluginDir = '', permissions = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const permSet = useMemo(() => new Set(permissions), [permissions])

  // 构建该插件可用的 API 子集（按权限过滤）
  const pluginAPI = useMemo(() => {
    const api: Record<string, any> = {}
    const ea = (window as any).electronAPI

    if (permSet.has('supabase')) {
      api.supabase = {
        getClient: () => getSupabaseClient(),
        isConfigured: () => isSupabaseConfigured(),
      }
    }
    if (permSet.has('cloudinary')) {
      api.cloudinary = {
        upload: (file: File) => uploadToCloudinary(file),
        isConfigured: () => isCloudinaryConfigured(),
      }
    }
    if (permSet.has('sandbox') && isAnySandboxEnabled()) {
      api.sandbox = {
        executeJS: (code: string, packages?: string[]) => ea?.sandbox?.executeJS(code, packages) ?? Promise.reject(new Error('sandbox 不可用')),
        executePython: (code: string, packages?: string[]) => ea?.sandbox?.executePython(code, packages) ?? Promise.reject(new Error('sandbox 不可用')),
      }
    }
    // 沙箱路径校验
    const sandboxPath = (p: string) => {
      if (!pluginDir) return p
      const resolved = p.startsWith('/') ? p : `${pluginDir}/${p}`
      if (!resolved.startsWith(pluginDir)) throw new Error(`路径越界: ${p}`)
      return resolved
    }

    if (permSet.has('files')) {
      api.fs = {
        readFile: async (filePath: string) => {
          const p = sandboxPath(filePath)
          const res = await ea?.fs?.readFile(p)
          if (!res?.success) throw new Error(res?.error || '读取失败')
          return res.content
        },
        writeFile: async (filePath: string, content: string) => {
          const p = sandboxPath(filePath)
          const res = await ea?.fs?.writeFile(p, content)
          if (!res?.success) throw new Error(res?.error || '写入失败')
        },
        readFileBase64: async (filePath: string) => {
          const p = sandboxPath(filePath)
          const res = await ea?.fs?.readFileBase64(p)
          if (!res?.success) throw new Error(res?.error || '读取失败')
          return res.content
        },
        exists: async (filePath: string) => {
          const p = sandboxPath(filePath)
          return ea?.fs?.exists(p) ?? false
        },
        listDir: async (dirPath?: string) => {
          const p = sandboxPath(dirPath || '.')
          const res = await ea?.fs?.listDir(p)
          if (!res?.success) throw new Error(res?.error || '读取目录失败')
          return res.files || []
        },
        stat: async (filePath: string) => {
          const p = sandboxPath(filePath)
          const res = await ea?.fs?.stat(p)
          if (!res?.success) throw new Error(res?.error || 'stat 失败')
          return res.stat!
        },
        mkdir: async (dirPath: string) => {
          const p = sandboxPath(dirPath)
          const res = await ea?.fs?.mkdir(p)
          if (!res?.success) throw new Error(res?.error || '创建目录失败')
        },
        unlink: async (filePath: string) => {
          const p = sandboxPath(filePath)
          const res = await ea?.fs?.unlink(p)
          if (!res?.success) throw new Error(res?.error || '删除失败')
        },
      }
      api.dialog = {
        openFile: async (opts: any) => {
          const res = await ea?.dialog?.openFile(opts)
          if (!res?.success) throw new Error(res?.error || '用户取消选择')
          return res.files || []
        },
      }
      api.file = {
        convert: async (filePath: string) => {
          const res = await ea?.file?.convert(filePath)
          if (!res?.success) throw new Error(res?.error || '转换失败')
          return res.content || ''
        },
      }
    }
    if (permSet.has('ai')) {
      api.ai = {
        openModel: (url: string, iconUrl?: string) => ea?.ai?.openModel(url, iconUrl) ?? Promise.resolve(),
        chat: async (opts: any) => {
          const { getEnabledModel } = await import('@/lib/config')
          const { generateText } = await import('ai')
          const model = getEnabledModel()
          if (!model) throw new Error('未启用任何 AI 模型')
          const { createOpenAI } = await import('@ai-sdk/openai')
          const provider = createOpenAI({ apiKey: model.apiKey, baseURL: model.baseUrl || undefined })
          const result = await generateText({
            model: provider.chat(model.selectedModel || 'gpt-4o'),
            messages: [
              ...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
              ...opts.messages.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            ],
            maxOutputTokens: opts.maxTokens,
          })
          return result.text
        },
        getModelName: async () => {
          const enabled = getAIModels().find((m: any) => m.enabled && m.apiKey)
          return enabled ? `${enabled.displayName} / ${enabled.selectedModel}` : null
        },
      }
    }
    // 基础能力 — 始终可用
    api.storage = {
      get: (key: string) => localStorage.getItem(`brainplus_plugin_${key}`),
      set: (key: string, value: string) => { localStorage.setItem(`brainplus_plugin_${key}`, value) },
    }
    api.http = {
      fetch: async (url: string, opts?: any) => {
        const ea = (window as any).electronAPI
        if (!ea?.http) throw new Error('http 不可用')
        const res = await ea.http.fetch(url, opts)
        if (!res.success) throw new Error(res.error || '请求失败')
        return res.data || ''
      },
    }
    api.ui = {
      toast: (message: string, type?: string) => {
        import('@/hooks/useToast').then((m: any) => m.toast({ title: message, variant: type === 'error' ? 'destructive' : 'default' }))
      },
    }
    api.plugin = {
      getDir: () => pluginDir,
    }
    api.workspace = {
      getPaths: async () => {
        const ea2 = (window as any).electronAPI
        if (!ea2?.workspace) return { root: '~/BrainPlus/workspace', output: '~/BrainPlus/workspace/output', input: '~/BrainPlus/workspace/input' }
        return ea2.workspace.getPaths()
      },
      openFile: async (filePath: string) => { await (window as any).electronAPI?.workspace?.openFile(filePath) },
      listOutputs: async () => (window as any).electronAPI?.workspace?.listOutputs() ?? [],
    }
    return api
  }, [permSet])

  // 注入 __PLUGIN_API__ 到 window，供插件 HTML 脚本使用
  useEffect(() => {
    ;(window as any).__PLUGIN_API__ = pluginAPI
    return () => { delete (window as any).__PLUGIN_API__ }
  }, [pluginAPI])

  // 激活 <script> 标签 —— dangerlySetInnerHTML 中的 script 不会执行，
  // 需要用 createElement 重建以触发浏览器执行
  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const oldScripts = container.querySelectorAll('script')
    oldScripts.forEach(old => {
      try {
        const script = document.createElement('script')
        // 复制属性
        Array.from(old.attributes).forEach(attr => {
          script.setAttribute(attr.name, attr.value)
        })
        // 处理 src：相对路径转为 file:// 绝对路径
        if (old.src) {
          let src = old.getAttribute('src') || ''
          if (src && !/^(https?:|file:|data:|\/\/)/.test(src) && pluginDir) {
            const sep = pluginDir.endsWith('/') || pluginDir.endsWith('\\') ? '' : '/'
            src = 'file://' + pluginDir + sep + src
          }
          script.src = src
        } else {
          script.textContent = old.textContent
        }
        old.parentNode!.replaceChild(script, old)
      } catch (e: any) {
        console.error('[PluginPage] 脚本激活失败:', e.message)
      }
    })
  }, [htmlContent, pluginDir])

  return (
    <div className="flex h-full flex-col">
      {/* 顶部信息栏 */}
      <div className="flex items-center gap-2 border-b border-border px-4 h-10 shrink-0">
        <span className="text-xs font-semibold text-foreground">{manifest.name}</span>
        <span className="rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground">v{manifest.version}</span>
        {manifest.description && (
          <span className="text-[10px] text-muted-foreground/50 truncate hidden sm:block">— {manifest.description}</span>
        )}
      </div>
      {/* 页面内容区 */}
      <div ref={containerRef} className="flex-1 overflow-auto custom-scrollbar">
        <div className="p-4" dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>
    </div>
  )
}
