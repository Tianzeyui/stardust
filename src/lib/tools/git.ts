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

function notifyFileOp(event: any) {
  window.dispatchEvent(new CustomEvent('brainplus:fileop', { detail: event }))
}

async function confirmCommit(msg: string): Promise<{ confirmed: boolean; id: string }> {
  const id = 'gcm_' + Math.random().toString(36).slice(2, 8)
  const op = createFileOp(id, 'write', `git commit -m "${msg.slice(0, 60)}"`, msg)
  notifyFileOp({ type: 'fileop_created', fileOp: { ...op } })
  const confirmed = await new Promise<boolean>(resolve => { setFileOpResolver(id, resolve) })
  if (!confirmed) {
    const o = { ...op, status: 'rejected' as const }
    notifyFileOp({ type: 'fileop_updated', fileOp: o })
  }
  return { confirmed, id }
}

export function registerGitTools(tools: ToolMap) {
  if (!api()) return

  tools['git_status'] = {
    description: 'Show git working tree status: modified, staged, untracked files.',
    inputSchema: jsonSchema({ type: 'object', properties: {}, required: [] }),
    execute: async () => exec(['status', '--short']),
  }

  tools['git_diff'] = {
    description: 'Show unstaged diff (working tree vs HEAD). Optional path to view single file.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { path: { type: 'string', description: 'File path (optional, all if empty)' } },
      required: [],
    }),
    execute: async (args: { path?: string }) => exec(args.path ? ['diff', '--', args.path] : ['diff']),
  }

  tools['git_diff_staged'] = {
    description: 'Show staged diff (staging area vs HEAD).',
    inputSchema: jsonSchema({ type: 'object', properties: {}, required: [] }),
    execute: async () => exec(['diff', '--staged']),
  }

  tools['git_log'] = {
    description: 'Show commit history. n=count (default 10). oneline=true by default.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        n: { type: 'number', description: 'Count, default 10' },
        oneline: { type: 'boolean', description: 'One-line mode, default true' },
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
    description: 'Stage files. Empty path stages all (git add .).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { path: { type: 'string', description: 'File path, stages all if empty' } },
      required: [],
    }),
    execute: async (args: { path?: string }) => exec(args.path ? ['add', args.path] : ['add', '.']),
  }

  tools['git_reset'] = {
    description: 'Unstage files. Empty path unstages all.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { path: { type: 'string', description: 'File path, unstages all if empty' } },
      required: [],
    }),
    execute: async (args: { path?: string }) => exec(args.path ? ['reset', 'HEAD', '--', args.path] : ['reset', 'HEAD']),
  }

  tools['git_commit'] = {
    description: 'Commit staged changes. message=commit message. User confirmation required.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { message: { type: 'string', description: 'Commit message' } },
      required: ['message'],
    }),
    execute: async (args: { message: string }) => {
      const r = await confirmCommit(args.message)
      if (!r.confirmed) return '提交已被用户拒绝。'
      const result = await exec(['commit', '-m', args.message])
      const success = !result.startsWith('Git 错误')
      notifyFileOp({ type: 'fileop_updated', fileOp: { id: r.id, type: 'write', path: `git commit`, status: success ? 'done' : 'error', error: success ? undefined : result } })
      return result
    },
  }

  tools['git_branch'] = {
    description: 'List/create/switch branches. Empty name lists all, passing name creates new branch.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { name: { type: 'string', description: 'New branch name (optional)' } },
      required: [],
    }),
    execute: async (args: { name?: string }) => exec(args.name ? ['checkout', '-b', args.name] : ['branch', '-a']),
  }

  tools['git_checkout'] = {
    description: 'Switch branch or restore file. target=branch name or file path.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { target: { type: 'string', description: 'Branch name or file path' } },
      required: ['target'],
    }),
    execute: async (args: { target: string }) => exec(['checkout', args.target]),
  }

  tools['git_push'] = {
    description: 'Push current branch to remote. Optional remote (default origin) and branch (default current).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        remote: { type: 'string', description: 'Remote name, default origin' },
        branch: { type: 'string', description: 'Branch name, default current' },
      },
      required: [],
    }),
    execute: async (args: { remote?: string; branch?: string }) => exec(['push', args.remote || 'origin', ...(args.branch ? [args.branch] : [])]),
  }
}
