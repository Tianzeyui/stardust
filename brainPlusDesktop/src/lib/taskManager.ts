/**
 * TaskManager — A2A Task 状态机
 * 完整生命周期: pending → running → completed/failed/cancelled
 * 每次状态变更自动写 Supabase agent_tasks 表
 */
import { getSupabaseClient } from './supabase'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Task {
  id: string
  agentId: string
  agentName: string
  status: TaskStatus
  input: string
  output?: string
  error?: string
  artifacts?: Array<{ type: string; uri: string }>
  startedAt?: number
  completedAt?: number
  createdAt: number
}

export interface TaskEvent {
  type: 'task-status'
  taskId: string
  agentName: string
  status: TaskStatus
  output?: string
}

let taskCounter = 0
let onTaskEvent: ((event: TaskEvent) => void) | null = null
let userIdGetter: (() => string | null) | null = null

export function setTaskEventHandler(handler: typeof onTaskEvent) {
  onTaskEvent = handler
}

export function setTaskUserId(getter: () => string | null) {
  userIdGetter = getter
}

function emit(event: TaskEvent) {
  onTaskEvent?.(event)
}

function generateId(): string {
  return crypto.randomUUID?.() || `t_${Date.now().toString(36)}_${(++taskCounter).toString(36)}`
}

async function saveTask(task: Task) {
  const sb = getSupabaseClient()
  const uid = userIdGetter?.()
  if (!sb || !uid) return
  try {
    const { error } = await sb.from('agent_tasks').upsert({
      id: task.id,
      agent_id: task.agentId,
      conversation_id: null,
      status: task.status,
      input: task.input,
      output: task.output || null,
      error: task.error || null,
      metadata: task.artifacts ? { artifacts: task.artifacts } : null,
      started_at: task.startedAt ? new Date(task.startedAt).toISOString() : null,
      completed_at: task.completedAt ? new Date(task.completedAt).toISOString() : null,
      created_at: new Date(task.createdAt).toISOString(),
    })
    if (error) console.warn('[TaskManager] save error:', error.message)
  } catch {}
}

export const TaskManager = {
  create(agentId: string, agentName: string, input: string): Task {
    const task: Task = {
      id: generateId(),
      agentId, agentName,
      status: 'pending',
      input,
      createdAt: Date.now(),
    }
    saveTask(task)
    return task
  },

  start(task: Task): Task {
    task.status = 'running'
    task.startedAt = Date.now()
    emit({ type: 'task-status', taskId: task.id, agentName: task.agentName, status: 'running' })
    saveTask(task)
    return task
  },

  complete(task: Task, output: string, artifacts?: Task['artifacts']): Task {
    task.status = 'completed'
    task.output = output
    task.completedAt = Date.now()
    if (artifacts) task.artifacts = artifacts
    emit({ type: 'task-status', taskId: task.id, agentName: task.agentName, status: 'completed', output: output.slice(0, 200) })
    saveTask(task)
    return task
  },

  fail(task: Task, error: string): Task {
    task.status = 'failed'
    task.error = error
    task.completedAt = Date.now()
    emit({ type: 'task-status', taskId: task.id, agentName: task.agentName, status: 'failed', output: error })
    saveTask(task)
    return task
  },

  cancel(task: Task): Task {
    task.status = 'cancelled'
    task.completedAt = Date.now()
    emit({ type: 'task-status', taskId: task.id, agentName: task.agentName, status: 'cancelled' })
    saveTask(task)
    return task
  },
}
