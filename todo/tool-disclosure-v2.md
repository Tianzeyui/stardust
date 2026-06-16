# 渐进式披露 v2 — 对齐 CC 拉取模式

> 目标：从"推送 Top-N + 目录"改为 CC 的"按需搜索 + 按需执行"
> 参考：CC `SearchExtraTools` + `ExecuteExtraTool` 双层模式

---

## ✅ Phase 1: 内置工具显式白名单

**文件**：`src/lib/chatService.ts`
**状态**：已实现

**问题**：当前靠命名规则（`includes('__')`）推断工具分类，脆弱。

**方案**：声明 `CORE_TOOL_NAMES` 白名单，不在白名单内且含 `__` 的均为 MCP。

```typescript
// 所有不需要披露过滤的工具名/前缀
const CORE_TOOL_PREFIXES = [
  // 文件操作
  'workspace_',
  // Git
  'git_',
  // 沙箱
  'sandbox_',
  // 终端
  'run_terminal', 'check_terminal', 'run_terminal_input',
  // 网络
  'web_fetch', 'web_search', 'search_bing', 'search_duckduckgo',
  // MCP 网关
  'mcp_list', 'mcp_read', 'mcp_get',
  // Agent 系统
  'ask_user', 'show_progress', 'notify_complete', 'update_task_list',
  'delegate_task', 'delegate_batch', 'delegate_chain',
  // A2A Agent + 插件
  'agent__', 'plugin__',
  // Skill + 激活
  'read_skill', 'enable_tool', 'search_tools', 'use_tool',
]

function isCoreTool(name: string): boolean {
  return CORE_TOOL_PREFIXES.some(p => name.startsWith(p))
}
```

**验收**：分类不从命名推断，改为显式声明。

---

## ✅ Phase 2: `enable_tool` → `search_tools` + `use_tool`

**文件**：`src/lib/chatService.ts`
**状态**：已实现

**改动**：

### 2a. remove `enable_tool`

删除现有 `enable_tool` 注册代码（第 392-435 行附近的整个块）。

### 2b. add `search_tools`

```typescript
search_tools: {
  description: '搜索可用的额外工具。当你需要一个不在当前工具列表中的能力时调用此工具——描述你需要什么，系统会返回匹配的工具名和参数签名。找到后用 use_tool 调用。',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '描述你需要什么能力，例如"查询数据库"、"发送HTTP请求"、"搜索文件"' },
    },
    required: ['query'],
  },
  execute: async ({ query }) => {
    // 从 fullToolSet 中筛选匹配的 MCP 工具
    const mcpTools = Object.entries(fullToolSet)
      .filter(([name]) => name.includes('__') && !isCoreTool(name))
    // 关键词打分（先用简单版，后续换 TF-IDF）
    const scored = mcpTools.map(([name, tool]: [string, any]) => ({
      name,
      description: tool.description || '',
      score: scoreByKeywords(query, name, tool.description || ''),
    }))
    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, 5)
    if (top.length === 0) return '未找到匹配的工具。请换个描述试试。'
    return top.map(t => `- ${t.name}: ${t.description}`).join('\n')
  },
}
```

### 2c. add `use_tool`

```typescript
use_tool: {
  description: '调用一个通过 search_tools 发现的额外工具。传入工具名和参数，系统会执行该工具并返回结果。',
  inputSchema: {
    type: 'object',
    properties: {
      tool_name: { type: 'string', description: '工具名称（来自 search_tools 返回结果）' },
      params: { type: 'object', description: '传递给该工具的参数' },
    },
    required: ['tool_name'],
  },
  execute: async ({ tool_name, params }) => {
    const tool = fullToolSet[tool_name] as any
    if (!tool) return `工具 "${tool_name}" 不存在。请先调用 search_tools 查找可用工具。`
    try {
      return await tool.execute(params || {})
    } catch (e: any) {
      return `调用 ${tool_name} 失败: ${e.message}`
    }
  },
}
```

---

## ✅ Phase 3: 扩充预检关键词

**文件**：`src/lib/chatService.ts` 第 270 行
**状态**：已实现——从 20 个扩展到 45 个关键词，覆盖了"分析"、"看"、"查"等常见中文编码意图

**当前**：
```typescript
const codeHints = ['fix', 'edit', 'change', 'write', 'create', 
  'implement', 'refactor', 'debug', 'error', 'test', 'build', 
  'install', 'deploy', '改', '修', '写', '实现', '创建', '重构', 'bug']
```

**改进**：
```typescript
const codeHints = [
  // 英文
  'fix', 'edit', 'change', 'write', 'create', 'implement', 
  'refactor', 'debug', 'error', 'test', 'build', 'install', 'deploy',
  'review', 'search', 'find', 'check', 'look', 'examine', 'analyze',
  'add', 'remove', 'delete', 'update', 'modify', 'rename', 'move',
  // 中文
  '改', '修', '写', '实现', '创建', '重构', 'bug',
  '分析', '看', '查', '找', '搜索', '加', '删', '改', '帮',
]
```

---

## ✅ Phase 4: 移除工具目录注入

**文件**：`src/lib/chatService.ts`
**状态**：已实现——`toolCatalog` 已删除，`systemPrompt = [agentRules, skillInjection]` 不再包含 MCP 工具目录

**改动**：删除第 437-455 行构造 `toolCatalog` 并注入系统提示词的代码。

**原因**：`search_tools` 替代了工具目录的作用。不再需要在系统提示词里预装 50 个 MCP 工具的描述。

**保留**：`skillInjection`（技能仍然需要三级注入）、`agentRules`（系统提示词）

---

## ✅ Phase 5: 清理冗余代码

**文件**：`src/lib/toolDisclosure.ts` + `src/lib/chatService.ts` + `src/components/ai/ChatPage.tsx`
**状态**：已实现

改动清单：
1. `toolDisclosure.ts`：删除 `extractToolInfo` 和冗余的 `alwaysKeep` 集合，精简为纯工具函数（`tokenize` + `scoreByKeywords` + `DisclosureResult` 类型）
2. `chatService.ts`：删除 `opts?.selectedTools` 加载时过滤逻辑 + `disclosureThreshold` + 旧的 `fullToolSet` 声明
3. `ChatPage.tsx`：删除 `selectedMCPTools` 状态 + `disclosureThreshold` 状态 + 相关 props

---

## ✅ Phase 6 (追加): 工具开关改为执行时拦截

**状态**：已实现

- 删除了 `selectedTools`（MCP 工具逐个勾选）——v2 下拉取模式不再需要
- 安全开关（终端、沙箱）在注册时控制工具是否存在，`use_tool` 执行时自然拦截
- 发现和执行分离：`search_tools` 搜得到 ≠ 能执行，被安全开关禁用的工具不会在 `fullToolSet` 中

---

## 实施总结

```
Phase 1: ✅ 白名单     → chatService.ts
Phase 2: ✅ search/use  → chatService.ts  
Phase 3: ✅ 关键词     → chatService.ts
Phase 4: ✅ 删目录     → chatService.ts
Phase 5: ✅ 清理       → toolDisclosure.ts + chatService.ts + ChatPage.tsx
Phase 6: ✅ 开关拦截   → chatService.ts + ChatPage.tsx
```

全部 5+1 个 Phase 完成。
