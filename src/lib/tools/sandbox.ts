/**
 * 沙箱执行工具：JS (Node.js + npm 包) 和 Python (uv)
 * 各语言由独立开关控制
 */
import { jsonSchema } from 'ai'
import type { ToolMap } from './registry'
import { getJSSandboxEnabled, getPythonSandboxEnabled } from '../config'

/** 模块级：当前沙箱输出目录（由 ChatPage 注入） */
let _sandboxOutputDir: string | undefined
export function setSandboxOutputDir(dir: string | undefined) { _sandboxOutputDir = dir }

export async function registerSandboxTools(tools: ToolMap) {
  if (!window.electronAPI?.sandbox) return

  if (getJSSandboxEnabled()) {
    tools['sandbox_execute_js'] = {
      description: `Execute JS in sandbox. Pass packages to install npm deps (e.g. ["pptxgenjs"]). Uses Worker thread for fast execution. Output to .brainplus/output/.`,
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          code: { type: 'string', description: 'JS/TS code' },
          packages: { type: 'array', items: { type: 'string' }, description: 'npm package names' },
        },
        required: ['code'],
      }),
      execute: async ({ code, packages }: { code: string; packages?: string[] }) => {
        const res = await window.electronAPI!.sandbox.executeJS(code, packages, _sandboxOutputDir)
        return res.success ? res.result : `JS sandbox error: ${res.error}`
      },
    }
  }

  if (getPythonSandboxEnabled()) {
    tools['sandbox_execute_python'] = {
      description: `Execute Python 3/uv. Pass packages for auto pip install. Output to .brainplus/output/. Prefer this for third-party lib needs.`,
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python code' },
          packages: { type: 'array', items: { type: 'string' }, description: 'pip package names (requires uv)' },
        },
        required: ['code'],
      }),
      execute: async ({ code, packages }: { code: string; packages?: string[] }) => {
        const res = await window.electronAPI!.sandbox.executePython(code, packages, _sandboxOutputDir)
        return res.success ? res.result : `Python sandbox error: ${res.error}`
      },
    }
  }
}
