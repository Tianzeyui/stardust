# BrainPlus A2A 标准对齐计划

## 目标

将当前 tool-based Agent 调用升级为 Google A2A 协议兼容的 task-based 编排，本地 Agent 和远程 Agent 统一接口。

## 核心差距

| A2A 标准 | 当前状态 | 改造 |
|----------|---------|------|
| Agent Card (JSON manifest) | agents 表有大部分字段 | 字段补全齐 |
| Task 状态机 | ❌ delegate_task 只是一个工具 | **TaskManager 实现完整生命周期** |
| Task 持久化 | agent_tasks 表已建但空着 | **orchestrator 写 Task 到 Supabase** |
| Task 事件流 | 通过 onEvent hack 到 ChatPage | **ChatStreamEvent 加 task-status** |
| Artifact | ❌ 没有 | **Task.artifacts 字段** |
| 结果结构化 | 返回纯文本字符串 | **返回 Task summary + output** |

---

## 实施步骤

### Step 1: Task 状态机

**文件**: `src/lib/taskManager.ts`

```ts
// Task 生命周期
type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

interface Task {
  id: string
  agentId: string
  agentName: string
  status: TaskStatus
  input: string        // user task
  output?: string      // agent result
  error?: string
  artifacts?: Array<{ type: string; uri: string }>  // files/data
  startedAt?: number
  completedAt?: number
  createdAt: number
}

class TaskManager {
  create(params): Task
  start(id): void          // pending → running
  complete(id, output): void   // running → completed
  fail(id, error): void    // running → failed
  cancel(id): void         // → cancelled
  get(id): Task
  getTasksByAgent(agentId): Task[]
}
```

**存储**: agent_tasks 表 (Supabase，已有表结构)

---

### Step 2: orchestrator 重构——Task 驱动

**文件**: `src/lib/orchestrator.ts`

```
delegateToAgent(agent, task)
  BEFORE: streamText → return DelegateResult
  AFTER:
    task = taskManager.create({ agentId, input: task })  // pending
    taskManager.start(task.id)                            // running
    streamText → emit task-status events → UI
    on complete: taskManager.complete(output)             // completed + artifacts
    if error: taskManager.fail(error)                     // failed
    return structured result (Task ref + output)
```

**ChatStreamEvent 加**:

```ts
type: 'task-status'
taskId: string; agentName: string; status: TaskStatus; output?: string
```

ChatPage 根据 task-status 更新 Agent 容器状态（执行中/完成/失败）。

---

### Step 3: Agent Card 补全

**Supabase agents 表**:

```sql
-- 已有字段 OK
name, description, url, type, version, capabilities, status, system_prompt

-- 需要补的
provider_organization TEXT   -- A2A Card: provider.organization
provider_url TEXT            -- A2A Card: provider.url  
documentation_url TEXT       -- A2A Card: documentationUrl
```

**编辑器 UI**: 在基础信息 section 加三个字段（可选）。

---

### Step 4: delegate 系列工具——返回 Task 引用

```
delegate_task({ agentName, task })
  → Task 创建 → 运行 → 完成
  → 返回: "✅ Task t_abc123 完成: [代码助手]\n{output}"

delegate_batch({ agents: [...] })
  → N tasks 并发 → Promise.all → 合并
  → 返回: "✅ 2/2 tasks 完成:\n### 代码助手\n{output}\n---\n### 代码审查\n{output}"

delegate_chain({ steps: [...] })
  → Task 1 → complete → output → Task 2 input → complete
  → 返回: 合并输出
```

---

### Step 5: ChatPage Task 面板

在聊天控制台中展示 Task 历史：

```
┌─ Tasks ───────────────────────────┐
│ t_abc123 代码助手     ✅ 完成 3.2s │
│ t_def456 代码审查     🔄 运行中    │
└───────────────────────────────────┘
```

科乐美码控制台新增 Tasks 标签页。

---

### Step 6: Remote Agent (M4 保留)

`agent.type === 'remote'` 且 `agent.url` 有值时：

```
delegateToAgent(agent, task)
  → 本地 Agent: streamText (已有)
  → 远程 Agent: POST {agent.url}/tasks { task }
        轮询 GET {agent.url}/tasks/{id}
        或 SSE subscribe
```

远程 Agent 对接标准的 A2A HTTP API。

---

## 实施顺序

| Step | 内容 | 预计改动 |
|------|------|---------|
| 1 | TaskManager + 状态机 | 新增 taskManager.ts (~80行) |
| 2 | orchestrator 重构 Task 驱动 | 改 orchestrator.ts (~30行) |
| 3 | Agent Card 补全 | SQL + 编辑器 (3字段) |
| 4 | delegate_* 返回 Task 引用 | 改 agent.ts 返回格式 |
| 5 | ChatPage Task 面板 | ChatPage 控制台 (~60行) |
| 6 | Remote Agent | 后续 |

---

## 不影响的部分

- AgentPicker / AgentsPage / MemoryPanel — 不变
- 渐进式披露 / 工具目录 / enable_tool — 不变
- 沙箱 / Skills / MCP — 不变
- 对话流 / 记忆系统 — 不变
