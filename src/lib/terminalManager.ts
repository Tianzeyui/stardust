/**
 * 终端进程管理器：跟踪运行中的命令，支持挂起/终止
 */
import type { TerminalStatus } from '@/types/chat'

const processes = new Map<string, TerminalStatus>()
const resolvers = new Map<string, (confirmed: boolean, persist?: boolean) => void>()

export function createTerminal(id: string, command: string, cwd?: string, isAsync?: boolean): TerminalStatus {
  const status: TerminalStatus = {
    id,
    command,
    cwd,
    status: 'pending_confirm',
    async: isAsync,
    stdout: '',
    stderr: '',
    startTime: Date.now(),
  }
  processes.set(id, status)
  return status
}

export function getTerminal(id: string): TerminalStatus | undefined {
  return processes.get(id)
}

export function updateTerminal(id: string, patch: Partial<TerminalStatus>): void {
  const t = processes.get(id)
  if (t) Object.assign(t, patch)
}

export function setResolver(id: string, resolve: (confirmed: boolean) => void): void {
  resolvers.set(id, resolve)
}

export function confirm(id: string, persist?: boolean): void {
  resolvers.get(id)?.(true, persist)
  resolvers.delete(id)
}

export function reject(id: string): void {
  resolvers.get(id)?.(false)
  resolvers.delete(id)
}

export function removeTerminal(id: string): void {
  processes.delete(id)
  resolvers.delete(id)
}

export function getRunningCount(): number {
  let count = 0
  for (const t of processes.values()) {
    if (t.status === 'running') count++
  }
  return count
}
