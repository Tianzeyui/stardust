---
name: architecture-design
description: AI_ARCHITECTURE.md 中定义的分层架构设计与核心概念
metadata:
  type: reference
---

BrainPlus 的分层 AI 架构，定义在 `AI_ARCHITECTURE.md` 中，分为 9 个 Phase：

1. **Phase 1 - MCP 协议基础**：Electron IPC 通道，工具注册/发现协议
2. **Phase 2a - Skills 安装**：SKILL.md 解析，npx/uvx 进程管理
3. **Phase 2b - Skills 工具化**：scripts/ 自动生成 MCP wrapper，system prompt 注入
4. **Phase 2c - 沙箱执行**：JS (QuickJS WASM) + Python (@runno/sandbox) 隔离执行
5. **Phase 3 - 记忆系统 v1-v2**：会话内事实提取，本地 SQLite 存储
6. **Phase 4 - 渐进式披露 v1-v2**：v1 关键词匹配 → v2 ONNX 嵌入语义过滤
7. **Phase 5 - 对话管理**：CRUD、云同步、全文搜索
8. **Phase 6 - 可观测性**：ChatTrace、Token/延迟/成本追踪
9. **Phase 7 - 长期记忆**：pgvector 跨会话语义检索
10. **Phase 8 - 上下文窗口管理**：Token 预估、自动压缩、滑动窗口
11. **Phase 9 - A2A Agent 编排**：Agent 注册、并行调用、模板市场

完整路线图参见 [[project-status]]。
