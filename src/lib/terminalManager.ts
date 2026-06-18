/**
 * 终端进程管理器：跟踪运行中的命令，支持挂起/终止
 */
import type { TerminalStatus } from '@/types/chat'

const processes = new Map<string, TerminalStatus>()
const resolvers = new Map<string, (confirmed: boolean, persist?: boolean) => void>()
let _uiHandler: ((event: any) => void) | null = null

export function setTerminalUIHandler(handler: ((event: any) => void) | null) {
  _uiHandler = handler
}

function notifyUI(event: any) {
  _uiHandler?.(event)
}

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

export function rejectAll(): void {
  for (const [id, resolve] of resolvers) {
    resolve(false)
    const t = processes.get(id)
    if (t) notifyUI({ type: 'terminal_updated', terminal: { ...t } })
  }
  resolvers.clear()
}

export async function killAll(): Promise<void> {
  rejectAll()
  const api = (window as any).electronAPI?.terminal
  if (!api?.kill) {
    console.warn('[terminal] kill API not available')
    return
  }
  for (const [id, t] of processes) {
    if (t.status === 'running' || t.status === 'pending_confirm') {
      updateTerminal(id, { status: 'cancelled', endTime: Date.now() })
      notifyUI({ type: 'terminal_updated', terminal: { ...processes.get(id)! } })
      console.log(`[terminal] killing ${id}: ${t.command}`)
      api.kill(id).catch((e: any) => console.warn(`[terminal] kill failed for ${id}:`, e))
    }
  }
}

export async function killTerminal(id: string): Promise<void> {
  reject(id)
  const t = processes.get(id)
  if (t) {
    updateTerminal(id, { status: 'cancelled', endTime: Date.now() })
    notifyUI({ type: 'terminal_updated', terminal: { ...processes.get(id)! } })
  }
  const api = (window as any).electronAPI?.terminal
  if (api?.kill) {
    console.log(`[terminal] killTerminal ${id}`)
    api.kill(id).catch((e: any) => console.warn(`[terminal] killTerminal failed:`, e))
  }
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
