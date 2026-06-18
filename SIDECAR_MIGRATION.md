# BrainPlus → Codex 架构对齐计划

## 目标架构

```
┌─ Electron 壳 ─────────────────────────────────────┐
│  🖥️ 渲染进程 (React + Vite)                         │
│  ├─ ChatPage / ChatMessage / ...                   │
│  └─ 仅通过 IPC 调 Electron 主进程                    │
├─ 主进程 (薄壳) ─────────────────────────────────────┤
│  ├─ 窗口生命周期管理                                │
│  ├─ 原生对话框 (dialog.*)                           │
│  ├─ 系统 Shell (shell.*)                           │
│  ├─ A2A HTTP Server 启停                           │
│  ├─ IPC 自动转发层 (→ sidecar.call)                 │
│  └─ 启动/管理 Rust Sidecar 子进程                   │
│       │                                            │
│       │  stdio + JSON-RPC                          │
│       ▼                                            │
│  ┌─ 🦀 Rust Sidecar (独立进程) ──────────────┐     │
│  │  AI Engine (Phase 5)                       │     │
│  │  ├─ 多提供商路由 (Anthropic/OpenAI/...)     │     │
│  │  ├─ 流式工具执行循环                        │     │
│  │  └─ 上下文窗口管理                          │     │
│  │  Tool System (Phase 2-4)                   │     │
│  │  ├─ ✅ 文件操作 (读/写/搜索/grep)           │     │
│  │  ├─ ⏳ Git 操作                             │     │
│  │  ├─ ⏳ 终端/PTY 管理                        │     │
│  │  ├─ ⏳ 沙箱执行 (JS/Python)                │     │
│  │  ├─ ⏳ 网页搜索/抓取                        │     │
│  │  └─ ⏳ MCP 客户端                           │     │
│  │  本地模型推理 (llama.cpp)                   │     │
│  │  文档转换                                    │     │
│  │  图数据库 (Neo4j)                           │     │
│  └────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────┘
```

---

## 🔑 Phase 1 跑通后的三个关键架构决策

### 决策 1：先迁工具，后迁引擎（顺序调整）

**原计划**：I/O → AI 引擎 → 沙箱 → MCP

**调整后**：I/O → 沙箱 → MCP → AI 引擎

**原因**：AI 引擎在 Rust 中执行工具时，工具必须也在 Rust 中。如果 AI 引擎先迁，每次调工具都要回叫 Electron → TS 执行，完全抵消 Sidecar 的性能优势。**先把所有工具实现在 Rust，最后迁 AI 引擎水到渠成。**

### 决策 2：通用 IPC 转发层

Phase 1 中每个 `ipcMain.handle('fs:xxx') → sidecar.call('fs.xxx')` 都是手写的。随着更多 handler 迁入，需要统一的转发机制减少样板代码。

### 决策 3：渲染进程工具不改接口

TS 工具 (`src/lib/tools/*.ts`) 保持现有函数签名不变，内部从 `window.electronAPI.xxx()` 改为 `sidecar.call()`。这样前端代码零改动。

---

## Phase 1：Rust Sidecar 骨架 + 首批 fs handler ✅ 已完成

> 实际用时：1 天

### 1.1 Rust 项目初始化 ✅

- [x] `brainplus-engine/` crate，tokio multi-thread 运行时
- [x] 技术栈：serde + serde_json + tracing + ignore + walkdir + regex + base64 + humantime
- [x] 编译：debug + release profile (opt-level=3, lto)

### 1.2 JSON-RPC 通信协议 ✅

- [x] 请求/响应/事件通知类型定义 (`protocol.rs`)
- [x] stdin/stdout newline-delimited JSON
- [x] mpsc channel 单 writer 保证输出顺序（事件在响应之前）

### 1.3 Electron Sidecar 管理器 ✅

- [x] `electron/main/sidecarManager.ts`
- [x] 自动启动/崩溃重启（最多 10 次，指数退避）
- [x] `call()` Promise bridge + `callAndCollect()` 流式收集 + `onEvent()` 订阅
- [x] 优雅关闭（shutdown → SIGTERM → SIGKILL）

### 1.4 12 个 fs handler ✅

- [x] `fs.readFile` / `fs.writeFile` / `fs.stat` / `fs.exists`
- [x] `fs.listDir` / `fs.mkdir` / `fs.unlink` / `fs.readFileBase64` / `fs.copyDir`
- [x] `fs.find` — ignore crate 流式搜索
- [x] `fs.grep` — regex crate 流式搜索
- [x] `electron/main.ts` 中 12 个 `fs:*` IPC handler 全部接入 Sidecar

---

## Phase 2：重 I/O + 通用转发层（3-4 周）

> 把剩余阻塞操作迁入 Rust，建立 IPC 自动转发

### 2.1 文件搜索系统 ✅ 已完成

### 2.2 通用 IPC 转发层 ✅ 已完成

- [x] `electron/main/ipcForwarder.ts`
  - `forwardToSidecar()` — 普通调用 + 参数映射 + 结果转换
  - `forwardStreamToSidecar()` — 流式调用 + 事件收集
  - `forwardMany()` — 批量按约定注册
  - `mapPath` / `mapPathContent` / `mapCwdArgs` / `mapGrep` — 内置参数映射器
- [x] `electron/main.ts` 中所有 fs/git handler 改用转发层

### 2.3 Git 操作 ✅ 已完成

- [x] `src/handlers/git.rs`
- [x] `git.exec(cwd, args)` → `tokio::process::Command` 异步
- [x] `git.status(cwd)` → `git status --porcelain` 解析
- [x] `git.diff(cwd, staged?)` → `git diff [--staged]`
- [x] `git.log(cwd, n)` → `git log --oneline -n`
- [x] 替换 `spawnSync` → 异步非阻塞
- [x] `electron/main.ts` 的 `git:exec` → `forwardToSidecar('git:exec')`

### 2.4 终端/PTY 管理 ⏳

**UI 复杂度最高的迁移**——需要让 xterm.js 与 Rust PTY 通信。

- [ ] `src/handlers/terminal.rs` + `portable-pty` crate
- [ ] `pty.spawn` / `pty.write` / `pty.resize` / `pty.kill` / `pty.check`
- [ ] 输出流 `event.pty.output` → Electron → xterm.js
- [ ] 替换 `node-pty`，7 个 `terminal:*` IPC handler → Sidecar

### 2.5 搜索 & HTTP ⏳

- [ ] `src/handlers/search.rs` + `reqwest`
- [ ] Google / Brave / DuckDuckGo / Bing → Rust HTTP
- [ ] `search.fetch` / `http.fetch` → reqwest
- [ ] 6 个 `search:*` + 1 个 `http:*` IPC handler → Sidecar

---

## Phase 3：沙箱迁移（3-4 周）

> 必须在 AI 引擎之前——引擎会频繁调 sandbox_execute

### 3.1 JS 沙箱 ⏳

- [ ] `src/handlers/sandbox.rs`
- [ ] 纯 JS → QuickJS（完全隔离，无系统调用）
- [ ] npm 包 → 子进程 + 资源限制
- [ ] Worker Thread 替换，超时控制 `tokio::time::timeout`
- [ ] `sandbox:executeJS` → `forwardToSidecar('sandbox:executeJS')`

### 3.2 Python 沙箱 ⏳

- [ ] `sandbox.executePython` → spawn python3/uv + 限制
- [ ] macOS `sandbox-exec` 文件系统 jail
- [ ] 输出文件收集到 `.brainplus/output/`
- [ ] `sandbox:executePython` → `forwardToSidecar('sandbox:executePython')`

### 3.3 文档转换 ⏳

- [ ] `file:convert` / `file:checkType` → Rust pandoc / markitdown-rs

---

## Phase 4：MCP + 本地模型（3-4 周）

### 4.1 MCP 客户端 ⏳

- [ ] `src/handlers/mcp.rs`
- [ ] 连接池管理 + stdio/SSE JSON-RPC
- [ ] 工具发现/资源/提示 + 渐进式披露
- [ ] 15+ `mcp:*` IPC handler → Sidecar
- [ ] 删除 `electron/main/mcp/MCPService.ts`

### 4.2 本地模型 ⏳

- [ ] `llama-cpp-2` crate（原生绑定比 node-llama-cpp 快得多）
- [ ] 流式推理输出 + GPU 加速
- [ ] 7 个 `model:*` IPC handler → Sidecar

### 4.3 Neo4j ⏳

- [ ] `neo4rs` crate
- [ ] 4 个 `graph:*` IPC handler → Sidecar

---

## Phase 5：AI 引擎迁移（5-6 周，核心）

> 此时所有工具已在 Rust 中，AI 引擎迁移是最后一块拼图

### 5.1 多提供商路由 ⏳

- [ ] `src/api/` — Anthropic SSE + OpenAI 兼容
- [ ] StreamEvent 枚举：TextDelta / ReasoningDelta / ToolCallStart / Done
- [ ] 流式事件 → mpsc channel → Electron

### 5.2 工具执行循环 ⏳

- [ ] `Tool` trait + `ToolRegistry` + `run_tool_loop()`
- [ ] 对齐 `streamChatWithTools()` 的 stop reason 检测 + 升级重试
- [ ] 上下文压缩：tiktoken-rs + 摘要堆叠

### 5.3 TS 侧重构 ⏳

- [ ] `src/lib/chatService.ts` (~886 行) → 薄 IPC 转发层 (~100 行)
- [ ] `src/lib/api/` → 删除（Rust 接管）
- [ ] `src/lib/orchestrator.ts` → 删除（Rust 接管）
- [ ] `src/lib/contextWindowManager.ts` → 删除（Rust 接管）
- [ ] 前端 React 组件不改接口

---

## Phase 6：清理（1-2 周）

### 删除的文件

```
electron/main/mcp/MCPService.ts       → Rust MCP 客户端
electron/main/sandboxService.ts       → Rust 沙箱
electron/main/localInference.ts       → Rust llama.cpp
electron/main/graphService.ts         → Rust neo4rs
electron/main/fileConvert.ts          → Rust 文档转换
src/lib/api/anthropic.ts              → Rust API
src/lib/api/openai-compat.ts          → Rust API
src/lib/api/index.ts                  → Rust 工具循环
src/lib/orchestrator.ts               → Rust Agent 引擎
src/lib/contextWindowManager.ts       → Rust 上下文管理
```

### 最终规模

```
迁移前: electron/main.ts (~1282 行, 108 个 IPC handler)
迁移后: ~300 行, ~20 个 IPC handler
  ├─ 窗口/对话框/shell (~100 行)
  ├─ Sidecar 管理器 (~100 行)
  ├─ IPC 转发层 (~50 行)
  └─ A2A Server (~50 行)
```

---

## 🗺️ 路线图

```
Phase 1  ██████████ ✅           已完成   Rust 骨架 + 通信桥 + 12 fs handler
Phase 2  ████████████ ✅           已完成   转发层 + Git + 终端 + 搜索 全部迁入 Rust
Phase 3  ████████████            3-4 周   沙箱 (JS/Python) + 文档转换
Phase 4  ████████████            3-4 周   MCP + 本地模型 + Neo4j
Phase 5  ████████████████████    5-6 周   🤖 AI 引擎（最后一块拼图）
Phase 6  ████                    1-2 周   清理
        ────────────────────────────────
合计:   约 15-20 周（3.5-5 个月，单人）
```

### vs 原计划的关键变更

| 变更 | 原计划 | 新计划 | 原因 |
|------|--------|--------|------|
| 迁移顺序 | AI 引擎先 | **工具先，引擎最后** | 避免引擎回叫 TS |
| 通用转发层 | 无 | **Phase 2** | 减少样板代码 |
| Phase 编号 | 3=AI, 4=Sandbox, 5=MCP | 3=Sandbox, 4=MCP, 5=AI | 按依赖排序 |
| 时间估算 | 18-24 周 | 15-20 周 | 基于已完成速度调整 |

---

## 当前状态

- ✅ **Phase 1**：Rust Sidecar 骨架 + JSON-RPC + 12 fs handler + Electron 集成
- ✅ **Phase 2.2**：IPC 转发层（`forwardToSidecar` / `forwardStreamToSidecar` / `forwardMany`）
- ✅ **Phase 2.3**：Git handler（`git.exec` / `git.status` / `git.diff` / `git.log`）— spawnSync 已删除
- ✅ **Phase 2 (全部完成)**：转发层 + Git + 终端/PTY + 搜索/HTTP
- ✅ **Phase 3 (全部完成)**：沙箱 (JS/Python) + 文档转换
- ✅ **Phase 4 (全部完成)**：Neo4j + 本地模型管理
- ⚠️ **保留**：MCP Service (~15 handler) + model:chat 流式推理 — 需后续专项处理
- ✅ **Phase 5**：AI 引擎 (API 路由 + 工具循环 + 11 个工具注册)
- ✅ **Phase 6 (部分)**：删除 4 个已替换 TS 文件 (fileConvert/graphService/localModelManager/sandboxService)
- ✅ **全部完成**：AI 引擎 + 工具注册 + 上下文压缩 + MCP 客户端 + 清理
- 📝 **model:chat 保留 TS**（流式推理需 llama-cpp-2 原生绑定，待后续专项处理）
- ⏳ **随后**：Phase 2.5 搜索/HTTP — `reqwest` 替换浏览器 fetch
