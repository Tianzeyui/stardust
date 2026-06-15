/**
 * 终端工具：run_terminal + check_terminal
 * 助手可执行终端命令，需用户确认。支持同步/异步。
 */
import { jsonSchema } from 'ai'
import type { ToolMap } from './registry'
import { getTerminalEnabled } from '@/lib/config'
import { createTerminal, updateTerminal, getTerminal, setResolver } from '@/lib/terminalManager'
import { getTerminalUIHandler } from '@/lib/chatService'

function notifyUI(event: any) {
  getTerminalUIHandler()?.(event)
}

export function registerTerminalTool(tools: ToolMap) {
  if (!getTerminalEnabled()) return

  tools['run_terminal'] = {
    description: '执行终端命令。需用户确认后执行。mode="sync"(默认)等待完成返回结果；mode="async"立即返回terminal_id，长任务推荐async，稍后用 check_terminal 查看输出。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 shell 命令' },
        cwd: { type: 'string', description: '工作目录。默认项目根目录' },
        mode: { type: 'string', description: 'sync=等待完成, async=后台执行。默认sync' },
      },
      required: ['command'],
    }),
    execute: async ({ command, cwd, mode }: { command: string; cwd?: string; mode?: string }) => {
      const id = 'term_' + Math.random().toString(36).slice(2, 8)
      const isAsync = mode === 'async'
      const term = createTerminal(id, command, cwd || undefined, isAsync)

      notifyUI({ type: 'terminal_created', terminal: { ...term } })

      const confirmed = await new Promise<boolean>((resolve) => {
        setResolver(id, resolve)
        notifyUI({ type: 'terminal_confirm', terminal: { ...term } })
      })

      if (!confirmed) {
        updateTerminal(id, { status: 'cancelled', endTime: Date.now() })
        notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
        return `命令已被用户取消。`
      }

      updateTerminal(id, { status: 'running' })
      notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })

      const api = (window as any).electronAPI?.terminal
      if (!api) {
        updateTerminal(id, { status: 'error', stderr: '终端 API 不可用', endTime: Date.now() })
        notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
        return '终端命令仅在桌面版本可用。'
      }

      if (isAsync) {
        const result = await api.spawn(id, command, cwd || '')
        if (!result.success) {
          updateTerminal(id, { status: 'error', stderr: result.error || '启动失败', endTime: Date.now() })
          notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
          return `异步执行启动失败: ${result.error}`
        }
        const unsub = api.onOutput?.((data: any) => {
          if (data.id !== id) return
          updateTerminal(id, {
            stdout: data.stdout || '', stderr: data.stderr || '',
            status: data.done ? (data.exitCode === 0 ? 'done' : 'error') : 'running',
            exitCode: data.exitCode, endTime: data.done ? Date.now() : undefined,
          })
          notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
          if (data.done) unsub?.()
        })
        return `命令正在后台异步执行 (terminal_id: ${id})。用 check_terminal("${id}") 查看输出。`
      }

      // 同步模式
      try {
        const result = await api.execute(id, command, cwd || '')
        updateTerminal(id, {
          status: result.success ? 'done' : 'error',
          stdout: result.stdout || '', stderr: result.stderr || result.error || '',
          exitCode: result.exitCode ?? (result.success ? 0 : -1), endTime: Date.now(),
        })
      } catch (e: any) {
        updateTerminal(id, { status: 'error', stderr: e.message || '执行异常', endTime: Date.now() })
      }

      notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
      const t = getTerminal(id)!
      return `命令执行${t.status === 'done' ? '完成' : '失败'} (exit ${t.exitCode ?? '?'})。\n${t.stdout ? 'stdout:\n' + t.stdout.slice(0, 2000) : ''}${t.stderr ? '\nstderr:\n' + t.stderr.slice(0, 1000) : ''}`
    },
  }

  tools['check_terminal'] = {
    description: '查看异步终端命令的当前输出和状态。传入 run_terminal(mode="async") 返回的 terminal_id。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        terminal_id: { type: 'string', description: '异步终端命令的 ID' },
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
