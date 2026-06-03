# BrainPlus A2A (Agent-to-Agent) 实现规划

## 协议对标

基于 Google A2A Protocol v1.0 标准，对齐核心概念：

| A2A 标准 | 对应实现 |
|----------|---------|
| Agent Card | 数据库 `agents` 表 + `agent_skills` 表 |
| Task | `agent_tasks` 表 + `TaskManager` 调度器 |
| Message/Part | AI SDK `ModelMessage[]` 复用 |
| Artifact | `agent_artifacts` 表 + 文件引用 |
| Agent Discovery | `SkillRegistry.registerAgent()` |
| Streaming | AI SDK `streamText` + SSE |
| Push Notification | IPC 事件 + WebSocket（远期） |

## 数据模型

```sql
-- Agent 定义
agents (
  id, user_id, name, description,
  url TEXT,                        -- 远程端点（remote 类型时必填）
  type TEXT DEFAULT 'remote',     -- 'local' | 'remote'
  capabilities JSONB DEFAULT '{}', -- { streaming: bool, pushNotifications: bool }
  status TEXT DEFAULT 'draft',    -- 'draft' | 'active' | 'paused'
  created_at, updated_at
)

-- Agent 能力定义
agent_skills (
  id, agent_id,
  name, description,
  tags TEXT[] DEFAULT '{}',        -- ['code-review', 'python']
  examples TEXT[] DEFAULT '{}',
  input_modes TEXT[] DEFAULT '{text}',   -- ['text','file','image']
  output_modes TEXT[] DEFAULT '{text}',  -- ['text','file']
  sort_order
)

-- 任务追踪
agent_tasks (
  id, agent_id, conversation_id,
  status TEXT DEFAULT 'pending',   -- pending/running/completed/failed/cancelled
  input TEXT,                      -- 任务描述/参数
  output TEXT,                     -- 任务结果
  error TEXT,
  started_at, completed_at
)
```

## 里程碑

---

### Milestone 1: Agent Card 数据层 ✅ 基础完成

**目标**：Agent 定义可存储、可编辑、可查询

- [x] Supabase 表结构（agents + agent_skills）
- [x] CRUD Store (agentStore.ts)
- [ ] Agent Card 字段对齐 A2A 标准
  - [ ] skills 加 `id`、`tags`、`inputModes`、`outputModes`
  - [ ] agents 加 `url`、`capabilities`、`status`
- [ ] Supabase SQL 更新

**验证**：Agents 页面创建/编辑/删除正常，Supabase 数据完整

---

### Milestone 2: Agent 注册到系统

**目标**：Agent 成为可调用的"工具"，出现在 AI 工具列表中

- [ ] `SkillRegistry.registerAgent(agentCard)` —— Agent 作为 Skill 注册
- [ ] Agent 在聊天中可见（工具选择器 + 渐进式披露）
- [ ] Agent 类型图标/标签（与 MCP/Sandbox/Skill 并列）
- [ ] Agent 启用/停用开关

**验证**：聊天工具面板出现 Agent，AI 可以调用 Agent

---

### Milestone 3: Local Agent 执行引擎

**目标**：本地 Agent 可通过 system prompt + 工具集方式运行

- [ ] `AgentRunner.run(agent, messages, context)` —— 执行本地 Agent
- [ ] 支持 Agent 专属 system prompt（从 skills 生成）
- [ ] 支持 Agent 专属工具白名单（skillWhitelist）
- [ ] 支持 `maxSteps` 步数限制
- [ ] `delegate_task` 工具支持指定 Agent 名称

**验证**：用户说"让代码助手审查这段代码" → AI 调用 delegate_task → agent 执行 → 返回结果

---

### Milestone 4: Remote Agent 通信

**目标**：远程 Agent 通过标准 A2A 协议通信

- [ ] Agent Card 暴露 HTTP 端点 `GET /agent-card.json`
- [ ] `POST /tasks` 创建任务（A2A Send Task）
- [ ] `GET /tasks/{id}` 查询任务状态（A2A Get Task）
- [ ] SSE `POST /tasks/sendSubscribe` 流式任务执行
- [ ] API Key 认证

**验证**：注册远程 Agent → 用户调用 → HTTP 请求 → 远程返回结果

---

### Milestone 5: Task 管理与追踪

**目标**：所有 Agent 调用有完整生命周期追踪

- [ ] `agent_tasks` 表落地
- [ ] `TaskManager` 负责创建/更新/查询 Task
- [ ] 聊天中显示 Agent Task 状态（类似工具调用 bubble）
- [ ] 可观测性：Agent 调用耗时、成功率、Token 消耗

**验证**：调用 Agent → 控制台显示 Task status 变化 → Supabase 持久化

---

### Milestone 6: 多 Agent 协作

**目标**：多个 Agent 协同完成复杂任务

- [ ] `orchestrator` 模块：任务分解 → 并行/串行调度 Agent
- [ ] A2A 链式调用：Agent A 输出 → Agent B 输入
- [ ] Agent 间对话记忆隔离（各自 system prompt 独立）
- [ ] 结果合并（merge artifacts）

**验证**：用户说"写一个 React 组件并审查代码" → Agent 1 写代码 → Agent 2 审查 → 合并返回

---

### Milestone 7: 用户体验

**目标**：Agent 交互自然流畅

- [ ] Agent 对话独立窗口（可选嵌入当前聊天）
- [ ] Agent 卡片预览（名称/描述/能力/状态）
- [ ] Agent 测试面板（在 Agents 页面直接测试对话）
- [ ] Agent 市场/模板（内置常用 Agent 模板）
- [ ] Agent 对话历史独立存储

---

## 当前进度

| 里程碑 | 状态 | 完成度 |
|--------|------|--------|
| M1: Agent Card 数据层 | 🔄 进行中 | 70% |
| M2: Agent 注册到系统 | ⬜ 未开始 | 0% |
| M3: Local Agent 执行 | ⬜ 未开始 | 0% |
| M4: Remote Agent 通信 | ⬜ 未开始 | 0% |
| M5: Task 管理 | ⬜ 未开始 | 0% |
| M6: 多 Agent 协作 | ⬜ 未开始 | 0% |
| M7: 用户体验 | ⬜ 未开始 | 0% |

---

## 下一步

完成 M1 剩余项（字段对齐 A2A 标准）→ 进入 M2。
