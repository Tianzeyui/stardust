/**
 * Git 工具：status / diff / log / add / reset / commit / branch / checkout
 * 在工作区根目录执行，commit 需用户确认
 */
import { jsonSchema } from 'ai'
import type { ToolMap } from './registry'
import { createFileOp, setFileOpResolver } from '@/lib/fileOpManager'

/** 工作区根（由 ChatPage 注入） */
let _workspaceRoot: string | undefined
export function setGitWorkspaceRoot(root: string) { _workspaceRoot = root }

function cwd(): string { return _workspaceRoot || process.cwd() }
function api() { return (window as any).electronAPI?.git }

async function exec(args: string[]): Promise<string> {
  const a = api()
  if (!a) return 'Git API 不可用（仅桌面版本）'
  const r = await a.exec(cwd(), args)
  return r.success ? (r.output || '').trim() : `Git 错误: ${r.error}\n${r.output || ''}`
}

async function confirmCommit(msg: string): Promise<boolean> {
  const id = 'gcm_' + Math.random().toString(36).slice(2, 8)
  const op = createFileOp(id, 'write', `git commit -m "${msg.slice(0, 60)}"`, msg)
  window.dispatchEvent(new CustomEvent('brainplus:fileop', { detail: { type: 'fileop_created', fileOp: { ...op } } }))
  const confirmed = await new Promise<boolean>(resolve => { setFileOpResolver(id, resolve) })
  if (!confirmed) {
    window.dispatchEvent(new CustomEvent('brainplus:fileop', { detail: { type: 'fileop_updated', fileOp: { ...op, status: 'rejected' } } }))
  }
  return confirmed
}

export function registerGitTools(tools: ToolMap) {
  if (!api()) return

  tools['git_status'] = {
    description: '查看 git 工作区状态：已修改、已暂存、未跟踪文件。',
    inputSchema: jsonSchema({ type: 'object', properties: {}, required: [] }),
    execute: async () => exec(['status', '--short']),
  }

  tools['git_diff'] = {
    description: '查看未暂存的差异（工作区 vs HEAD）。可选传 path 只看某个文件。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { path: { type: 'string', description: '文件路径（可选，不传则全部）' } },
      required: [],
    }),
    execute: async (args: { path?: string }) => exec(args.path ? ['diff', '--', args.path] : ['diff']),
  }

  tools['git_diff_staged'] = {
    description: '查看已暂存的差异（暂存区 vs HEAD）。',
    inputSchema: jsonSchema({ type: 'object', properties: {}, required: [] }),
    execute: async () => exec(['diff', '--staged']),
  }

  tools['git_log'] = {
    description: '查看提交历史。n 控制条数，默认 10。oneline 默认 true。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        n: { type: 'number', description: '条数，默认 10' },
        oneline: { type: 'boolean', description: '单行模式，默认 true' },
      },
      required: [],
    }),
    execute: async (args: { n?: number; oneline?: boolean }) => {
      const a = ['log', `-${args.n || 10}`]
      if (args.oneline !== false) a.push('--oneline')
      return exec(a)
    },
  }

  tools['git_add'] = {
    description: '暂存文件。path 为空则暂存全部（git add .）。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { path: { type: 'string', description: '文件路径，不传则暂存全部' } },
      required: [],
    }),
    execute: async (args: { path?: string }) => exec(args.path ? ['add', args.path] : ['add', '.']),
  }

  tools['git_reset'] = {
    description: '取消暂存。path 为空则取消全部暂存。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { path: { type: 'string', description: '文件路径，不传则取消全部暂存' } },
      required: [],
    }),
    execute: async (args: { path?: string }) => exec(args.path ? ['reset', 'HEAD', '--', args.path] : ['reset', 'HEAD']),
  }

  tools['git_commit'] = {
    description: '提交已暂存的更改。message 为提交信息。会弹出确认框由用户审批。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { message: { type: 'string', description: '提交信息' } },
      required: ['message'],
    }),
    execute: async (args: { message: string }) => {
      const ok = await confirmCommit(args.message)
      if (!ok) return '提交已被用户拒绝。'
      return exec(['commit', '-m', args.message])
    },
  }

  tools['git_branch'] = {
    description: '查看/创建/切换分支。name 为空则列分支，传入则创建新分支。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { name: { type: 'string', description: '新分支名（可选）' } },
      required: [],
    }),
    execute: async (args: { name?: string }) => exec(args.name ? ['checkout', '-b', args.name] : ['branch', '-a']),
  }

  tools['git_checkout'] = {
    description: '切换分支或恢复文件。target 为分支名或文件路径。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { target: { type: 'string', description: '分支名或文件路径' } },
      required: ['target'],
    }),
    execute: async (args: { target: string }) => exec(['checkout', args.target]),
  }

  tools['git_push'] = {
    description: '推送当前分支到远程。可指定 remote（默认 origin）和 branch（默认当前分支）。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        remote: { type: 'string', description: '远程名，默认 origin' },
        branch: { type: 'string', description: '分支名，默认当前分支' },
      },
      required: [],
    }),
    execute: async (args: { remote?: string; branch?: string }) => exec(['push', args.remote || 'origin', ...(args.branch ? [args.branch] : [])]),
  }
}
