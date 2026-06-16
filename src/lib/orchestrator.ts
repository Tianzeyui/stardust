/**
 * Agent Orchestrator — A2A Task 驱动
 * 每次 Agent 执行对应一个 Task，完整生命周期追踪
 */
import { streamText, stepCountIs, type ModelMessage } from 'ai'
import { getChatModel } from './chatService'
import { getAgentStreamHandler } from './tools/agent'
import { getAgentMaxSteps } from './config'
import { TaskManager, type Task } from './taskManager'
import type { Agent } from './agentStore'
import { listAgents } from './agentStore'

/** 查找 Agent：精确匹配 → 包含匹配 → 模糊匹配 */
export async function findAgent(name: string): Promise<{ agent: Agent | null; available: string[] }> {
  const agents = await listAgents()  // userId 自动从 Supabase session 获取
  console.log(`[orchestrator] findAgent("${name}"): 共 ${agents.length} agents, active: ${agents.filter(a => a.status === 'active').map(a => a.name).join(', ') || '(无)'}`)
  const active = agents.filter(a => a.status === 'active')
  const available = active.map(a => a.name)

  if (!name) return { agent: null, available }
  const exact = active.find(a => a.name === name)
  if (exact) return { agent: exact, available }
  const includes = active.find(a => a.name.includes(name) || name.includes(a.name))
  if (includes) return { agent: includes, available }
  return { agent: null, available }
}

function log(msg: string, ...args: any[]) {
  console.log(`[orchestrator] ${msg}`, ...args)
}

export interface DelegateResult {
  agentName: string
  success: boolean
  taskId: string
  html: string
  plainText: string
  toolCount: number
  tokenUsage?: { input: number; output: number }
  error?: string
}

export async function delegateToAgent(
  agent: Agent,
  taskInput: string,
): Promise<DelegateResult> {
  const streamHandler = getAgentStreamHandler()
  const task = TaskManager.create(agent.id!, agent.name, taskInput)

  // 远程 Agent：HTTP A2A 调用
  if (agent.type === 'remote' && agent.url) {
    return delegateToRemoteAgent(agent, taskInput, task, streamHandler)
  }

  // 本地 Agent：streamText
  const model = getChatModel()
  if (!model) return { agentName: agent.name, success: false, taskId: task.id, toolCount: 0, html: '', plainText: '', error: '没有可用模型' }

  TaskManager.start(task)
  streamHandler?.({ type: 'task-status', taskId: task.id, taskAgentName: agent.name, taskStatus: 'running' } as any)

  const skillDesc = agent.skills.length > 0
    ? '\n能力:\n' + agent.skills.map(s => `- ${s.name}: ${s.description}`).join('\n')
    : ''
  const systemPrompt = agent.systemPrompt
    || `You are "${agent.name}", a coding agent. ${agent.description}${skillDesc}\n\nUse tools directly. Report in one sentence. Do not explain.`
  const messages: ModelMessage[] = [{ role: 'user', content: taskInput }]
  const toolCalls: string[] = []

  try {
    const { getMCPSdkTools } = await import('./chatService')
    const allTools = await getMCPSdkTools(false)
    const toolNames = Object.keys(allTools)
    log(`Task ${task.id} "${agent.name}" 开始，工具 ${toolNames.length} 个`)

    const result = streamText({
      model: model.instance,
      system: systemPrompt,
      messages,
      tools: toolNames.length > 0 ? allTools : undefined,
      stopWhen: stepCountIs(getAgentMaxSteps()),
    })

    let fullText = ''
    for await (const chunk of result.fullStream) {
      if (chunk.type === 'text-delta') {
        fullText += chunk.text
        streamHandler?.({ type: 'agent-text-delta', text: chunk.text, agentName: agent.name })
      } else if (chunk.type === 'tool-call') {
        const c = chunk as any
        const name = c.toolName || 'unknown'
        toolCalls.push(name)
        log(`Task ${task.id} ▶ ${name}`)
        streamHandler?.({ type: 'agent-tool-call', toolName: name, toolInput: c.args, agentName: agent.name })
      } else if (chunk.type === 'tool-result') {
        const c = chunk as any
        const output = String(c.output ?? c.result ?? '')
        streamHandler?.({ type: 'agent-tool-result', toolName: c.toolName || '?', toolOutput: output, agentName: agent.name })
      }
    }

    streamHandler?.({ type: 'agent-done', agentName: agent.name })

    const plainText = [fullText.trim(), toolCalls.length > 0 ? `\n(调用: ${toolCalls.join(', ')})` : ''].filter(Boolean).join('\n') || '(无输出)'

    // 检测 artifacts（沙箱输出文件等）
    const artifacts: Task['artifacts'] = []
    const outputMatch = plainText.match(/📁\s*输出文件:\s*\n((?:\s*-\s*.+\n?)*)/)
    if (outputMatch) {
      for (const line of outputMatch[1].split('\n')) {
        const m = line.match(/-\s*(.+)/)
        if (m) artifacts.push({ type: 'file', uri: m[1].trim() })
      }
    }

    // 获取 token 用量
    let tokenUsage: { input: number; output: number } | undefined
    try {
      const usage = await Promise.resolve((result as any).usage).catch(() => undefined)
      if (usage) tokenUsage = { input: usage.inputTokens ?? usage.promptTokens ?? 0, output: usage.outputTokens ?? usage.completionTokens ?? 0 }
    } catch {}

    TaskManager.complete(task, plainText, artifacts.length > 0 ? artifacts : undefined)
    streamHandler?.({ type: 'task-status', taskId: task.id, taskAgentName: agent.name, taskStatus: 'completed', text: plainText.slice(0, 100) } as any)
    ;(window as any).electronAPI?.a2a?.completeTask(task.id, plainText).catch(() => {})
    log(`Task ${task.id} 完成: 输出${fullText.length}字, 工具${toolCalls.length}次, ${tokenUsage ? `${tokenUsage.input + tokenUsage.output} tok` : '?'}`)

    const toolInfo = toolCalls.length > 0 ? ` (${toolCalls.length}工具${tokenUsage ? `, ${tokenUsage.input + tokenUsage.output} tok` : ''})` : ''
    return {
      agentName: agent.name,
      success: true,
      taskId: task.id,
      plainText,
      toolCount: toolCalls.length,
      tokenUsage,
      html: `✅ ${agent.name}${toolInfo}:\n\n${plainText}`,
    }
  } catch (e: any) {
    streamHandler?.({ type: 'agent-done', agentName: agent.name })
    TaskManager.fail(task, e.message)
    ;(window as any).electronAPI?.a2a?.completeTask(task.id, '', e.message).catch(() => {})
    log(`Task ${task.id} 失败: ${e.message}`)
    return { agentName: agent.name, success: false, taskId: task.id, toolCount: 0, html: '', plainText: '', error: e.message }
  }
}

/** 远程 Agent：A2A HTTP 调用 */
async function delegateToRemoteAgent(
  agent: Agent, taskInput: string, task: Task,
  streamHandler: ReturnType<typeof getAgentStreamHandler>,
): Promise<DelegateResult> {
  const endpoint = agent.url.replace(/\/+$/, '')
  log(`🌐 远程调用 ${agent.name} @ ${endpoint}`)
  TaskManager.start(task)
  streamHandler?.({ type: 'task-status', taskId: task.id, taskAgentName: agent.name, taskStatus: 'running' } as any)

  try {
    // 构建 A2A Task 请求
    const body = JSON.stringify({
      task: taskInput,
      sessionId: task.id,
      metadata: { agentName: agent.name },
    })

    // POST /tasks 创建远程任务（带 security token）
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (agent.securitySchemes?.bearerToken) {
      headers['Authorization'] = `Bearer ${agent.securitySchemes.bearerToken}`
    }
    const createRes = await fetch(`${endpoint}/tasks`, { method: 'POST', headers, body })
    if (!createRes.ok) throw new Error(`远程返回 ${createRes.status}`)
    const remoteTask = await createRes.json()
    const remoteTaskId = remoteTask.id || task.id

    // 轮询或 SSE 等待结果
    let output = ''
    let attempts = 0
    const maxAttempts = 60 // 最多等 60 秒

    // 优先 SSE
    try {
      const sseRes = await fetch(`${endpoint}/tasks/${remoteTaskId}/subscribe`, {
        headers: { Accept: 'text/event-stream' },
      })
      if (sseRes.ok && sseRes.body) {
        const reader = sseRes.body.getReader()
        const decoder = new TextDecoder()
        while (attempts < maxAttempts) {
          const { done, value } = await reader.read()
          if (done) break
          const text = decoder.decode(value, { stream: true })
          const lines = text.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.status === 'completed') {
                  output = data.output || data.result || ''
                  TaskManager.complete(task, output)
                  streamHandler?.({ type: 'agent-done', agentName: agent.name })
                  const html = `✅ Task ${task.id}: Agent ${agent.name}\n\n${output}`
                  return { agentName: agent.name, success: true, taskId: task.id, toolCount: 0, plainText: output, html }
                }
                if (data.status === 'failed') {
                  throw new Error(data.error || '远程执行失败')
                }
              } catch (e: any) { if (e.message.includes('远程')) throw e }
            }
          }
          attempts++
        }
      }
    } catch { /* SSE 不可用，回退轮询 */ }

    // 轮询 GET /tasks/{id}
    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 1000))
      const pollRes = await fetch(`${endpoint}/tasks/${remoteTaskId}`)
      if (!pollRes.ok) { attempts++; continue }
      const pollTask = await pollRes.json()
      if (pollTask.status === 'completed') {
        output = pollTask.output || pollTask.result || ''
        break
      }
      if (pollTask.status === 'failed') {
        throw new Error(pollTask.error || '远程执行失败')
      }
      attempts++
    }

    if (!output) output = '(远程 Agent 超时)'

    TaskManager.complete(task, output)
    streamHandler?.({ type: 'agent-done', agentName: agent.name })
    log(`🌐 远程完成 ${agent.name}: ${output.length}字`)

    return {
      agentName: agent.name,
      success: true,
      taskId: task.id,
      toolCount: 0,
      plainText: output,
      html: `✅ Task ${task.id}: Agent ${agent.name}\n\n${output}`,
    }
  } catch (e: any) {
    streamHandler?.({ type: 'agent-done', agentName: agent.name })
    TaskManager.fail(task, e.message)
    return { agentName: agent.name, success: false, taskId: task.id, toolCount: 0, html: '', plainText: '', error: e.message }
  }
}

/** 并行执行多个 Agent */
export async function delegateBatch(
  items: Array<{ agent: Agent; task: string }>,
): Promise<string> {
  if (items.length === 0) return '(无任务)'
  log(`🚀 并行执行 ${items.length} 个 Agent: ${items.map(i => i.agent.name).join(', ')}`)
  const results = await Promise.all(items.map(({ agent, task }) => delegateToAgent(agent, task)))
  const parts = results.map(r => r.success
    ? `### ${r.agentName} (Task ${r.taskId})\n${r.plainText}`
    : `### ${r.agentName}\n❌ ${r.error}`)
  return parts.join('\n\n---\n\n')
}

/** 串行执行 Agent 链 */
export async function delegateChain(
  steps: Array<{ agent: Agent; task: string }>,
): Promise<string> {
  if (steps.length === 0) return '(无任务)'
  const outputs: string[] = []
  let context = ''
  for (let i = 0; i < steps.length; i++) {
    const { agent } = steps[i]
    const task = context ? `${steps[i].task}\n\n上一步输出:\n${context}` : steps[i].task
    log(`🔗 链式 [${i + 1}/${steps.length}]: "${agent.name}"`)
    const result = await delegateToAgent(agent, task)
    if (result.success) {
      context = result.plainText
      outputs.push(`### [${i + 1}] ${agent.name} (Task ${result.taskId})\n${result.plainText}`)
    } else {
      outputs.push(`### [${i + 1}] ${agent.name}\n❌ ${result.error}`)
      break
    }
  }
  return outputs.join('\n\n---\n\n')
}
