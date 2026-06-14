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
      description: `在安全沙箱执行 JS。可传 packages 参数安装 npm 包 (如 ["pptxgenjs"])。无需包时用 Worker 线程快速执行。输出到工作区 output/ 目录。`,
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          code: { type: 'string', description: 'JS/TS 代码' },
          packages: { type: 'array', items: { type: 'string' }, description: 'npm 包名列表' },
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
      description: `使用 Python 3/uv 执行。可传 packages 自动 pip install。输出到工作区 output/ 目录。有第三方库需求时优先用此工具。`,
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python 代码' },
          packages: { type: 'array', items: { type: 'string' }, description: '需要的 pip 包列表（需 uv 支持）' },
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
