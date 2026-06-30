/**
 * 终端工具：run_terminal + check_terminal
 * 助手可执行终端命令，需用户确认。支持同步/异步。
 */
import { jsonSchema } from '../api'
import type { ToolMap } from './registry'
import { getTerminalEnabled } from '@/lib/config'
import { createTerminal, updateTerminal, getTerminal, setResolver } from '@/lib/terminalManager'
import { getTerminalUIHandler } from '@/lib/chatService'

let _termWorkspaceRoot = ''
export function setTermWorkspaceRoot(root: string) { if (root) _termWorkspaceRoot = root }

function notifyUI(event: any) {
  getTerminalUIHandler()?.(event)
}

export function registerTerminalTool(tools: ToolMap) {
  if (!getTerminalEnabled()) return

  tools['run_terminal'] = {
    description: 'Execute a shell command and return the output. Use for: package installs (npm/pip), build commands, test runners, git operations. NOT for file reading/editing/searching — use the dedicated workspace_* tools.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory. Default: project root' },
      },
      required: ['command'],
    }),
    execute: async ({ command, cwd }: { command: string; cwd?: string }) => {
      const id = 'term_' + Math.random().toString(36).slice(2, 8)
      const workDir = cwd || _termWorkspaceRoot || '.'
      const term = createTerminal(id, command, workDir, false)
      const permApi = (window as any).electronAPI?.perm
      const cmdPattern = command.split(/\s+/)[0] || command

      let alreadyAllowed = false
      try { if (permApi) alreadyAllowed = await permApi.check(_termWorkspaceRoot, 'terminal', cmdPattern) } catch {}

      let confirmed = alreadyAllowed
      if (alreadyAllowed) {
        notifyUI({ type: 'terminal_created', terminal: { ...term } })
      } else {
        notifyUI({ type: 'terminal_created', terminal: { ...term } })
        confirmed = await new Promise<boolean>((resolve) => {
          setResolver(id, async (ok, persist) => {
            if (persist) try { await permApi?.grant(_termWorkspaceRoot, 'terminal', cmdPattern) } catch {}
            resolve(ok)
          })
          notifyUI({ type: 'terminal_confirm', terminal: { ...term } })
        })
        if (!confirmed) {
          updateTerminal(id, { status: 'cancelled', endTime: Date.now() })
          notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
          return `命令已被用户取消。`
        }
      }

      updateTerminal(id, { status: 'running' })
      notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })

      const api = (window as any).electronAPI?.terminal
      if (!api) {
        updateTerminal(id, { status: 'error', stderr: '终端 API 不可用', endTime: Date.now() })
        notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
        return '终端命令仅在桌面版本可用。'
      }

      try {
        const result = await api.execute(id, command, workDir)
        const wasCancelled = getTerminal(id)?.status === 'cancelled'
        updateTerminal(id, {
          status: wasCancelled ? 'cancelled' : result.success ? 'done' : 'error',
          stdout: result.stdout || '', stderr: result.stderr || result.error || '',
          exitCode: result.exitCode ?? (result.success ? 0 : -1), endTime: Date.now(),
        })
        if (wasCancelled) return '用户已取消该命令。'
      } catch (e: any) {
        updateTerminal(id, { status: 'error', stderr: e.message || '执行异常', endTime: Date.now() })
      }

      notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
      const t = getTerminal(id)!
      return `命令执行${t.status === 'done' ? '完成' : '失败'} (exit ${t.exitCode ?? '?'})。\n${t.stdout ? 'stdout:\n' + t.stdout.slice(0, 2000) : ''}${t.stderr ? '\nstderr:\n' + t.stderr.slice(0, 1000) : ''}`
    },
  }

  tools['check_terminal'] = {
    description: 'View output of a previously run terminal command by its ID.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        terminal_id: { type: 'string', description: 'Terminal command ID from run_terminal output' },
      },
      required: ['terminal_id'],
    }),
    execute: async ({ terminal_id }: { terminal_id: string }) => {
      const api = (window as any).electronAPI?.terminal
      const local = getTerminal(terminal_id)
      if (local) {
        return `终端 ${terminal_id}: ${local.status === 'running' ? '执行中' : local.status === 'done' ? '已完成' : local.status === 'error' ? '失败' : local.status} (exit ${local.exitCode ?? '?'})\n${local.stdout ? 'stdout:\n' + local.stdout.slice(0, 2000) : ''}${local.stderr ? '\nstderr:\n' + local.stderr.slice(0, 1000) : ''}`
      }
      if (api) {
        const r = await api.check(terminal_id)
        if (r.found) {
          return `终端 ${terminal_id}: ${r.done ? '已完成' : '执行中'} (exit ${r.exitCode ?? '?'})\n${r.stdout ? 'stdout:\n' + r.stdout.slice(0, 2000) : ''}${r.stderr ? '\nstderr:\n' + r.stderr.slice(0, 1000) : ''}`
        }
      }
      return `未找到终端 ${terminal_id}。`
    },
  }
}
