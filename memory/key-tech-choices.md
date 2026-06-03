---
name: key-tech-choices
description: 项目关键技术选型与实际实现的差异
metadata:
  type: reference
---

## 技术栈
- 前端：React + TypeScript + Vite
- 桌面：Electron
- AI 通信：IPC 桥接（renderer ↔ main process）
- 数据库：Supabase（PostgreSQL + pgvector）+ 本地 JSON 文件

## 架构文档设计 vs 实际实现差异

| 设计 | 实际 |
|------|------|
| QuickJS WASM JS 沙箱 (~2MB) | Node.js Worker Threads（更重） |
| @runno/sandbox Python WASM | child_process 直接调用 |
| Supabase conversations 表 | 本地 JSON 文件存储 |
| Supabase chat_traces 表 | 内存中，未持久化 |
| ONNX 本地嵌入模型语义过滤 | 仅 v1 关键词匹配 |

**Why:** 快速迭代优先，部分设计用更简单的方案先行，后续替换。
**How to apply:** 在 Phase 完善阶段逐步替换为设计中的方案。参见 [[project-status]] 中的 P4-P5 优先级。
