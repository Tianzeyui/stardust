/**
 * A2A Server — BrainPlus 作为 Agent 服务提供方
 * 端口默认 9090，可通过设置配置
 */
import http, { type IncomingMessage, type ServerResponse } from 'http'
import { BrowserWindow } from 'electron'

interface TaskRecord {
  id: string
  agentName: string
  status: string
  input: string
  output?: string
  error?: string
  createdAt: number
  completedAt?: number
}

const tasks = new Map<string, TaskRecord>()
let server: http.Server | null = null
let port = 9090
let authToken = ''

export function setA2AToken(t: string) { authToken = t }

// ====== 工具 ======

function json(res: http.ServerResponse, data: any, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(data))
}

function cors(req: IncomingMessage, res: http.ServerResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    res.end()
    return true
  }
  return false
}

function authFail(res: http.ServerResponse) {
  res.writeHead(401, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Unauthorized. Set Authorization: Bearer <token>' }))
}

function checkAuth(req: IncomingMessage, res: http.ServerResponse): boolean {
  if (!authToken) return true  // 未设 token 则不鉴权
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match || match[1] !== authToken) {
    authFail(res)
    return false
  }
  return true
}

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => { try { resolve(JSON.parse(body)) } catch { resolve({}) } })
  })
}

// Agent 缓存：渲染进程通过 IPC 同步
let cachedAgents: any[] = []

export function syncAgents(agents: any[]) {
  cachedAgents = agents
  console.log(`[A2A Server] 同步 ${agents.length} 个 Agent`)
}

function getActiveAgents(): any[] {
  return cachedAgents.filter((a: any) => a.status === 'active')
}

// ====== 路由 ======

async function handleRequest(req: IncomingMessage, res: http.ServerResponse) {
  if (cors(req, res)) return

  const url = new URL(req.url || '/', `http://localhost:${port}`)

  function buildCard(a: any, baseUrl: string) {
    return {
      name: a.name,
      description: a.description || '',
      url: a.url || `http://localhost:${port}`,
      version: a.version || '1.0.0',
      protocol: 'HTTP+JSON',
      protocolVersion: '0.2.0',
      provider: {
        organization: a.provider_organization || 'BrainPlus',
        url: a.provider_url || '',
      },
      documentationUrl: a.documentation_url || '',
      capabilities: {
        streaming: a.capabilities?.streaming ?? true,
        pushNotifications: a.capabilities?.pushNotifications ?? false,
      },
      defaultInputModes: a.input_modes || ['text'],
      defaultOutputModes: a.output_modes || ['text'],
      skills: (a.agent_skills || a.skills || [{ id: 'default', name: a.name, description: a.description || '', input_modes: ['text'], output_modes: ['text'] }]).map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
        tags: s.tags || [],
        examples: s.examples || [],
        inputModes: s.inputModes || s.input_modes || ['text'],
        outputModes: s.outputModes || s.output_modes || ['text'],
      })),
      securitySchemes: a.security_schemes || undefined,
    }
  }

  // GET /.well-known/agent-card.json — 返回主 Agent Card
  if (req.method === 'GET' && (url.pathname === '/.well-known/agent-card.json' || url.pathname === '/agent-card')) {
    const agents = getActiveAgents()
    if (agents.length === 0) return json(res, { error: 'No active agents' }, 404)
    const card = buildCard(agents[0], `http://localhost:${port}`)
    return json(res, card)
  }

  // GET /agents — 列出所有活跃 Agent Card
  if (req.method === 'GET' && url.pathname === '/agents') {
    const agents = getActiveAgents()
    const cards = agents.map(a => buildCard(a, `http://localhost:${port}`))
    return json(res, { agents: cards, count: cards.length })
  }

  // GET /agents/{name} — 单个 Agent Card
  const agentNameMatch = url.pathname.match(/^\/agents?\/([^/]+)\/?$/)
  if (req.method === 'GET' && agentNameMatch) {
    const name = decodeURIComponent(agentNameMatch[1])
    const agents = getActiveAgents()
    const agent = agents.find(a => a.name === name)
    if (!agent) return json(res, { error: 'Agent not found' }, 404)
    return json(res, buildCard(agent, `http://localhost:${port}`))
  }

  // POST /tasks /message/send /message/stream — 创建任务（兼容多种 A2A 客户端）
  const isTaskCreate = req.method === 'POST' && (
    url.pathname === '/tasks' ||
    url.pathname === '/message/send' ||
    url.pathname === '/message/stream' ||
    url.pathname === '/tasks/sendSubscribe' ||
    url.pathname === '/message' ||
    url.pathname === '/sendMessageStream' ||
    url.pathname === '/sendMessage' ||
    url.pathname.endsWith('/stream')
  )
  if (isTaskCreate) {
    if (!checkAuth(req, res)) return
    const body = await parseBody(req)
    const jsonRpcId = body.id ?? 1  // JSON-RPC 请求 ID，所有事件必须回传此值
    const agentName = body.params?.agentName || body.agentName || body.params?.message?.role || getActiveAgents()[0]?.name || 'default'
    const taskInput = body.params?.task || body.params?.input || body.params?.message?.parts?.[0]?.text || body.task || body.input || JSON.stringify(body)

    if (!agentName) return json(res, { error: 'agentName required' }, 400)

    const id = crypto.randomUUID()
    const task: TaskRecord = {
      id,
      agentName,
      status: 'pending',
      input: taskInput,
      createdAt: Date.now(),
    }
    tasks.set(id, task)
    // 兜底：10 秒后无人完成则自动标记
    setTimeout(() => {
      const t = tasks.get(id)
      if (t && t.status === 'pending') {
        t.status = 'completed'
        t.output = `[${agentName}] 任务已接收。渲染进程未执行，这是自动回复。`
        t.completedAt = Date.now()
        console.log(`[A2A Server] Task ${id.slice(0, 8)} auto-completed`)
      }
    }, 30000)

    console.log(`[A2A Server] Task ${id.slice(0, 8)}: "${agentName}"`)
    // IPC 通知渲染进程执行
    const wins = BrowserWindow.getAllWindows()
    console.log(`[A2A Server] 通知 ${wins.length} 窗口`)
    wins.forEach(win => win.webContents.send('a2a:newTask', { id, agentName, input: taskInput }))

    // 流式端点（/message/*, /send*, *stream）→ SSE
    const isStreaming = url.pathname.startsWith('/message') ||
      url.pathname.startsWith('/send') ||
      url.pathname.includes('stream') ||
      url.pathname.includes('subscribe')
    if (isStreaming) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })
      const send = (data: any) => res.write(`data: ${JSON.stringify({ id: jsonRpcId, ...data })}\n\n`)
      send({ kind: 'task-status-update', result: { id, status: { state: 'submitted' } } })

      const interval = setInterval(() => {
        const t = tasks.get(id)
        if (!t || t.status === 'completed' || t.status === 'failed') {
          clearInterval(interval)
          if (t) {
            send({ kind: 'task-status-update', result: { id: t.id, status: { state: t.status === 'completed' ? 'completed' : 'failed' } } })
            if (t.output) {
              send({ kind: 'artifact-update', result: { id: t.id, artifact: { parts: [{ kind: 'text', text: t.output }] } } })
            }
          }
          else send({ kind: 'task-status-update', result: { status: { state: 'cancelled' } } })
          res.end()
        }
      }, 500)

      req.on('close', () => clearInterval(interval))
      return
    }

    return json(res, { id, status: 'pending' }, 202)
  }

  // GET /tasks/{id} — 查询任务
  const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/)
  if (req.method === 'GET' && taskMatch) {
    const task = tasks.get(taskMatch[1])
    if (!task) return json(res, { error: 'Task not found' }, 404)
    return json(res, {
      id: task.id,
      status: task.status,
      input: task.input,
      output: task.output,
      error: task.error,
    })
  }

  // POST /tasks/{id}/subscribe — SSE 流式
  const subMatch = url.pathname.match(/^\/tasks\/([^/]+)\/subscribe$/)
  if (req.method === 'POST' && subMatch) {
    const tid = subMatch[1]
    const task = tasks.get(tid)
    if (!task) return json(res, { error: 'Task not found' }, 404)

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })

    const sendSSE = (d: any) => { const e = { id: tid, kind: d.kind, result: d.result }; res.write(`event: task\ndata: ${JSON.stringify(e)}\n\n`) }

    if (task.status === 'completed' || task.status === 'failed') {
      sendSSE({ kind: 'task-status-update', result: { id: tid, status: { state: task.status === 'completed' ? 'completed' : 'failed' } } })
      if (task.output) sendSSE({ kind: 'artifact-update', result: { id: tid, artifact: { parts: [{ kind: 'text', text: task.output }] } } })
      return res.end()
    }

    sendSSE({ kind: 'task-status-update', result: { id: tid, status: { state: 'submitted' } } })

    // 轮询等待
    const interval = setInterval(() => {
      const t = tasks.get(tid)
      if (!t || t.status === 'completed' || t.status === 'failed') {
        clearInterval(interval)
        if (t) {
          sendSSE({ kind: 'task-status-update', result: { id: t.id, status: { state: t.status === 'completed' ? 'completed' : 'failed' } } })
          if (t.output) sendSSE({ kind: 'artifact-update', result: { id: t.id, artifact: { parts: [{ kind: 'text', text: t.output }] } } })
        } else sendSSE({ kind: 'task-status-update', result: { id: tid, status: { state: 'cancelled' } } })
        res.end()
      } else {
        sendSSE({ kind: 'task-status-update', result: { id: t.id, status: { state: 'working' } } })
      }
    }, 500)

    req.on('close', () => clearInterval(interval))
    return
  }

  // GET /health
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, { status: 'ok', agents: tasks.size })
  }

  // 兜底：任何未匹配的 POST 都当作任务创建（兼容各种 A2A 客户端路径）
  if (req.method === 'POST') {
    if (!checkAuth(req, res)) return
    const body = await parseBody(req)
    console.log(`[A2A Server] POST ${url.pathname} body keys:`, Object.keys(body), 'id:', body.id, 'method:', body.method)
    const rpcId = body.id ?? null
    const agentName = body.agentName || body.params?.agentName || body.params?.message?.role || getActiveAgents()[0]?.name || 'default'
    const taskInput = body.params?.task || body.params?.input || body.params?.message?.parts?.[0]?.text || body.task || body.input || JSON.stringify(body)
    const id = crypto.randomUUID()
    const task: TaskRecord = { id, agentName, status: 'pending', input: taskInput, createdAt: Date.now() }
    tasks.set(id, task)
    console.log(`[A2A Server] Task ${id.slice(0, 8)}: "${agentName}"`)
    setTimeout(() => {
      const t = tasks.get(id)
      if (t && t.status === 'pending') {
        t.status = 'completed'
        t.output = `[${agentName}] 任务自动完成`
        t.completedAt = Date.now()
      }
    }, 30000)

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })
    const sse = (d: any) => `event: task\ndata: ${JSON.stringify({ id: rpcId, kind: d.kind, result: d.result })}\n\n`
    res.write(sse({ kind: 'task-status-update', result: { id, status: { state: 'submitted' } } }))

    const interval = setInterval(() => {
      const t = tasks.get(id)
      if (!t || t.status === 'completed' || t.status === 'failed') {
        clearInterval(interval)
        if (t) {
          res.write(sse({ kind: 'task-status-update', result: { id: t.id, status: { state: t.status === 'completed' ? 'completed' : 'failed' } } }))
          if (t.output) res.write(sse({ kind: 'artifact-update', result: { id: t.id, artifact: { parts: [{ kind: 'text', text: t.output }] } } }))
        }
        else res.write(sse({ kind: 'task-status-update', result: { id, status: { state: 'cancelled' } } }))
        res.end()
      }
    }, 500)

    req.on('close', () => clearInterval(interval))
    return
  }

  json(res, { error: 'Not found', path: url.pathname }, 404)
}

// ====== 启动/停止 ======

export function startA2AServer(serverPort?: number): number {
  if (server) return port
  if (serverPort) port = serverPort

  server = http.createServer(handleRequest)
  server.listen(port, () => {
    console.log(`[A2A Server] 启动: http://localhost:${port}`)
  })
  return port
}

export function stopA2AServer() {
  if (server) { server.close(); server = null }
}

/** 完成任务（渲染进程通过 IPC 调用） */
export function completeA2ATask(id: string, output: string, error?: string) {
  const task = tasks.get(id)
  if (!task) return
  if (error) {
    task.status = 'failed'
    task.error = error
  } else {
    task.status = 'completed'
    task.output = output
  }
  task.completedAt = Date.now()
  console.log(`[A2A Server] Task ${id.slice(0, 8)} ${task.status}`)
}

/** 开始执行任务 */
export function startA2ATask(id: string) {
  const task = tasks.get(id)
  if (task) task.status = 'running'
}

export function getA2ATask(id: string): TaskRecord | undefined {
  return tasks.get(id)
}
