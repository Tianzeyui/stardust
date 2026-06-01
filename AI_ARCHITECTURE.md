# BrainPlus AI 架构设计文档

## 1. 架构总览

```
Renderer (React)                    Main Process (Node.js)
┌─────────────────────┐            ┌──────────────────────────────┐
│ ChatPage            │            │   Chat Orchestrator           │
│ · 流式消息渲染       │───IPC────→│   · 记忆注入 → 工具披露      │
│ · 工具调用进度       │            │   · streamText               │
│ SettingsPage        │            │   · A2A 编排                  │
│ · MCP 管理          │            │                              │
│ · Skill 开关        │            │   ┌──────────────────────┐   │
│ · 对话列表           │            │   │ Memory Manager       │   │
│ DiaryPage           │            │   │ · Layer 0-4 记忆      │   │
│ · AI 摘要           │            │   │ · 长短期检索          │   │
│ · 智能标签           │            │   │ · 自动提取            │   │
└─────────────────────┘            │   └──────────────────────┘   │
                                   │   ┌──────────────────────┐   │
  Preload (contextBridge)          │   │ Skill Registry + MCP │   │
  electronAPI.{                    │   │ · 统一 Skill 接口     │   │
    chat, skill, mcp               │   │ · MCP SSE/HTTP/Stdio │   │
  }                                │   │ · Agent as Skill     │   │
                                   │   └──────────────────────┘   │
                                   │   ┌──────────────────────┐   │
                                   │   │ Disclosure Engine     │   │
                                   │   │ · 语义筛选 Top-N      │   │
                                   │   │ · Token 预算控制      │   │
                                   │   └──────────────────────┘   │
                                   │   ┌──────────────────────┐   │
                                   │   │ Context Window Mgr   │   │
                                   │   │ · 滑动窗口 + 摘要     │   │
                                   │   └──────────────────────┘   │
                                   │   ┌──────────────────────┐   │
                                   │   │ Observability Tracker│   │
                                   │   │ · Token / 延迟 / 工具 │   │
                                   │   └──────────────────────┘   │
                                   │   ┌──────────────────────┐   │
                                   │   │ Conversation Manager │   │
                                   │   │ · CRUD / 同步 / 搜索  │   │
                                   │   └──────────────────────┘   │
                                   └──────────────────────────────┘
```

## 2. 数据存储策略

**原则：单一数据源，避免双写。**

```
┌─────────────────────────────────────────────────────────────┐
│                      数据存储分层                            │
│                                                             │
│  Renderer (React / localStorage)                            │
│  ├─ Supabase 配置    → localStorage (仅登录前需要)          │
│  ├─ Cloudinary 配置   → localStorage                        │
│  ├─ AI 模型 API Key  → localStorage (敏感，不上传)          │
│  └─ UI 偏好          → localStorage                        │
│                                                             │
│  Main Process (Node.js / userData 文件)                     │
│  ├─ MCP 服务器列表    → userData/mcp-servers.json           │
│  └─ 其他 Electron 级配置                                    │
│                                                             │
│  Supabase (云端 / PostgreSQL)                               │
│  ├─ 用户数据 (diary, inspiration, profiles)                 │
│  ├─ AI 模型收藏 (ai_model_favorites)                        │
│  ├─ 对话记录 (conversations)          ← Phase 5              │
│  ├─ 用户记忆 (user_memories)          ← Phase 3              │
│  └─ 聊天追踪 (chat_traces)            ← Phase 6              │
└─────────────────────────────────────────────────────────────┘
```

**MCP 配置为什么不用 localStorage？**
- MCP 服务器连接和工具调用在 main process 执行
- localStorage 在 renderer process，main process 无法读取
- 如果双写（localStorage + userData 文件），必定出现不一致
- → **唯一数据源：main process `userData/mcp-servers.json`**
- → Renderer 通过 IPC 读写，不保留本地副本

## 3. 核心概念

### 2.1 Skill 统一接口

所有能力（内置、MCP、用户自定义）统一为一个 Skill 接口：

```ts
interface Skill {
  id: string
  name: string
  description: string
  inputSchema: Record<string, unknown>
  source: 'builtin' | 'mcp' | 'user' | 'agent'
  serverId?: string
  enabled: boolean
  priority: number
  tags: string[]
  execute(args: Record<string, unknown>): Promise<SkillResult>
}

interface SkillResult {
  success: boolean
  content: string | Array<{ type: 'text' | 'image' | 'resource'; data: unknown }>
  error?: string
  metadata?: Record<string, unknown>
}
```

### 2.2 Skill Registry

```ts
class SkillRegistry {
  private skills: Map<string, Skill> = new Map()
  private agents: Map<string, Agent> = new Map()

  register(skill: Skill): void
  unregister(id: string): void
  registerMCPTools(serverId: string, tools: MCPTool[]): void
  unregisterMCPServer(serverId: string): void
  registerAgent(agent: Agent): void
  unregisterAgent(id: string): void

  getAll(): Skill[]
  getEnabled(): Skill[]
  getByTag(tag: string): Skill[]
  getBySource(source: Skill['source']): Skill[]
  getAgentsAsSkills(): Skill[]
}
```

### 2.3 Agent 定义

```ts
interface Agent {
  id: string
  name: string
  description: string
  skillWhitelist?: string[]
  systemPrompt: string
  maxSteps?: number
  run(messages: Message[], context: AgentContext): AsyncGenerator<AgentEvent>
}

type AgentEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolName: string; args: unknown }
  | { type: 'tool-result'; toolName: string; result: SkillResult }
  | { type: 'done' }
```

## 4. 渐进式披露 (Progressive Disclosure)

### 3.1 问题

一个典型的 MCP 环境可能有 50+ 工具。全量注入：

```
每次请求: 用户消息 + system prompt + 50个工具定义(每个~500 tokens) = ~25,000 tokens 固定开销
```

### 3.2 三层披露策略

```
Layer 1: 语义过滤（免费，本地）
  用户输入 → 向量化 → 与所有工具 description 做余弦相似度
  → Top-N 候选工具（N 默认 10）

Layer 2: 规则过滤（免费，本地）
  · 用户禁用的 MCP server → 排除
  · 用户偏好开关 → 排除
  · 上下文模式匹配（如日记场景下排除代码工具）

Layer 3: 动态预算控制（免费，本地）
  · N = min(10, max(3, contextWindow - messageTokens) / 500)
  · 有高优先级工具时强制保留
  · 上一次被调用的工具优先级 +10
```

### 3.3 实现

```ts
class ProgressiveDisclosureEngine {
  async selectTools(
    userInput: string,
    allTools: Skill[],
    context: DisclosureContext
  ): Promise<Skill[]> {
    // Step 1: 语义相似度排序
    const ranked = await this.rankByRelevance(userInput, allTools)

    // Step 2: 规则过滤
    const filtered = this.applyFilters(
      ranked, context.userPrefs, context.serverStatus
    )

    // Step 3: 预算截断
    return this.applyBudget(filtered, context.maxTokens)
  }
}
```

### 3.4 分阶段实现

| 阶段 | 方案 | 优点 | 适用 |
|------|------|------|------|
| **v1 关键词** | 分词 → 匹配 name + description | 零依赖、毫秒级 | 工具 < 30 个 |
| **v2 嵌入** | 本地 ONNX 模型（~30MB） | 准确、隐私 | 工具 30-100 个 |
| **v3 混合** | v2 + 用户偏好 + 调用频次 | 个性化 | 工具 > 100 个 |

## 5. 记忆系统 (Memory)

### 4.1 记忆分层

```
Layer 0: 即时上下文 (System Prompt)
  · 当前时间、打开的应用、选中的内容
  · 生命周期：单次请求重建

Layer 1: 会话记忆 (Conversation History)
  · 当前对话的完整 messages[]
  · 生命周期：单次会话
  · 存储：Renderer 内存 → AI SDK messages

Layer 2: 短期记忆 (Short-term)
  · "用户正在写关于分布式系统的日记"
  · 生命周期：单次会话
  · 存储：内存 Map → 注入 system prompt

Layer 3: 长期记忆 (Persistent)
  · "用户是 Go 开发者，prefers 简洁回复"
  · 生命周期：持久
  · 存储：Supabase user_memories + 本地向量缓存

Layer 4: 应用数据记忆 (App Data)
  · 日记条目 / 灵感记录 / 对话历史
  · 生命周期：按需查询
  · 存储：Supabase（已有）
```

### 4.2 记忆写入（双写模式）

```
对话过程中自动提取：
  用户: "我不喜欢太长的回复，简洁一点"
  → 后台 MemoryExtractor 用小模型提取
  → "user_prefers_concise_replies = true"
  → 存入 user_memories 表 + 更新本地缓存
```

### 4.3 记忆检索（注入 System Prompt）

```ts
const memories = await memoryManager.retrieve({
  userId: user.id,
  context: messages[messages.length - 1].content,
  limit: 5,
})

systemPrompt += `
## 关于用户的记忆
${memories.map(m => `- ${m.content}`).join('\n')}
`
```

### 4.4 存储模型

```sql
CREATE TABLE user_memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  category    TEXT DEFAULT 'general',     -- preference / fact / project
  importance  INTEGER DEFAULT 0,          -- 0-10
  source      TEXT DEFAULT 'chat',        -- chat / diary / manual
  embedding   VECTOR(384),                -- pgvector 语义检索
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_memories_embedding ON user_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### 4.5 分阶段

| 阶段 | 内容 | 依赖 |
|------|------|------|
| **v1** | Layer 0 + 1：上下文 + 对话历史 | 零（已实现） |
| **v2** | Layer 2：会话内事实提取 | AI SDK tool call 自我提取 |
| **v3** | Layer 4：应用数据按需检索 | diaryService + inspirationService |
| **v4** | Layer 3：持久化记忆 + 语义检索 | pgvector + embedding |

## 6. 可观测性 (Observability)

### 5.1 追踪维度

```
聊天窗口底部状态栏或可折叠面板：
┌─────────────────────────────────────────────────────┐
│  Token: 1,247 / 8,192  │  DeepSeek V3  │  延迟 2.3s │
│  🔧 diary_read (120ms ✓) → summarize (340ms ✓)     │
│  📊 本次: 3 工具调用  │  💰 预估: $0.003           │
└─────────────────────────────────────────────────────┘
```

### 5.2 追踪数据模型

```ts
interface ChatTrace {
  id: string
  conversationId: string
  startTime: number
  endTime?: number
  
  // Token
  inputTokens: number
  outputTokens: number
  totalTokens: number

  // 工具调用
  toolCalls: Array<{
    toolName: string
    startTime: number
    endTime: number
    duration: number
    success: boolean
    error?: string
  }>

  // 模型
  modelId: string
  providerId: string

  // 成本
  estimatedCost: number
}
```

### 5.3 存储与展示

- 每次对话完成后存入 Supabase `chat_traces` 表
- Renderer 通过 IPC 实时接收追踪事件
- 在 ChatPage 底部显示当前追踪，SettingsPage 中可查看历史统计

## 7. 对话管理 (Conversation Management)

### 6.1 数据模型

```sql
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT DEFAULT '新对话',
  model_id    TEXT,
  provider    TEXT,
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,           -- user / assistant / system / tool
  content         TEXT NOT NULL,
  tool_calls      JSONB,                   -- AI 工具调用记录
  token_count     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_conv ON conversation_messages(conversation_id, created_at);
```

### 6.2 功能

| 功能 | 说明 |
|------|------|
| 新建对话 | 空白对话，模型默认沿用上次 |
| 对话列表 | 左侧列表，显示标题 + 最后一条消息预览 + 时间 |
| 切换对话 | 点击加载完整历史 |
| 重命名 | 双击标题编辑 / AI 自动生成标题 |
| 删除 | 删除对话及所有消息 |
| 搜索 | 全文搜索历史消息 |

### 6.3 自动标题生成

```
新对话第一条消息后 → AI 生成 3-5 字标题
"帮我写一个 React Hook 来处理表单验证"
→ AI → "表单验证 Hook"
```

## 8. 上下文窗口管理 (Context Window)

### 7.1 问题

模型有 token 上限（如 8K / 32K / 128K），对话长了必然超出。

### 7.2 滑动窗口 + 摘要策略

```
完整历史 (50 条消息, ~15K tokens, 超过 8K 限制)
     │
     ▼ ContextWindowManager.compress()
     │
     ├─ 最近 10 条：保留完整内容
     ├─ 中间：用 AI 生成摘要替换
     └─ 记忆：提取关键事实注入到 system prompt

压缩后 (等效 ~6K tokens)
```

### 7.3 实现

```ts
class ContextWindowManager {
  async compress(messages: Message[], modelLimit: number): Promise<Message[]> {
    if (this.estimateTokens(messages) <= modelLimit * 0.8) {
      return messages  // 没到阈值，不压缩
    }

    // 1. 提取关键记忆
    const memories = await this.extractMemories(messages)

    // 2. 对中间消息做摘要
    const recentN = 10
    const recent = messages.slice(-recentN)
    const toSummarize = messages.slice(0, -recentN)
    const summary = await this.summarize(toSummarize)

    // 3. 构建压缩后的消息
    return [
      { role: 'system', content: `对话摘要: ${summary}\n关键记忆: ${memories.join('; ')}` },
      ...recent,
    ]
  }
}
```

### 7.4 触发时机

| 触发条件 | 操作 |
|---------|------|
| 预估 token > 限制的 80% | 自动压缩 |
| 用户手动点击 | 立即压缩 |
| 切换模型（如 8K → 128K） | 自动解压/调整 |

## 9. A2A (Agent-to-Agent) 设计

### 8.1 模式

```
Agent 作为 Skill：
  Agent A → call skill(Agent B) → result → 继续生成

Agent 链式：
  User → Agent A → Agent B → Agent C → Result → User

Agent 并行：
  User → Agent A ─┬→ Agent B ─┐
                  └→ Agent C ─┴→ merge → User
```

### 8.2 实现

```ts
class ChatOrchestrator {
  async handleMessage(messages: Message[]): AsyncGenerator<ChatEvent> {
    // 1. 记忆检索
    const memories = await this.memoryManager.retrieve(context)
    
    // 2. 上下文窗口管理
    const compressed = await this.contextWindow.compress(messages, modelLimit)
    
    // 3. 工具披露
    const tools = await this.disclosure.selectTools(input, skills)
    const agentTools = this.skillRegistry.getAgentsAsSkills()
    
    // 4. 构建 system prompt（记忆 + 上下文）
    const system = buildSystemPrompt({ memories, appContext })
    
    // 5. 统一执行
    const result = streamText({
      model: this.getModel(),
      system,
      messages: compressed,
      tools: [...tools, ...agentTools],
      maxSteps: 10,
    })
    
    // 6. 追踪 + 流式输出
    const trace = this.observability.startTrace()
    for await (const chunk of result.fullStream) {
      trace.record(chunk)
      yield this.transformChunk(chunk)
    }
    trace.complete()
    
    // 7. 提取新记忆（后台）
    this.memoryManager.extractAndSave(result)
  }
}
```

## 10. 数据流（一次完整的聊天请求）

```
1. 用户输入 "帮我整理今天的日记并提取关键句"

2. Renderer → IPC → Main
   chat.send({ conversationId, message })

3. Chat Orchestrator.handleMessage()
   a. memoryManager.retrieve()     → 获取用户偏好
   b. contextWindow.compress()     → 确保不超 token 限制
   c. disclosure.selectTools()     → [diary_read, summarize]
   d. buildSystemPrompt()          → 记忆 + 应用上下文
   e. streamText({ system, messages, tools })

4. AI 返回 tool_call: diary_read({ date: "2026-06-01" })
   → orchestrator 执行 → result 注入上下文
   → observability 记录 (120ms ✓)

5. AI 继续 → tool_call: summarize({ text: "..." })
   → orchestrator 执行 → result 注入
   → observability 记录 (340ms ✓)

6. AI 生成最终文本 → 流式推送到 Renderer
   → observability.complete()     → 记录成本 + 延迟
   → conversationManager.save()   → 持久化消息
   → memoryManager.extract()      → 后台提取新记忆

7. Renderer 显示完整回复 + 底部追踪信息
```

## 11. 安全隐患与对策

| 隐患 | 等级 | 对策 |
|------|:--:|------|
| MCP Server 执行任意命令 | 🔴 | 用户手动启用 + 调用前确认 |
| Tool 注入恶意数据 | 🟡 | 限制 result 大小（截断） |
| 记忆泄露隐私 | 🟡 | 用户可查看/删除，可选完全本地 |
| IPC 被篡改 | 🟢 | contextBridge + contextIsolation |
| API Key 泄露 | 🟡 | 仅存 localStorage，不上传 |
| A2A 无限循环 | 🟡 | maxSteps + 超时熔断 |
| 上下文窗口爆内存 | 🟡 | 自动压缩 + 硬限制 |

## 12. 实现路线图

```
Phase 1: MCP 基础（当前）
├── MCPService 迁移到新架构
├── IPC 通道：listTools / callTool / listResources / readResource / listPrompts
├── 设置页面完善（工具/提示/资源测试）
└── 工具注入到聊天

Phase 2: Skill Registry
├── Skill 统一接口
├── SkillRegistry 实现
├── MCP tools 自动注册为 Skill
└── 内置 Skills（日记、灵感）

Phase 3: 记忆系统 v1-v2
├── 会话内事实提取（Memory Extractor）
├── 应用上下文自动注入
├── user_memories 表 + 本地缓存
└── 记忆在 system prompt 中注入

Phase 4: 渐进式披露
├── v1 关键词匹配
├── 规则过滤
├── Token 预算控制
└── 披露日志

Phase 5: 对话管理
├── conversations + conversation_messages 表
├── 对话列表 + 切换 + 删除
├── 自动标题生成
└── 全文搜索历史

Phase 6: 可观测性
├── ChatTrace 数据模型
├── IPC 实时追踪事件
├── ChatPage 底部状态栏
└── 历史统计面板

Phase 7: 长期记忆 v3-v4
├── pgvector 语义检索
├── 用户偏好学习
├── 跨会话记忆持久化
└── 隐私控制

Phase 8: 上下文窗口管理
├── Token 预估
├── 滑动窗口 + AI 摘要
├── 自动压缩触发
└── 手动压缩

Phase 9: A2A
├── Agent as Skill
├── Agent 间互调
├── 并行调用 + 结果合并
└── Agent 模板市场
```
