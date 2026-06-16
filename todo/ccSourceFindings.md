# CC 源码泄漏高含金量分析

## 1. 工具结果持久化系统 🔴

**发现**：CC 不会把大工具结果留在 context 里，而是：
- 超过 50K 字符→写入磁盘 session 目录
- 替换为 `<persisted-output>path</persisted-output>` XML 标签
- 模型需要时可以引用，但不占 context
- 每轮 tool_result 总预算 200K 字符

**BrainPlus 现状**：工具结果直接拼在 messages 里，bloat context。

**改进**：ChatPage 接收 tool-result 时截断超大结果，存到文件，替换为占位符。

## 2. 工具结果自动清理 🟡

**发现**：CC 有 `TOOL_RESULT_CLEARED_MESSAGE = '[Old tool result content cleared]'` 机制，旧工具结果自动清理。

**改进**：长对话中自动清理旧 tool 消息的 content（保留 toolCall status，内容清空）。

## 3. system-reminder 上下文注入 ✅ 已实现

**发现**：CC 的 `prependUserContext` 把日期/git状态/claudeMd 分为：
- `<project-instructions>` — 高权重 user message
- `<system-reminder>` — 低权重（"may or may not be relevant"）

**BrainPlus**: ✅ 已实现

## 4. 工具结果格式化 🟡

**发现**：CC 的 tool-result 用 `jsonStringify` 慢操作避免阻塞 event loop。大结果写入后不立即 GC。

**改进**：我们的 `String(event.toolOutput ?? '')` 可能对超大结果有性能问题。加个 size check。

## 5. 每次 turn 的 context 重构

**发现**：CC 的 `getUserContext` 和 `getSystemContext` 都是 memoized，只在 cwd 变化或 /clear 时重建。减少重复计算。

**改进**：我们的 rules.md 读取可以 memoize。

## 优先级

| 优先级 | 条目 | 难度 |
|--------|------|------|
| 🔴 | 1. 工具结果持久化——超大结果写磁盘不占 context | 中 |
| 🟡 | 2. 工具结果自动清理——旧结果替换为占位符 | 低 |
| 🟡 | 3. 工具结果 size check——超大结果截断提示 | 低 |
