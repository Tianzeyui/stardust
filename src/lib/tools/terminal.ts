/**
 * 终端工具：run_terminal + check_terminal
 * 助手可执行终端命令，需用户确认。支持同步/异步。
 */
import { jsonSchema } from 'ai'
import type { ToolMap } from './registry'
import { getTerminalEnabled } from '@/lib/config'
import { createTerminal, updateTerminal, getTerminal, setResolver } from '@/lib/terminalManager'
import { getTerminalUIHandler } from '@/lib/chatService'

let _termWorkspaceRoot = ''
export function setTermWorkspaceRoot(root: string) { _termWorkspaceRoot = root }

function notifyUI(event: any) {
  getTerminalUIHandler()?.(event)
}

export function registerTerminalTool(tools: ToolMap) {
  if (!getTerminalEnabled()) return

  tools['run_terminal'] = {
    description: '执行终端命令。mode="sync"等待完成(默认)；mode="async"后台执行；mode="interactive"给用户开交互终端——终端气泡出现$输入框，用户在框里自己打字，AI不要调用run_terminal_input。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 shell 命令。需要用户参与输入的程序(npm init/python REPL/ssh等)用 interactive=true。交互模式下不要调用 run_terminal_input，用户自己在终端输入。' },
        cwd: { type: 'string', description: '工作目录。默认项目根目录' },
        mode: { type: 'string', description: 'sync=等待完成, async=后台执行, interactive=PTY交互。默认sync' },
        input: { type: 'string', description: '交互模式下发送给进程的输入（仅 interactive=true 时有效）' },
      },
      required: ['command'],
    }),
    execute: async ({ command, cwd, mode }: { command: string; cwd?: string; mode?: string }) => {
      const id = 'term_' + Math.random().toString(36).slice(2, 8)
      const isAsync = mode === 'async'
      const term = createTerminal(id, command, cwd || undefined, isAsync)
      const permApi = (window as any).electronAPI?.perm
      const cmdPattern = command.split(/\s+/)[0] || command

      // 权限预检：已授权则跳过确认
      let alreadyAllowed = false
      try { if (permApi) alreadyAllowed = await permApi.check(_termWorkspaceRoot, 'terminal', cmdPattern) } catch {}

      let confirmed = alreadyAllowed
      if (alreadyAllowed) {
        // 已授权也发 created 事件，否则 UI 没有终端气泡
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

      // 交互模式（PTY）
      if (mode === 'interactive') {
        const result = await api.ptySpawn(id, command, cwd || '')
        if (!result.success) {
          updateTerminal(id, { status: 'error', stderr: result.error || 'PTY启动失败', endTime: Date.now() })
          notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
          return `交互终端启动失败: ${result.error}`
        }
        updateTerminal(id, { status: 'running' })
        notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
        const unsub = api.onPtyOutput?.((data: any) => {
          if (data.id !== id) return
          const t = getTerminal(id)
          if (t) {
            updateTerminal(id, {
              stdout: (t.stdout || '') + data.data,
              status: data.done ? (data.exitCode === 0 ? 'done' : 'error') : 'running',
              exitCode: data.exitCode,
              endTime: data.done ? Date.now() : undefined,
            })
            notifyUI({ type: 'terminal_updated', terminal: { ...getTerminal(id)! } })
            if (data.done) unsub?.()
          }
        })
        return `交互终端已启动 (terminal_id: ${id})。用户正在 $ 输入框中操作。记住此 ID，用户结束后用 check_terminal("${id}") 查看输出历史。`
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

  tools['run_terminal_input'] = {
    description: '向交互终端发送输入。仅在用户明确要求"帮我发命令"时使用。正常情况下用户自己在$输入框打字，AI不要调用此工具。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        terminal_id: { type: 'string', description: '交互终端的 ID' },
        input: { type: 'string', description: '要发送的文本，自动追加换行' },
      },
      required: ['terminal_id', 'input'],
    }),
    execute: async ({ terminal_id, input }: { terminal_id: string; input: string }) => {
      const api = (window as any).electronAPI?.terminal
      if (!api?.ptyWrite) return 'PTY API 不可用'
      await api.ptyWrite(terminal_id, input + '\n')
      return `✅ 已发送 "${input}" 到终端 ${terminal_id}`
    },
  }
}
