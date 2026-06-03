---
name: project-status
description: BrainPlus 项目各阶段完成状态与未完成工作追踪
metadata:
  type: project
---

# BrainPlus 项目进度（截至 2026-06-03）

## ✅ 已完成

| 阶段 | 内容 | 关键文件 |
|------|------|----------|
| Phase 1 | MCP 基础：MCPService、IPC 通道、工具注入 | `electron/main/mcp/MCPService.ts`, `main.ts:57-129` |
| Phase 2a | Skills 安装：SKILL.md 解析、npx/uvx 进程管理、安装表单 | `src/lib/skillService.ts`, `skillParser.ts`, `skillDiskStore.ts` |
| Phase 2c | 沙箱执行：JS (Node Worker) + Python (child_process) | `electron/main/sandboxService.ts` |
| Phase 4 | 渐进式披露 v1：关键词匹配 + 规则过滤 + Token 预算 | `src/lib/toolDisclosure.ts` |
| Phase 5 | 对话管理：CRUD（本地 JSON）、对话列表、重命名、删除 | `electron/main/conversationStore.ts`, `ConversationBar.tsx` |
| Phase 6 | 可观测性：ChatTrace 数据模型、Token/延迟/成本估算 | `src/lib/observability.ts` |
| Phase 8 | 上下文窗口管理：Token 预估、滑动窗口 + AI 摘要、自动压缩、TokenUsageBar | `src/lib/contextWindowManager.ts`, `src/components/ai/TokenUsageBar.tsx` |

## ❌ 未完成

### 🔴 Phase 3 + 7：记忆系统（完全缺失）
- 无 MemoryManager 实现
- 无 user_memories 表（Supabase SQL 中不存在）
- 无会话事实自动提取（MemoryExtractor）
- 无 pgvector 语义检索
- 无跨会话记忆持久化

### 🔴 Phase 9：A2A Agent 编排（完全缺失）
- 无 Agent 注册/互调
- 无 Agent 并行调用 + 结果合并
- 无 Agent 模板市场

### 🟡 Phase 2b：部分缺失
- Skill 安装时 scripts/ 目录未自动生成 MCP wrapper tool
- Skill 启用时 system prompt 注入不完整
- 内置 Skills 未封装为统一 Skill 接口

### 🟡 具体功能缺失
1. 拖拽文件上传 → workspace/input/（`workspace.ts:5` 注释确认）
2. AI 自动标题生成
3. 全文搜索历史消息
4. Supabase 云端同步（对话当前仅本地 JSON）
5. 可观测性数据持久化（chat_traces 仅内存）
6. v2 嵌入模型语义过滤（当前仅 v1 关键词）
7. QuickJS WASM 沙箱（实际用 Node Worker Threads）
8. @runno/sandbox Python（实际用 child_process）
9. ChatPage 底部实时状态栏待确认

### 🟢 Supabase 缺失表
- conversations + conversation_messages
- user_memories（含 pgvector）
- chat_traces

## 优先级建议

| 优先级 | 内容 | 原因 |
|--------|------|------|
| 🔴 P0 | Phase 3 记忆系统 v1 | 会话内事实提取，提升 AI 理解能力 |
| 🟡 P1 | Supabase 对话云端同步 | 跨设备数据 |
| 🟡 P1 | chat_traces 持久化 | 可观测性积累 |
| 🟢 P2 | 拖拽文件上传 | workspace 打通 |
| 🟢 P2 | AI 自动标题 / 全文搜索 | 对话管理增强 |
| 🔵 P3 | Phase 7 长期记忆 | 需 pgvector |
| 🔵 P3 | Phase 9 A2A | 高级架构能力 |
| ⚪ P4 | 移动端（brainPlusMobile） | 仅 Hello World |
| ⚪ P4 | v2 嵌入模型语义过滤 | v1 当前够用 |

**Why:** 需要对项目进度有全局视图，避免遗漏关键功能。
**How to apply:** 每完成一个 phase 后更新此文件，调整优先级。
