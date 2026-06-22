/**
 * A2A (Agent-to-Agent) IPC handler
 */
import { ipcMain } from 'electron'
import {
  completeA2ATask,
  getA2ATask,
  syncAgents,
  startA2AServer,
  stopA2AServer,
  setA2AToken,
} from '../main/a2aServer.js'

export function registerA2aIpc(): void {
  ipcMain.handle('a2a:completeTask', (_e, taskId: string, output: string, error?: string) => {
    completeA2ATask(taskId, output, error)
    return true
  })

  ipcMain.handle('a2a:getTask', (_e, taskId: string) => {
    return getA2ATask(taskId) || null
  })

  ipcMain.handle('a2a:getPort', () => 9090)
  ipcMain.handle('a2a:syncAgents', (_e, agents: any[]) => { syncAgents(agents); return true })
  ipcMain.handle('a2a:start', (_e, port: number) => { startA2AServer(port); return true })
  ipcMain.handle('a2a:stop', () => { stopA2AServer(); return true })
  ipcMain.handle('a2a:status', () => ({ running: true, port: 9090 }))
  ipcMain.handle('a2a:setToken', (_e, token: string) => { setA2AToken(token); return true })
}
